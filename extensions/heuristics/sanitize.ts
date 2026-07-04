/**
 * Save-pipeline text processing: single-line sanitize, secret redaction, and
 * the generality rewrite + lint. See DESIGN.md §4 and §5.
 */

import { MAX_HEURISTIC_CHARS } from "./schema.ts";

// ---------------------------------------------------------------------------
// Sanitize (DESIGN.md §4) — collapse newlines/control chars, trim, cap length.
// ---------------------------------------------------------------------------

export function sanitizeText(raw: string): string {
	let t = raw.replace(/[\r\n\t]+/g, " ");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-char strip
	t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
	t = t.replace(/\s+/g, " ").trim();
	// Redact secrets BEFORE truncating too (the caller also redacts after this
	// returns): a secret token straddling the 400-char cut could otherwise
	// leave an unredacted fragment. Running the (cheap) redaction pass twice
	// is harmless; natural-language secrets remain out of scope either way.
	t = redactSecrets(t).text;
	if (t.length > MAX_HEURISTIC_CHARS) t = t.slice(0, MAX_HEURISTIC_CHARS).trimEnd();
	return t;
}

// ---------------------------------------------------------------------------
// Secret scrub (DESIGN.md §4)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: RegExp[] = [
	/sk-[A-Za-z0-9]{16,}/g,
	/AKIA[0-9A-Z]{16}/g,
	/gh[pousr]_[A-Za-z0-9]{20,}/g,
	/xox[baprs]-\S+/g,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
	/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
];

export interface RedactResult {
	text: string;
	warning?: string;
}

/** Redact matched secret-like substrings, keep the rest, append a warning. */
export function redactSecrets(text: string): RedactResult {
	let redactedAny = false;
	let out = text;
	for (const pattern of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		if (pattern.test(out)) {
			redactedAny = true;
			pattern.lastIndex = 0;
			out = out.replace(pattern, "[REDACTED]");
		}
	}
	if (!redactedAny) return { text: out };
	return { text: out, warning: "Possible secret detected and redacted before saving." };
}

// ---------------------------------------------------------------------------
// Generality rewrite (DESIGN.md §5) — deterministic, warn-only pipeline.
// ---------------------------------------------------------------------------

const REWRITE_RE = /^\s*(pi|the agent|the assistant|you|i)\s+(should|must|shall|will|needs? to|has to)\s+(.+)$/i;

/**
 * "You should run tests first" → "Run tests first".
 * Only rewrites self-referential imperatives; leaves everything else as-is.
 */
export function rewriteGenerality(text: string): string {
	const match = text.match(REWRITE_RE);
	if (!match) return text;
	const rest = match[3];
	if (!rest) return text;
	return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// ---------------------------------------------------------------------------
// Lint (DESIGN.md §5) — warn-only, never blocks. No banned-vocabulary lists;
// orchestration terms (subagent, delegate, worker, etc.) are fine in any
// category. Flags only session-specific markers.
// ---------------------------------------------------------------------------

const LINE_NUMBER_RE = /\bline\s+\d+\b/i;
const FILE_COLON_LINE_RE = /[\w./-]+\.\w+:\d+\b/;
const EPHEMERAL_PATH_RE = /\/(tmp|var\/folders|private\/tmp)\//;
const TICKET_ID_RE = /\b(#\d{2,}|[A-Z]{2,}-\d+)\b/;
const DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b/;
const HEX_ID_RE = /\b[0-9a-f]{12,}\b/i;
const THIS_SESSION_RE = /\b(this (session|conversation|chat)|today|yesterday)\b/i;

/** Returns a warning string if the text looks session-specific; otherwise undefined. */
export function lintGenerality(text: string): string | undefined {
	const reasons: string[] = [];
	if (LINE_NUMBER_RE.test(text) || FILE_COLON_LINE_RE.test(text)) reasons.push("a line-number reference");
	if (EPHEMERAL_PATH_RE.test(text)) reasons.push("an ephemeral path");
	if (TICKET_ID_RE.test(text)) reasons.push("a ticket/PR id");
	if (DATE_RE.test(text)) reasons.push("a date/timestamp");
	if (HEX_ID_RE.test(text)) reasons.push("a long hex/uuid-ish id");
	if (THIS_SESSION_RE.test(text)) reasons.push('a "this session" style reference');
	if (reasons.length === 0) return undefined;
	return `This looks session-specific (${reasons.join(", ")}); consider rephrasing as a generalizable lesson.`;
}
