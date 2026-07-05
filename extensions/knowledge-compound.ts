/**
 * Knowledge-Compound Extension
 *
 * Mechanizes knowledge WRITE-BACK ("query-compounding") so it stops depending
 * on the lead remembering to run `graphify save-result` or to file pi-knowledge
 * answers back into the oracle vault. Both were prose-only / manual steps today.
 *
 * During a session it OBSERVES every `graph` tool call via pi's generic
 * `tool_result` event (graphify-bridge.ts exposes no observation hook of its
 * own, and per the task it must not be edited). Substantive query/explain
 * answers are buffered in memory. At `session_shutdown` it FLUSHES — no LLM, no
 * prompts, no user interaction (extensions cannot dispatch slash commands or
 * reach the LLM from event hooks in this pi version):
 *
 *   `graphify save-result --outcome useful ...` for each buffered query, so the
 *   answer feeds `graphify reflect` → graphify-out/reflections/LESSONS.md.
 *
 * It does NOT stage anything into oracle/_raw: the `graph` tool only ever emits
 * node/edge dumps (never distilled prose), which are regenerable on demand and
 * were pure noise in the prose vault. `reflect` is the real distiller; the
 * save-result channel feeds it. Distilled oracle pages are authored by hand.
 *
 * Volume discipline: dedupe by (action, normalized-question), cap at MAX_ITEMS
 * per session, skip trivial/failed queries via a cheap textual filter
 * (isSubstantive). Fail-open and silent on ANY error — never block shutdown.
 *
 * The buffering + argv construction are pure exported functions so the flush
 * logic is checkable without pi: scripts/check-knowledge-compound.mjs.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGraphRoot as findGraphRootPure, graphifyPython, OUT } from "./lib/graph-lookup.ts";

const MAX_ITEMS = 3; // cap durable candidates per session
const MIN_ANSWER_CHARS = 200; // durability floor: below this, not worth compounding
const ANSWER_CAP = 4000; // keep staged notes / save-result args compact
const SAVE_TIMEOUT_MS = 2000; // per save-result call bound
const CAPTURED_ACTIONS = new Set(["query", "explain"]); // status/path are not durable knowledge

function findSessionGraphRoot(cwd: string): string | undefined {
	const found = findGraphRootPure(cwd);
	if (found) return found;
	const agentDir = getAgentDir();
	return existsSync(join(agentDir, OUT, "graph.json")) ? agentDir : undefined;
}

export interface Captured {
	key: string;
	action: string;
	question: string;
	answer: string;
}

export interface RawCandidate {
	action: string;
	question: string;
	answer: string;
	isError: boolean;
}

/** Collapse case/whitespace so trivially-reworded repeats dedupe. */
export function normalizeQuestion(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function candidateKey(action: string, question: string): string {
	return `${action}::${normalizeQuestion(question)}`;
}

/**
 * Cheap textual durability filter. ponytail: naive length + known-non-answer
 * prefix scan — upgrade to a real usefulness signal (did the lead act on the
 * answer this turn?) only if the staged/saved stream shows noise.
 */
export function isSubstantive(action: string, isError: boolean, answer: string): boolean {
	if (isError) return false;
	if (!CAPTURED_ACTIONS.has(action)) return false;
	const a = (answer ?? "").trim();
	if (a.length < MIN_ANSWER_CHARS) return false;
	if (/^(Error:|graphify error:|No graphify-out|\(no output\))/.test(a)) return false;
	return true;
}

/**
 * Filter → dedupe → cap, applied incrementally. Mutates `buffer`; returns true
 * iff the raw candidate was added. Same code path the live handler uses, so the
 * self-check exercises the real logic.
 */
export function addCandidate(buffer: Captured[], raw: RawCandidate, max = MAX_ITEMS): boolean {
	if (!isSubstantive(raw.action, raw.isError, raw.answer)) return false;
	if (buffer.length >= max) return false;
	const key = candidateKey(raw.action, raw.question);
	if (buffer.some((b) => b.key === key)) return false;
	buffer.push({
		key,
		action: raw.action,
		question: raw.question.trim(),
		answer: raw.answer.trim().slice(0, ANSWER_CAP),
	});
	return true;
}

/** argv AFTER the interpreter/module — i.e. `graphify save-result ...`. */
export function buildSaveResultArgs(item: Captured): string[] {
	return [
		"save-result",
		"--question",
		item.question,
		"--answer",
		item.answer,
		"--type",
		item.action,
		"--outcome",
		"useful",
	];
}

function answerFrom(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: string; text: string } => !!c && (c as { type?: string }).type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	let buffer: Captured[] = [];

	pi.on("session_start", async () => {
		buffer = [];
	});

	// Observe the `graph` tool via the generic tool_result event (no bridge hook).
	pi.on("tool_result", async (event) => {
		try {
			if (event.toolName !== "graph") return;
			const input = (event.input ?? {}) as { action?: string; q?: string };
			addCandidate(
				buffer,
				{
					action: String(input.action ?? ""),
					question: String(input.q ?? ""),
					answer: answerFrom(event.content),
					isError: Boolean(event.isError),
				},
				MAX_ITEMS,
			);
		} catch {
			// never wedge a tool result
		}
	});

	// Flush: plain file/CLI work only. ponytail: execFileSync blocks shutdown for
	// ≤MAX_ITEMS bounded calls (~a few seconds worst case) so save-result reliably
	// completes on the same thread before exit — move to a detached spawn only if
	// shutdown latency ever measurably matters.
	pi.on("session_shutdown", async (_event, ctx) => {
		try {
			if (buffer.length === 0) return;
			const root = findSessionGraphRoot(ctx.cwd);
			if (!root) return;
			const py = graphifyPython(root);
			if (!py) return;

			for (const item of buffer) {
				try {
					execFileSync(py, ["-m", "graphify", ...buildSaveResultArgs(item)], {
						cwd: root,
						timeout: SAVE_TIMEOUT_MS,
						stdio: "ignore",
					});
				} catch {
					// best-effort; graphify absent / slow / errored → skip silently
				}
			}
			buffer = [];
		} catch {
			// never block or throw from shutdown
		}
	});
}
