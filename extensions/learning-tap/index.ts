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
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { findGraphRoot as findGraphRootPure, graphifyPython, OUT } from "../lib/graph-lookup.ts";
import {
	addEvent,
	answerFrom,
	appendEvents,
	cap,
	extractReturns,
	isSubstantiveQuery,
	type LearningEvent,
	makeEvent,
	parseVerdict,
	QA_AGENTS,
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

	pi.on("session_start", async (_event, ctx) => {
		buffer = [];
		cwd = ctx.cwd || "/";
		sessionId = ctx.sessionId ?? "";
	});

	// --- query + verdict taps: one observer on the stream we already get ----
	pi.on("tool_result", async (event) => {
		try {
			const text = answerFrom(event.content);

			if (event.toolName === "graph") {
				const input = (event.input ?? {}) as { action?: string; q?: string };
				const action = String(input.action ?? "");
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
			category: Type.Union(
				["correction", "gotcha", "environment", "workflow", "convention", "orchestration"].map((c) =>
					Type.Literal(c),
				),
			),
			scope: Type.Union([Type.Literal("global"), Type.Literal("project")], { default: "global" }),
			evidence: Type.Array(Type.String(), {
				description: "Pointers backing the lesson: file:line, session:<id>, verdict text, doc path.",
				minItems: 1,
			}),
			basis: Type.Optional(
				Type.Union(
					["user-confirmed", "directly-observed", "reproduced", "documented"].map((b) => Type.Literal(b)),
				),
			),
		}),
		async execute(_toolCallId, params) {
			const p = params as {
				text: string;
				category: string;
				scope: string;
				evidence: string[];
				basis?: string;
			};
			const ev = makeEvent(
				"explicit",
				{
					text: cap(p.text, USERTEXT_CAP),
					category: p.category,
					scope: p.scope,
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
						type: "text",
						text: ok
							? `Lesson buffered for the nightly distiller (${ev.id}). It will be deduped against the oracle before storage.`
							: "Duplicate of an already-buffered lesson this session (or session cap reached) — skipped.",
					},
				],
			};
		},
	});

	// --- flush ---------------------------------------------------------------
	pi.on("session_shutdown", async (_event, ctx) => {
		try {
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
