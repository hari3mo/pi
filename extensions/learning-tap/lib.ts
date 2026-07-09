/**
 * Learning-Tap — pure logic (no pi imports beyond types-free code).
 *
 * Everything checkable without a pi session lives here: event construction,
 * substantiveness filters, verdict parsing, buffering, and JSONL append with
 * the heuristics-store lock protocol. index.ts is thin wiring.
 *
 * Contract: ~/.pi/agent/learning/SCHEMA.md (authoritative). Design:
 * ~/.hermes/plans/2026-07-04_210500-pi-learning-loop-redesign.md.
 */

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export type EventKind = "verdict" | "rework" | "correction" | "query" | "explicit" | "violation";

export interface LearningEvent {
	id: string;
	ts: string;
	session: string;
	cwd: string;
	/** v2: knowledge domain ("pi" | "prism" | ...); absent = "pi" (SCHEMA.md). */
	domain?: string;
	kind: EventKind;
	payload: Record<string, unknown>;
	evidence: string[];
}

export const MAX_LINE_BYTES = 8 * 1024; // SCHEMA.md: whole line <= 8KB, drop not truncate
export const ANSWER_CAP = 4000;
export const USERTEXT_CAP = 1000;
export const MAX_EVENTS_PER_SESSION = 40; // runaway guard; generous vs knowledge-compound's 3

export function makeEventId(now = Date.now()): string {
	const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
	return `ev_${now.toString(36)}_${rand}`;
}

export function makeEvent(
	kind: EventKind,
	payload: Record<string, unknown>,
	evidence: string[],
	session: string,
	cwd: string,
	now = Date.now(),
	domain?: string,
): LearningEvent {
	const ev: LearningEvent = { id: makeEventId(now), ts: new Date(now).toISOString(), session, cwd, kind, payload, evidence };
	// Only stamp non-default domains: absent means "pi" (SCHEMA.md v2), which
	// keeps pi-domain lines byte-identical to v1 and the union-merge cheap.
	if (domain && domain !== "pi") ev.domain = domain;
	return ev;
}

/** Serialize; returns undefined when the line would exceed MAX_LINE_BYTES (drop, don't truncate JSON). */
export function serializeEvent(ev: LearningEvent): string | undefined {
	const line = JSON.stringify(ev);
	if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) return undefined;
	return line;
}

// ---------------------------------------------------------------------------
// Query tap filter — ported from knowledge-compound.ts (same semantics) plus
// the SCHEMA.md /^Traversal: BFS/ exclusion (raw node dumps are regenerable).
// ---------------------------------------------------------------------------

export const CAPTURED_GRAPH_ACTIONS = new Set(["query", "explain"]);
export const MIN_ANSWER_CHARS = 200;

export function normalizeQuestion(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSubstantiveQuery(action: string, isError: boolean, answer: string): boolean {
	if (isError) return false;
	if (!CAPTURED_GRAPH_ACTIONS.has(action)) return false;
	const a = (answer ?? "").trim();
	if (a.length < MIN_ANSWER_CHARS) return false;
	if (/^(Error:|graphify error:|No graphify-out|\(no output\))/.test(a)) return false;
	if (/^Traversal: BFS/.test(a)) return false; // node/edge dump, not durable knowledge
	return true;
}

// ---------------------------------------------------------------------------
// Verdict parsing — mirrors extensions/subagent/index.ts parseQaVerdict.
// The subagent extension normalizes peer returns to start with a
// "[VERDICT: ...]" line; we parse both the normalized and legacy shapes so the
// tap keeps working if normalization is bypassed (doctor returns, older logs).
// ---------------------------------------------------------------------------

export type QaVerdict = "PASS" | "FAIL: implementation" | "FAIL: design";

export function parseVerdict(text: string): QaVerdict | null {
	const classify = (m: RegExpMatchArray): QaVerdict => (m[1] ? (`FAIL: ${m[1].toLowerCase()}` as QaVerdict) : "PASS");
	const anchored = /^\s*\[?\s*(?:VERDICT:\s*)?(?:FAIL:\s*(implementation|design)\b|PASS\b)/;
	const m = text.match(anchored);
	if (m) return classify(m);
	const anywhere = /\b(?:FAIL:\s*(implementation|design)\b|PASS\b)/g;
	let verdict: QaVerdict | null = null;
	for (const mm of text.matchAll(anywhere)) verdict = classify(mm);
	return verdict;
}

/** QA roles whose returns carry verdicts worth capturing. */
export const QA_AGENTS = new Set(["peer", "doctor"]);

export interface SubagentReturnInfo {
	agent: string; // "" when not extractable
	text: string;
}

/**
 * Extract per-agent return texts from a subagent tool_result content array.
 * Single mode → one entry; parallel/chain → the joined text is scanned for
 * "### <agent>" / "## <agent>" section headers as a best effort; when no
 * structure is found, one entry with agent "" is returned so the caller can
 * still try input-derived agent names.
 */
export function extractReturns(input: Record<string, unknown>, contentText: string): SubagentReturnInfo[] {
	const single = typeof input.agent === "string" ? (input.agent as string) : undefined;
	if (single) return [{ agent: single, text: contentText }];
	const items: { agent?: unknown }[] = [];
	if (Array.isArray(input.tasks)) items.push(...(input.tasks as { agent?: unknown }[]));
	if (Array.isArray(input.chain)) items.push(...(input.chain as { agent?: unknown }[]));
	const agents = items.map((t) => (typeof t.agent === "string" ? t.agent : "")).filter(Boolean);
	if (agents.length === 0) return [{ agent: "", text: contentText }];
	// Try to split the combined return by agent-name headers; fall back to
	// attributing the whole text to each QA agent present (a verdict line is
	// globally parseable either way — dedupe happens in the distiller).
	const out: SubagentReturnInfo[] = [];
	for (const agent of agents) {
		const re = new RegExp(`^#{2,3}\\s+.*\\b${agent}\\b.*$`, "mi");
		const m = contentText.match(re);
		if (m && m.index !== undefined) {
			const rest = contentText.slice(m.index + m[0].length);
			const next = rest.search(/^#{2,3}\s+/m);
			out.push({ agent, text: next === -1 ? rest : rest.slice(0, next) });
		} else if (QA_AGENTS.has(agent)) {
			out.push({ agent, text: contentText });
		}
	}
	return out.length > 0 ? out : [{ agent: "", text: contentText }];
}

// ---------------------------------------------------------------------------
// Buffering (session-scoped, flushed at shutdown)
// ---------------------------------------------------------------------------

export function addEvent(buffer: LearningEvent[], ev: LearningEvent, max = MAX_EVENTS_PER_SESSION): boolean {
	if (buffer.length >= max) return false;
	// Dedupe: same kind + identical payload question/verdict within a session.
	const sig = eventSignature(ev);
	if (buffer.some((b) => eventSignature(b) === sig)) return false;
	buffer.push(ev);
	return true;
}

export function eventSignature(ev: LearningEvent): string {
	const p = ev.payload as { question?: string; verdict?: string; text?: string; detail?: string };
	const core = p.question ? normalizeQuestion(String(p.question)) : (p.verdict ?? p.text ?? p.detail ?? JSON.stringify(ev.payload));
	return `${ev.kind}::${core}`;
}

// ---------------------------------------------------------------------------
// JSONL append with the heuristics DESIGN.md §2 lock protocol
// ---------------------------------------------------------------------------

const STALE_MS = 10_000;
const RETRY_MS = 100;
const MAX_RETRIES = 130;

function acquireLock(lockPath: string): boolean {
	for (let i = 0; i < MAX_RETRIES; i++) {
		try {
			closeSync(openSync(lockPath, "wx"));
			return true;
		} catch {
			try {
				if (Date.now() - statSync(lockPath).mtimeMs > STALE_MS) {
					unlinkSync(lockPath);
					continue;
				}
			} catch {
				continue; // lock vanished between EEXIST and stat — retry immediately
			}
			const until = Date.now() + RETRY_MS;
			while (Date.now() < until) {
				/* sync backoff: flush runs at shutdown, blocking is acceptable */
			}
		}
	}
	return false;
}

/**
 * Append events to learning/events.jsonl under lock. Returns count written.
 * Fail-open: any error returns what was written so far; never throws.
 */
export function appendEvents(learningDir: string, events: LearningEvent[]): number {
	let written = 0;
	const lockPath = join(learningDir, ".lock");
	let locked = false;
	try {
		mkdirSync(learningDir, { recursive: true });
		locked = acquireLock(lockPath);
		if (!locked) return 0; // fail loudly is the store's job; the tap fails open
		const target = join(learningDir, "events.jsonl");
		const lines: string[] = [];
		for (const ev of events) {
			const line = serializeEvent(ev);
			if (line) {
				lines.push(line);
				written++;
			}
		}
		if (lines.length > 0) appendFileSync(target, `${lines.join("\n")}\n`, "utf8");
	} catch {
		/* fail open */
	} finally {
		if (locked) {
			try {
				unlinkSync(lockPath);
			} catch {
				/* already gone */
			}
		}
	}
	return written;
}

/** Read content text out of a tool_result content array. */
export function answerFrom(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: string; text: string } => !!c && (c as { type?: string }).type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

export function cap(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) : s;
}

// ---------------------------------------------------------------------------
// Correction tap classifier (v1, deliberately narrow — SCHEMA.md `correction`)
//
// A correction candidate is a USER input that plausibly reverses/amends what
// the agent just did. False positives are the failure mode (they waste the
// distiller's higher-bar review), so the match requires a corrective marker
// ANCHORED near the start of the message, not anywhere: mid-sentence "no"
// or a quoted "wrong" must not fire. All candidates carry basis "inferred";
// the distiller holds them to a higher promotion bar than observed events.
// ---------------------------------------------------------------------------

const CORRECTION_RE =
	/^\s*(?:no+[,.!\s]|wrong\b|not (?:that|this|what)\b|that'?s (?:not|wrong)\b|undo\b|revert\b|don'?t\b|stop\b|actually[,\s]|instead[,\s]|i (?:said|meant)\b|why did you\b|you (?:shouldn'?t|weren'?t supposed)\b)/i;

/** Inputs that LOOK corrective but are routine and must not fire. */
const CORRECTION_EXCLUDE_RE = /^\s*(?:no+[,.!\s]*(?:thanks|thank you|that'?s (?:all|fine|ok))|don'?t worry|stop(?:ping)? (?:by|at)\b)/i;

export const MAX_CORRECTIONS_PER_SESSION = 3;

export function isCorrectionCandidate(text: string): boolean {
	const t = (text ?? "").trim();
	if (t.length < 3 || t.length > 2000) return false; // too short to mean anything / too long to be a snap correction
	if (t.startsWith("/") || t.startsWith("!")) return false; // slash command / bash, not prose
	if (CORRECTION_EXCLUDE_RE.test(t)) return false;
	return CORRECTION_RE.test(t);
}

// ---------------------------------------------------------------------------
// Receipts (SCHEMA.md `receipts.jsonl`) — consumed-knowledge manifest, one
// line per session, written at shutdown alongside the events flush. The
// distiller's MEASURE pass joins these against outcomes.
// ---------------------------------------------------------------------------

export interface Receipt {
	session: string;
	ts: string;
	cwd: string;
	/** v2: knowledge domain of the session (cwd-classified); absent = "pi". */
	domain?: string;
	heuristicIdsInjected: string[];
	wikiPagesRead: string[];
	graphQueries: number;
	correctionsCaptured: number;
	violations: number;
	outcome: QaVerdict | null; // last verdict seen this session, if any
}

/** Parse heuristic ids out of a heuristics.jsonl file body (skip bad lines). */
export function heuristicIdsFrom(jsonl: string): string[] {
	const ids: string[] = [];
	for (const line of jsonl.split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		try {
			const id = (JSON.parse(t) as { id?: unknown }).id;
			if (typeof id === "string") ids.push(id);
		} catch {
			/* skip bad line */
		}
	}
	return ids;
}

/** Append one receipt line under the same lock protocol as events. */
export function appendReceipt(learningDir: string, receipt: Receipt): boolean {
	const line = JSON.stringify(receipt);
	if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) return false;
	// Reuse appendEvents' lock machinery via a minimal shim: receipts are a
	// different file but the same directory lock serializes both writers.
	const lockPath = join(learningDir, ".lock");
	let locked = false;
	try {
		mkdirSync(learningDir, { recursive: true });
		locked = acquireLock(lockPath);
		if (!locked) return false;
		appendFileSync(join(learningDir, "receipts.jsonl"), `${line}\n`, "utf8");
		return true;
	} catch {
		return false;
	} finally {
		if (locked) {
			try {
				unlinkSync(lockPath);
			} catch {
				/* already gone */
			}
		}
	}
}
