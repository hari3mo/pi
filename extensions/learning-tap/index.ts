/**
 * Learning-Tap Extension — mechanized capture for the learning pipeline.
 *
 * Observes events that ALREADY HAPPEN and appends them to
 * ~/.pi/agent/learning/events.jsonl at session shutdown (zero LLM, fail-open,
 * bounded). The out-of-session distiller (Hermes nightly cron) does all
 * triage/promotion — see learning/SCHEMA.md for the shared contract.
 *
 * Taps (v1):
 *   query    — substantive `graph` query/explain answers (absorbs
 *              knowledge-compound.ts; its graphify save-result flush is kept
 *              so `graphify reflect` still gets fed).
 *   verdict  — peer/doctor verdict lines parsed from subagent tool returns.
 *   explicit — the `learn` tool (replaces direct heuristics writes; the
 *              distiller dedupes against oracle/heuristics before storing).
 *
 * Deliberately NOT here yet: correction tap (needs a precision-tested
 *              heuristic), violation tap (one-line emits belong in the guard
 *              extensions themselves; wired when those files are next touched).
 *
 * Pure logic lives in lib.ts (checked by scripts/check-learning-tap.mjs).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { BasisSchema, CategorySchema, ScopeSchema } from "../heuristics/schema.ts";
import { findGraphRoot as findGraphRootPure, graphifyPython, OUT } from "../lib/graph-lookup.ts";
import { ORACLE_VAULT } from "../lib/knowledge-router.ts";
import {
	addEvent,
	answerFrom,
	appendEvents,
	appendReceipt,
	cap,
	extractReturns,
	heuristicIdsFrom,
	isCorrectionCandidate,
	isSubstantiveQuery,
	type LearningEvent,
	makeEvent,
	MAX_CORRECTIONS_PER_SESSION,
	parseVerdict,
	QA_AGENTS,
	type QaVerdict,
	type Receipt,
	USERTEXT_CAP,
} from "./lib.ts";

const LEARNING_DIR = join(getAgentDir(), "learning");
const SAVE_TIMEOUT_MS = 2000;
const MAX_GRAPHIFY_SAVES = 3; // knowledge-compound's cap, kept for the reflect feed

function findSessionGraphRoot(cwd: string): string | undefined {
	const found = findGraphRootPure(cwd);
	if (found) return found;
	const agentDir = getAgentDir();
	return existsSync(join(agentDir, OUT, "graph.json")) ? agentDir : undefined;
}

export default function (pi: ExtensionAPI) {
	let buffer: LearningEvent[] = [];
	let cwd = "/";
	let sessionId = "";
	// Receipt accumulators (MEASURE side — learning/SCHEMA.md receipts.jsonl)
	let oraclePagesRead: Set<string> = new Set();
	let graphQueries = 0;
	let lastVerdict: QaVerdict | null = null;
	let correctionsCaptured = 0;
	// Correction tap: the agent's last visible action, for precedingAction context.
	let lastToolLabel = "";

	pi.on("session_start", async (_event, ctx) => {
		buffer = [];
		cwd = ctx.cwd || "/";
		sessionId = ctx.sessionManager.getSessionFile?.() ?? "<unknown>";
		oraclePagesRead = new Set();
		graphQueries = 0;
		lastVerdict = null;
		correctionsCaptured = 0;
		lastToolLabel = "";
	});

	// --- violation tap: guard extensions emit on the shared bus ------------
	// oracle-first / graph-first emit "learning-violation" at nudge/block
	// (same bus pattern as concurrency-guard -> self-audit). Payload:
	// { doctrine: "oracle-first"|"graph-first"|"budget", detail: string }.
	pi.events.on("learning-violation", (v: { doctrine?: string; detail?: string }) => {
		try {
			addEvent(
				buffer,
				makeEvent(
					"violation",
					{ doctrine: String(v?.doctrine ?? "unknown"), detail: cap(String(v?.detail ?? ""), 500) },
					[`session:${sessionId}`],
					sessionId,
					cwd,
				),
			);
		} catch {
			/* never wedge the bus */
		}
	});

	// --- correction tap: user inputs that reverse/amend the agent ----------
	pi.on("input", async (event) => {
		try {
			if (event.source !== "interactive") return; // only real user prose
			if (correctionsCaptured >= MAX_CORRECTIONS_PER_SESSION) return;
			if (!isCorrectionCandidate(event.text)) return;
			const added = addEvent(
				buffer,
				makeEvent(
					"correction",
					{
						precedingAction: cap(lastToolLabel, 200),
						userText: cap(event.text.trim(), USERTEXT_CAP),
						basis: "inferred",
					},
					[`session:${sessionId}`],
					sessionId,
					cwd,
				),
			);
			if (added) correctionsCaptured++;
		} catch {
			/* never interfere with input handling */
		}
		return; // explicit: never transform/handle the input
	});

	// --- query + verdict taps: one observer on the stream we already get ----
	pi.on("tool_result", async (event) => {
		try {
			const text = answerFrom(event.content);
			// Track the last tool action for correction context (cheap label).
			lastToolLabel = `${event.toolName}: ${cap(JSON.stringify(event.input ?? {}), 150)}`;

			// Receipt: oracle page reads (mirrors oracle-first's consult signal).
			if (event.toolName === "read") {
				const raw = (event.input as { path?: string; file_path?: string })?.path ??
					(event.input as { file_path?: string })?.file_path;
				if (raw) {
					const abs = resolve(cwd || "/", String(raw));
					if (abs.startsWith(`${ORACLE_VAULT}/`)) oraclePagesRead.add(abs.slice(ORACLE_VAULT.length + 1));
				}
				return;
			}

			if (event.toolName === "graph") {
				const input = (event.input ?? {}) as { action?: string; q?: string };
				const action = String(input.action ?? "");
				graphQueries++;
				if (!isSubstantiveQuery(action, Boolean(event.isError), text)) return;
				addEvent(
					buffer,
					makeEvent(
						"query",
						{ tool: "graph", action, question: String(input.q ?? ""), answer: cap(text, 4000) },
						[`session:${sessionId}`],
						sessionId,
						cwd,
					),
				);
				return;
			}

			if (event.toolName === "subagent" && !event.isError) {
				for (const ret of extractReturns(event.input ?? {}, text)) {
					if (ret.agent && !QA_AGENTS.has(ret.agent)) continue;
					const verdict = parseVerdict(ret.text);
					if (!verdict) continue;
					const role = ret.agent || (ret.text.includes("[VERDICT:") ? "peer" : "doctor");
					lastVerdict = verdict;
					addEvent(
						buffer,
						makeEvent(
							"verdict",
							{ role, verdict, findings: cap(ret.text, 4000), taskSpecHash: "" },
							[`session:${sessionId}`],
							sessionId,
							cwd,
						),
					);
				}
			}
		} catch {
			/* never wedge a tool result */
		}
	});

	// --- explicit tap: the `learn` tool ------------------------------------
	pi.registerTool({
		name: "learn",
		label: "Learn",
		description:
			"File a durable, generalizable lesson into the learning pipeline (learning/events.jsonl). " +
			"The nightly distiller dedupes against the oracle vault and heuristics store, then promotes. " +
			"One imperative sentence; evidence pointers required.",
		parameters: Type.Object({
			text: Type.String({ description: "One imperative, self-contained, generalizable sentence." }),
			category: CategorySchema,
			scope: ScopeSchema,
			evidence: Type.Array(Type.String(), {
				description: "Pointers backing the lesson: file:line, session:<id>, verdict text, doc path.",
				minItems: 1,
			}),
			basis: Type.Optional(BasisSchema),
		}),
		async execute(_toolCallId, params) {
			const p = params as {
				text: string;
				category: string;
				scope?: string;
				evidence: string[];
				basis?: string;
			};
			const ev = makeEvent(
				"explicit",
				{
					text: cap(p.text, USERTEXT_CAP),
					category: p.category,
					scope: p.scope ?? "global",
					basis: p.basis ?? "directly-observed",
				},
				p.evidence,
				sessionId,
				cwd,
			);
			const ok = addEvent(buffer, ev);
			return {
				content: [
					{
						type: "text" as const,
						text: ok
							? `Lesson buffered for the nightly distiller (${ev.id}). It will be deduped against the oracle before storage.`
							: "Duplicate of an already-buffered lesson this session (or session cap reached) — skipped.",
					},
				],
				details: { buffered: ok, eventId: ok ? ev.id : undefined },
			};
		},
	});

	// --- flush ---------------------------------------------------------------
	pi.registerCommand("learning", {
		description: "Learning-pipeline stats: events, receipts, top heuristics, eviction candidates",
		handler: async (_args, ctx) => {
			try {
				const lines: string[] = [];
				const eventsPath = join(LEARNING_DIR, "events.jsonl");
				const receiptsPath = join(LEARNING_DIR, "receipts.jsonl");
				const kinds = new Map<string, number>();
				if (existsSync(eventsPath)) {
					for (const line of readFileSync(eventsPath, "utf8").split("\n")) {
						if (!line.trim()) continue;
						try {
							const k = (JSON.parse(line) as { kind?: string }).kind ?? "?";
							kinds.set(k, (kinds.get(k) ?? 0) + 1);
						} catch {
							/* skip */
						}
					}
				}
				const receipts = existsSync(receiptsPath)
					? readFileSync(receiptsPath, "utf8").split("\n").filter((l) => l.trim()).length
					: 0;
				lines.push(`events: ${[...kinds.entries()].map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}`);
				lines.push(`receipts: ${receipts} session(s)`);

				// Heuristics by reinforcement (both stores), plus never-reinforced count.
				const stores = [
					join(getAgentDir(), "heuristics", "heuristics.jsonl"),
					join(ctx.cwd, ".pi", "heuristics", "heuristics.jsonl"),
				];
				const heur: { id: string; text: string; hits: number; created: string }[] = [];
				for (const s of stores) {
					if (!existsSync(s)) continue;
					for (const line of readFileSync(s, "utf8").split("\n")) {
						const t = line.trim();
						if (!t || t.startsWith("#")) continue;
						try {
							const h = JSON.parse(t) as { id?: string; text?: string; hits?: number; created?: string };
							if (h.id) heur.push({ id: h.id, text: h.text ?? "", hits: h.hits ?? 0, created: h.created ?? "" });
						} catch {
							/* skip */
						}
					}
				}
				const top = [...heur].sort((a, b) => b.hits - a.hits).slice(0, 5);
				lines.push(`heuristics: ${heur.length} stored`);
				for (const h of top) lines.push(`  ${h.hits}× ${h.text.slice(0, 80)}${h.text.length > 80 ? "…" : ""}`);
				const STALE_DAYS = 30;
				const staleMs = Date.now() - STALE_DAYS * 86400_000;
				const evictable = heur.filter((h) => h.hits === 0 && Date.parse(h.created || "") < staleMs);
				lines.push(
					`eviction candidates (0 hits, >${STALE_DAYS}d old): ${evictable.length}` +
						(evictable.length > 0 ? ` — next distiller run reviews: ${evictable.slice(0, 3).map((h) => h.id).join(", ")}${evictable.length > 3 ? ", …" : ""}` : ""),
				);
				const digests = join(LEARNING_DIR, "digests");
				lines.push(`digests: ${existsSync(digests) ? "see " + digests : "none yet"}`);
				ctx.ui.notify(lines.join("\n"), "info");
			} catch (e) {
				ctx.ui.notify(`learning stats failed: ${e instanceof Error ? e.message : String(e)}`, "warning");
			}
		},
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		try {
			// Receipt first: written even for event-less sessions, so MEASURE can
			// see sessions where injected knowledge produced no new lessons (the
			// "consumed but nothing happened" signal eviction needs).
			try {
				const ids: string[] = [];
				for (const store of [
					join(getAgentDir(), "heuristics", "heuristics.jsonl"),
					join(ctx.cwd, ".pi", "heuristics", "heuristics.jsonl"),
				]) {
					// Approximates the injected set: injection reads these same
					// stores at before_agent_start (heuristics DESIGN.md §8).
					if (existsSync(store)) ids.push(...heuristicIdsFrom(readFileSync(store, "utf8")));
				}
				appendReceipt(LEARNING_DIR, {
					session: sessionId,
					ts: new Date().toISOString(),
					cwd: ctx.cwd,
					heuristicIdsInjected: ids,
					oraclePagesRead: [...oraclePagesRead],
					graphQueries,
					correctionsCaptured,
					violations: buffer.filter((b) => b.kind === "violation").length,
					outcome: lastVerdict,
				} satisfies Receipt);
			} catch {
				/* receipts are best-effort */
			}

			if (buffer.length === 0) return;
			appendEvents(LEARNING_DIR, buffer);

			// Keep feeding graphify reflect (absorbed from knowledge-compound.ts):
			// substantive graph answers also go to `graphify save-result`.
			const queries = buffer.filter((b) => b.kind === "query").slice(0, MAX_GRAPHIFY_SAVES);
			if (queries.length > 0) {
				const root = findSessionGraphRoot(ctx.cwd);
				const py = root ? graphifyPython(root) : undefined;
				if (root && py) {
					for (const q of queries) {
						const p = q.payload as { question: string; answer: string; action: string };
						try {
							execFileSync(
								py,
								[
									"-m",
									"graphify",
									"save-result",
									"--question",
									p.question,
									"--answer",
									p.answer,
									"--type",
									p.action,
									"--outcome",
									"useful",
								],
								{ cwd: root, timeout: SAVE_TIMEOUT_MS, stdio: "ignore" },
							);
						} catch {
							/* best-effort */
						}
					}
				}
			}
			buffer = [];
		} catch {
			/* never block shutdown */
		}
	});
}
