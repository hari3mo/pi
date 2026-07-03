/**
 * Save-pipeline text processing: single-line sanitize, secret redaction, and
 * category-aware neutrality rewrite + lint. See DESIGN.md §4 and §5.
 */

import { MAX_HEURISTIC_CHARS } from "./schema.ts";
import type { Category } from "./schema.ts";

// ---------------------------------------------------------------------------
// Sanitize (DESIGN.md §4)
// ---------------------------------------------------------------------------

/** Collapse newlines/control chars, trim, cap to MAX_HEURISTIC_CHARS. */
export function sanitizeText(raw: string): string {
	let t = raw.replace(/[\r\n\t]+/g, " ");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-char strip
	t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
	t = t.replace(/\s+/g, " ").trim();
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
	return {
		text: out,
		warning: "Possible secret detected and redacted before saving.",
	};
}

// ---------------------------------------------------------------------------
// Neutrality rewrite (DESIGN.md §5)
// ---------------------------------------------------------------------------

const CLASS_B_SUBJECTS = new Set(["claude", "codex", "copilot"]);

const REWRITE_RE = /^\s*(pi|the agent|the assistant|you|claude|codex|copilot)\s+(should|must|shall|will|needs? to|has to)\s+(.+)$/i;

/**
 * Rewrite self-referential imperatives into harness-neutral imperatives.
 * "Class A" subjects (pi, the agent, the assistant, you) always rewrite.
 * "Class B" subjects (claude, codex, copilot) are skipped for orchestration
 * lessons, since those often legitimately name a delegated harness/model.
 */
export function neutralize(text: string, category: Category): string {
	const match = text.match(REWRITE_RE);
	if (!match) return text;
	const subject = match[1].toLowerCase();
	if (category === "orchestration" && CLASS_B_SUBJECTS.has(subject)) return text;
	const rest = match[3];
	if (!rest) return text;
	return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// ---------------------------------------------------------------------------
// Lint (DESIGN.md §5) — warn-only, never blocks
// ---------------------------------------------------------------------------

export const ALWAYS_BANNED = [
	"before_agent_start",
	"tool_call",
	"tool_result",
	"learn_heuristic",
	"registerTool",
	"systemPromptOptions",
	"promptGuidelines",
	"pi extension",
	"the subagent tool",
	"subagent tool",
	"agentScope",
	"confirmProjectAgents",
	"pi -p",
	"--mode json",
	"--no-session",
	"--tools",
	"--model",
	"--append-system-prompt",
	"npx",
	"claude-flow",
	"claude-fable-5",
	"claude-sonnet-5",
	"claude-opus-4-8",
	".agents/heuristics",
	"HEURISTICS.md",
];

export const GENERIC_ORCH_TERMS = [
	"subagent",
	"sub-agent",
	"delegate",
	"delegation",
	"orchestrat",
	"lead",
	"orchestrator",
	"role",
	"builder",
	"architect",
	"reviewer",
	"qa-reviewer",
	"scope-planner",
	"shipper",
	"task contract",
	"tier",
	"parallel",
	"chain",
	"verification",
	"the agent",
];

export function effectiveBanned(category: Category): string[] {
	return category === "orchestration" ? ALWAYS_BANNED : [...ALWAYS_BANNED, ...GENERIC_ORCH_TERMS];
}

const SUBSTRING_TERMS = new Set(["orchestrat", "sub-agent"]);

function escapeRegex(term: string): string {
	return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termMatches(term: string, lower: string): boolean {
	if (SUBSTRING_TERMS.has(term)) return lower.includes(term);
	const re = new RegExp(`\\b${escapeRegex(term.toLowerCase())}\\b`, "i");
	return re.test(lower);
}

/** Returns a warning string if any banned/internal term is found; otherwise undefined. */
export function lint(text: string, category: Category): string | undefined {
	const lower = text.toLowerCase();
	const banned = effectiveBanned(category);
	const hits: string[] = [];
	for (const term of banned) {
		if (termMatches(term, lower)) hits.push(term);
	}
	if (hits.length === 0) return undefined;
	return `Heuristic mentions internal/harness-specific term(s) (${hits.join(", ")}); rephrase harness-neutrally.`;
}
