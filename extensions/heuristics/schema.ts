/**
 * Heuristics extension — shared types, constants, and small pure helpers.
 *
 * See DESIGN.md (authoritative, v2) for the full spec. This file implements the
 * per-heuristic schema (§1), the constants table (§11), and the dedup/scoring
 * primitives (§6, §7) shared by store.ts and inject.ts.
 */

import { StringEnum } from "@earendil-works/pi-ai";

/** Lesson category. */
export type Category =
	| "correction"
	| "gotcha"
	| "environment"
	| "workflow"
	| "convention"
	| "orchestration";

export type Scope = "global" | "project";

export type Source = "agent" | "user";

/** Per-heuristic schema (JSONL, one object per line). See DESIGN.md §1. */
export interface Heuristic {
	id: string;
	text: string;
	scope: Scope;
	project: string | null;
	category: Category;
	created: string;
	lastReinforced: string;
	hits: number;
	source: Source;
	pinned: boolean;
	/** How this lesson was verified true (DESIGN.md §3). Optional so existing stored entries without it remain valid. */
	basis?: string;
}

// ---------------------------------------------------------------------------
// Constants (DESIGN.md §11)
// ---------------------------------------------------------------------------

export const CAP_GLOBAL = 200;
export const CAP_PROJECT = 100;
export const MAX_INJECT_CHARS = 4000;
export const MAX_INJECT_ITEMS = 50;
export const MAX_HEURISTIC_CHARS = 400;
export const ORCH_RESERVE = 900;
export const STALE_MS = 10_000;
export const HALFLIFE_DAYS = 60;
export const JACCARD_NEAR = 0.8;
export const JACCARD_MERGE = 0.9;
export const CHURN_WINDOW = 6;
export const CHURN_CAP = 20;
export const BUILDER_WATCH_CALLS = 2;

/** Max lines read from heuristics.jsonl before we stop parsing (DESIGN.md §1). */
export const MAX_READ_LINES = 5000;

/** Max bytes read from heuristics.jsonl before the line cap even applies, to bound memory on a huge file. */
export const MAX_READ_BYTES = 2 * 1024 * 1024;

/** Read-path ENOENT retry delay for injection (DESIGN.md §2). */
export const READ_RETRY_MS = 20;

/** Lock acquisition backoff/retry (DESIGN.md §2): retry <=20x at 100ms (~2s). */
export const LOCK_RETRY_MS = 100;
export const LOCK_MAX_ATTEMPTS = 20;

// ---------------------------------------------------------------------------
// TypeBox schemas for the learn_heuristic tool (DESIGN.md §3)
// ---------------------------------------------------------------------------

export const CategorySchema = StringEnum(
	["correction", "gotcha", "environment", "workflow", "convention", "orchestration"] as const,
	{
		description:
			"Lesson category. correction: a user correction of the agent's behavior. gotcha: a " +
			"non-obvious surprising behavior or trap. environment: an environment/tooling quirk. " +
			"workflow: a process or procedure preference. convention: a style or naming convention. " +
			"orchestration: a lesson about delegating to and coordinating other agents (role-fit, " +
			"tier choice, contract framing, what context a delegated task needs, verifying returned work).",
	},
);

export const ScopeSchema = StringEnum(["global", "project"] as const, {
	description: 'Where to save the lesson. Defaults to "project".',
});

export const BasisSchema = StringEnum(
	["user-confirmed", "directly-observed", "reproduced", "documented"] as const,
	{
		description:
			"How this lesson was verified true: user-confirmed = the user explicitly stated or " +
			"confirmed it; directly-observed = you saw the behavior happen in this session; " +
			"reproduced = you tested it and confirmed the outcome; documented = stated in " +
			"authoritative docs/config you read.",
	},
);

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** `h_<base36 epoch-ms>_<8 rand chars>` (widened from 4 to make same-millisecond collisions negligible) */
export function newId(): string {
	const time = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
	return `h_${time}_${rand}`;
}

// ---------------------------------------------------------------------------
// Dedup primitives (DESIGN.md §6)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"that",
	"with",
	"this",
	"from",
	"have",
	"has",
	"been",
	"are",
	"was",
	"were",
	"will",
	"would",
	"should",
	"must",
	"shall",
	"need",
	"needs",
	"use",
	"using",
	"used",
	"not",
	"but",
	"you",
	"your",
	"into",
	"onto",
	"than",
	"then",
	"when",
	"what",
	"which",
	"who",
	"whom",
	"its",
	"our",
	"out",
	"over",
	"under",
	"upon",
	"via",
	"per",
]);

/** lowercase → strip backticks → collapse whitespace → trim → drop trailing "." */
export function normalize(text: string): string {
	let t = text.toLowerCase();
	t = t.replace(/`/g, "");
	t = t.replace(/\s+/g, " ").trim();
	if (t.endsWith(".")) t = t.slice(0, -1);
	return t;
}

/** normalize → split non-alphanumerics → keep len>=3 → drop stopwords → Set */
export function tokens(text: string): Set<string> {
	const norm = normalize(text);
	const parts = norm.split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !STOPWORDS.has(p));
	return new Set(parts);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const t of a) if (b.has(t)) intersection++;
	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Scoring (DESIGN.md §7) — eviction and injection ranking ONLY.
// ---------------------------------------------------------------------------

/** Merge basis on reinforce/merge: keep existing unless a new one is provided (DESIGN.md §3, §4). */
export function applyBasis(current: string | undefined, next: string | undefined): string | undefined {
	return next !== undefined ? next : current;
}

export function scoreOf(h: Heuristic, now: number = Date.now()): number {
	if (h.pinned) return Number.POSITIVE_INFINITY;
	let ageDays = Math.max(0, (now - Date.parse(h.lastReinforced)) / 86_400_000);
	// A malformed lastReinforced makes Date.parse return NaN, which would
	// silently propagate into every sort comparator that uses this score.
	// Treat unparsable timestamps as maximally stale instead.
	if (Number.isNaN(ageDays)) ageDays = 3650;
	const weight = h.hits + (h.source === "user" ? 3 : 1);
	return weight * 0.5 ** (ageDays / HALFLIFE_DAYS);
}

// ---------------------------------------------------------------------------
// Orchestration role matching (DESIGN.md §9, S4)
// ---------------------------------------------------------------------------

const BUILDER_SUBSTRING_RE = /build|coder|impl/i;

export function matchesBuilderRole(agentName: string): boolean {
	return BUILDER_SUBSTRING_RE.test(agentName);
}
