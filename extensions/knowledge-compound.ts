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
 *   (a) `graphify save-result --outcome useful ...` for each buffered query, so
 *       the answer feeds `graphify reflect` → graphify-out/reflections/LESSONS.md.
 *   (b) A compact DRAFT synthesis note staged into oracle/_raw/ (NEVER published
 *       as a final page) per oracle/SCHEMA.md, for later review/promotion.
 *
 * Volume discipline: dedupe by (action, normalized-question), cap at MAX_ITEMS
 * per session, skip trivial/failed queries via a cheap textual filter
 * (isSubstantive). Fail-open and silent on ANY error — never block shutdown.
 *
 * The buffering + note/argv construction are pure exported functions so the
 * flush logic is checkable without pi: scripts/check-knowledge-compound.mjs.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGraphRoot, OUT } from "./lib/graph-lookup.ts";

const MAX_ITEMS = 3; // cap durable candidates per session
const MIN_ANSWER_CHARS = 200; // durability floor: below this, not worth compounding
const ANSWER_CAP = 4000; // keep staged notes / save-result args compact
const SAVE_TIMEOUT_MS = 2000; // per save-result call bound
const STAGING_SUBDIR = "_raw"; // oracle raw/staging area (mirrors wiki-capture quick mode)
const CAPTURED_ACTIONS = new Set(["query", "explain"]); // status/path are not durable knowledge

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

function slugify(q: string): string {
	return (
		normalizeQuestion(q)
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "query"
	);
}

/** First meaningful line of the answer, header-stripped, ≤190 chars (SCHEMA: summary ≤200). */
function deriveSummary(answer: string): string {
	const line = answer
		.split("\n")
		.map((l) => l.replace(/^#+\s*/, "").replace(/^>\s*/, "").trim())
		.find((l) => l.length > 0) ?? "";
	return line.length <= 190 ? line : `${line.slice(0, 189)}\u2026`;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * A DRAFT synthesis note for oracle/_raw/, with valid oracle frontmatter so
 * promotion to synthesis/ is trivial. `source_layer: learned` → no pi_version
 * (SCHEMA staleness protocol). `index` disambiguates same-second filenames.
 */
export function buildStagedNote(
	item: Captured,
	now: Date,
	index: number,
	graphJsonPath = `${OUT}/graph.json`,
): { filename: string; content: string } {
	const iso = now.toISOString();
	const date = iso.slice(0, 10);
	const stamp = `${date.replace(/-/g, "")}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
	const filename = `graph-${stamp}-${index}-${slugify(item.question)}.md`;
	const title = item.question.length <= 80 ? item.question : `${item.question.slice(0, 79)}\u2026`;
	const summary = deriveSummary(item.answer) || `Auto-captured graph ${item.action} answer.`;

	// JSON.stringify → valid YAML double-quoted scalars (escapes quotes/newlines).
	const content = `---
title: ${JSON.stringify(title)}
category: synthesis
source_layer: learned
sources:
  - ${graphJsonPath}
tags: [pi, graph, synthesis]
summary: ${JSON.stringify(summary)}
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: ${date}
tier: peripheral
created: ${iso}
updated: ${iso}
---

> [!draft] Auto-captured graph \`${item.action}\` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into \`synthesis/\` (or fold into an existing page) or delete.

# Q: ${item.question}

## Answer

${item.answer}

## Provenance

- graph tool action: \`${item.action}\`
- captured: ${iso}
`;
	return { filename, content };
}

function graphifyPython(root: string): string {
	try {
		const p = readFileSync(join(root, OUT, ".graphify_python"), "utf8").trim();
		if (p && !/[^a-zA-Z0-9/_.@:\\-]/.test(p) && existsSync(p)) return p;
	} catch {
		// fall through to system python
	}
	return "python3";
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
			const root = findGraphRoot(ctx.cwd);
			const vault = join(getAgentDir(), "oracle");
			const canStage = existsSync(vault);
			const stagingDir = join(vault, STAGING_SUBDIR);
			if (canStage) {
				try {
					mkdirSync(stagingDir, { recursive: true });
				} catch {
					// staging optional; save-result path still runs
				}
			}
			const py = root ? graphifyPython(root) : undefined;
			const now = new Date();

			const graphJsonPath = root ? join(root, OUT, "graph.json") : undefined;

			buffer.forEach((item, i) => {
				if (canStage) {
					try {
						const { filename, content } = graphJsonPath
							? buildStagedNote(item, now, i, graphJsonPath)
							: buildStagedNote(item, now, i);
						writeFileSync(join(stagingDir, filename), content);
					} catch {
						// one bad note must not skip the rest or the CLI flush
					}
				}
				if (root && py) {
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
			});
			buffer = [];
		} catch {
			// never block or throw from shutdown
		}
	});
}
