/**
 * Shared "X-first" knowledge-router core.
 *
 * The two router extensions — graph-first.ts (redirects structure-shaped
 * grep/rg to the `graph` tool) and oracle-first.ts (redirects pi-doc reads to
 * the oracle vault) — share ONE per-session escalation state machine:
 *
 *   FIRST flagged offense          → nudge (allow, inject a one-line hint)
 *   SECOND and later               → block (with an identical-retry escape)
 *   identical retry of a block     → bypass (always allowed)
 *   non-offense                    → allow
 *
 * This module owns that ladder + its session state, plus the shared cross-store
 * guidance (deliverable 2): each router's message names BOTH stores so the
 * model can pick the right one, and graph-first can detect when an intercepted
 * grep is really a pi-knowledge question that belongs in the oracle, not the
 * local graph.
 *
 * Pure (no imports, no I/O) so both extensions and their check scripts load it
 * under jiti without the pi package on the module path. The two extensions stay
 * as thin configs over this core: each keeps its own classifier + session
 * wiring, but the ladder, the state shape, and the guidance live here once.
 */

// ---------------------------------------------------------------------------
// Escalation ladder (shared by graph-first + oracle-first)
// ---------------------------------------------------------------------------

export type RouterAction = "allow" | "nudge" | "block" | "bypass";

export interface RouterState {
	count: number;
	blocked: Set<string>;
}

export function makeRouterState(): RouterState {
	return { count: 0, blocked: new Set() };
}

/** Reset in place at session_start (both extensions reuse one long-lived state). */
export function resetRouterState(state: RouterState): void {
	state.count = 0;
	state.blocked.clear();
}

/**
 * The nudge-then-block ladder with an identical-retry bypass. `key` is the
 * caller's already-normalized identity for the offending command/read (so the
 * bypass matches an EXACT retry). Mutates `state`; pure otherwise.
 */
export function decide(state: RouterState, key: string, flagged: boolean): RouterAction {
	if (!flagged) return "allow";
	if (state.blocked.has(key)) return "bypass";
	state.count++;
	if (state.count === 1) return "nudge";
	state.blocked.add(key);
	return "block";
}

// ---------------------------------------------------------------------------
// Cross-store guidance (deliverable 2)
// ---------------------------------------------------------------------------

// Hardcoded absolute paths mirror how AGENTS.md and ~/.obsidian-wiki/config.oracle
// write them literally (same repo, same user). Shared so graph-first can detect a
// grep into pi's own source / the oracle vault without re-declaring the paths.
export const PI_PKG = "/Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent";
export const ORACLE_VAULT = "/Users/harissaif/.pi/agent/oracle";
export const ORACLE_CONFIG = "/Users/harissaif/.obsidian-wiki/config.oracle";

/**
 * The both-stores one-liner appended to EVERY router message: which store
 * answers which question. Guarantees each nudge/block names both the `graph`
 * tool and the oracle so the model can cross over when it picked the wrong door.
 */
export const CROSS_STORE_GUIDANCE =
	"Stores: the `graph` tool (query/explain/path) answers THIS repo's live code " +
	"structure; `wiki-query` (oracle profile, ~/.obsidian-wiki/config.oracle) answers " +
	"durable pi knowledge.";

/**
 * True when a (flagged) grep targets pi's OWN installed source or the oracle
 * vault — a pi-knowledge question the local graph does not index, so its
 * redirect should point at the oracle, not the `graph` tool. Deterministic
 * path/substring test only (no LLM, no new tools).
 */
export function grepIsOracleQuestion(command: string): boolean {
	if (!command) return false;
	if (command.includes(PI_PKG) || command.includes(ORACLE_VAULT)) return true;
	// A relative `oracle/...` path segment (quote/space/slash-anchored so it is a
	// real path arg, not a substring of an unrelated word).
	return /(^|[\s"'/])oracle\//.test(command);
}
