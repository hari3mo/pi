/**
 * Oracle-First Extension
 *
 * Knowledge questions about pi itself belong in the oracle vault (compiled,
 * distilled knowledge), not in a cold re-read of pi's own docs. This mirrors
 * graph-first.ts for the ORACLE-FIRST doctrine (AGENTS.md, Fable Budget
 * Invariants): when a tool call READS pi's own documentation and the oracle has
 * NOT been consulted this session, it steers to `wiki-query` (oracle profile) +
 * the `graph` tool with the same per-session escalation ladder:
 *
 *   FIRST pi-doc read (oracle un-consulted)  → allow, inject a one-line nudge to
 *                                              try wiki-query + graph first.
 *   SECOND and later                         → BLOCK, with a reason that tells
 *                                              the model to re-run the IDENTICAL
 *                                              read to proceed if the oracle
 *                                              genuinely lacks the answer.
 *   identical retry of a block               → always allowed (a bypass).
 *
 * "Pi's own docs" = the read tool, or a cat/sed/head-style bash read, targeting
 * README.md / docs/ / examples/ under the installed pi package. Reading the
 * oracle vault, ordinary project files, or pi's compiled source is NEVER
 * touched — a false positive (blocking a legit read) is worse than a miss, so
 * the match is deliberately narrow (the three doc roots the doctrine names).
 *
 * "Oracle consulted" signal (cheapest reliable): any tool call this session that
 * (a) reads a file under the oracle vault, or (b) is a bash command mentioning
 * the oracle vault path, the oracle profile config, or `wiki-query`. Once seen,
 * the ladder goes dormant for the rest of the session — the doctrine's "before"
 * ordering is satisfied. We watch the SAME tool_call stream we gate on, so the
 * signal costs nothing extra and needs no separate probe.
 *
 * Subagents: NO PI_SUBAGENT gate — mirrors graph-first (applies to dispatched
 * tasks too; a subagent that legitimately needs pi docs bypasses via identical
 * retry). read-only-default.ts is the extension that exempts subagents; this one
 * deliberately does not.
 *
 * Active ONLY when both the oracle vault dir and the oracle profile config
 * exist. Everything is wrapped fail-open so it can never wedge a session; no
 * stats file, no config, no flags (see the follow-up note in the task return for
 * the optional self-improving closure graph-first has).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	CROSS_STORE_GUIDANCE,
	decide,
	makeRouterState,
	ORACLE_CONFIG,
	ORACLE_VAULT,
	PI_PKG,
	resetRouterState,
	type RouterAction,
	type RouterState,
} from "./lib/knowledge-router.ts";

/** The three doc roots under PI_PKG the ORACLE-FIRST doctrine names. */
const DOC_SUBPATHS = ["README.md", "docs/", "examples/"];
const WIKI_CONFIG = "/Users/harissaif/.obsidian-wiki/config";

/** File-reading utilities whose target under PI_PKG counts as "reading pi docs". */
const READ_CMD_RE = /\b(cat|sed|head|tail|less|more|bat|nl|view)\b/;

function vaultPathFromConfig(configPath: string): string {
	try {
		const match = readFileSync(configPath, "utf8").match(/^OBSIDIAN_VAULT_PATH=(.+)$/m);
		return match?.[1]?.trim() || "(vault path not set)";
	} catch {
		return "(unreadable)";
	}
}

function wikiLinkBlock(): string | undefined {
	const lines: string[] = [];
	if (existsSync(WIKI_CONFIG)) {
		lines.push(`Active wiki: ${vaultPathFromConfig(WIKI_CONFIG)} (config ${WIKI_CONFIG}).`);
	}
	if (existsSync(ORACLE_CONFIG) && existsSync(ORACLE_VAULT)) {
		lines.push(
			`Pi oracle: ${ORACLE_VAULT} (config ${ORACLE_CONFIG}); use wiki-query here for durable pi knowledge.`,
		);
	}
	if (lines.length === 0) return undefined;
	return `\n\n## Wiki links (cwd-independent)\n\n${lines.join("\n")}\nThese are absolute links; keep using them even when cwd is an unrelated project.`;
}

// ---------------------------------------------------------------------------
// Pure classifiers + escalation decision (unit-tested: scripts/check-oracle-first.mjs)
// ---------------------------------------------------------------------------

/** Is absolute path `p` one of pi's own doc files (README/docs/examples)? */
function isPiDocPath(p: string): boolean {
	if (!p.startsWith(`${PI_PKG}/`)) return false;
	const rest = p.slice(PI_PKG.length + 1);
	return DOC_SUBPATHS.some((s) => (s.endsWith("/") ? rest.startsWith(s) : rest === s));
}

/** First PI_PKG path token in `text`, or "" — bare substring scan, quote/space-terminated. */
function extractPiPkgPath(text: string): string {
	const i = text.indexOf(PI_PKG);
	if (i === -1) return "";
	let j = i;
	while (j < text.length && !/[\s'"]/.test(text[j])) j++;
	return text.slice(i, j);
}

export interface DocReadClassification {
	flagged: boolean;
	target: string; // the doc path (for the nudge/message)
	key: string; // identical-retry key (per tool + subject)
}

/**
 * Does this tool call READ one of pi's own doc files while the oracle sits
 * un-consulted? Pure (only path resolution) so the check can import it.
 *   - read tool: input.path/file_path, resolved against cwd, under a doc root.
 *   - bash tool: a cat/sed/head-style command referencing a PI_PKG doc path.
 * `cwd` normalizes a relative read path; bash paths are matched as absolute
 * substrings (a relative `../..` reach into pi's node_modules is not realistic).
 */
export function classifyPiDocRead(
	toolName: string,
	input: { path?: string; file_path?: string; command?: string },
	cwd: string,
): DocReadClassification {
	const none = { flagged: false, target: "", key: "" };
	try {
		if (toolName === "read") {
			const raw = input.path ?? input.file_path;
			if (!raw) return none;
			const abs = resolve(cwd || "/", raw);
			if (!isPiDocPath(abs)) return none;
			return { flagged: true, target: abs, key: `read:${abs}` };
		}
		if (toolName === "bash") {
			const cmd = input.command ?? "";
			if (!cmd || !READ_CMD_RE.test(cmd)) return none;
			const p = extractPiPkgPath(cmd);
			if (!p || !isPiDocPath(p)) return none;
			return { flagged: true, target: p, key: `bash:${cmd.trim()}` };
		}
	} catch {
		// fail open: an odd input shape is a miss, never a throw
	}
	return none;
}

/**
 * Does this tool call CONSULT the oracle (so the ladder goes dormant)? Any read
 * under the oracle vault, or a bash command naming the oracle vault / profile /
 * `wiki-query`. Pure.
 */
export function isOracleConsult(
	toolName: string,
	input: { path?: string; file_path?: string; command?: string },
	cwd: string,
): boolean {
	try {
		if (toolName === "read") {
			const raw = input.path ?? input.file_path;
			if (!raw) return false;
			return resolve(cwd || "/", raw).startsWith(`${ORACLE_VAULT}/`);
		}
		if (toolName === "bash") {
			const cmd = input.command ?? "";
			return cmd.includes(ORACLE_VAULT) || cmd.includes("config.oracle") || cmd.includes("wiki-query");
		}
	} catch {
		// fail open
	}
	return false;
}

export type OracleFirstAction = RouterAction;
export type OracleFirstState = RouterState;

/**
 * Escalation ladder (shared core, keyed by classifyPiDocRead's per-tool key).
 * First flagged read nudges; later ones block; an identical retry of a blocked
 * read always bypasses. Thin wrapper so the check imports this file's signature.
 */
export function decideAction(state: OracleFirstState, key: string, flagged: boolean): OracleFirstAction {
	return decide(state, key, flagged);
}

// ---------------------------------------------------------------------------
// Redirect messages (cross-store aware — deliverable 2). Pure + exported so the
// check asserts both stores are named. A pi-doc read is a pi-knowledge question
// by construction, so the primary line points at the oracle; CROSS_STORE_GUIDANCE
// names the `graph` tool for THIS repo's live code structure (the reverse door).
// ---------------------------------------------------------------------------

export function buildNudge(target: string): string {
	return (
		`[oracle-first] Pi-knowledge lookup (${target}) — the oracle vault is compiled knowledge, ` +
		`cheaper than a cold pi-docs read. Try \`wiki-query\` against the oracle profile ` +
		`(~/.obsidian-wiki/config.oracle) first. Read allowed this once. ${CROSS_STORE_GUIDANCE}`
	);
}

export function buildBlock(target: string): string {
	return (
		`[oracle-first] Consult the oracle before pi's own docs (${target}). Use \`wiki-query\` against ` +
		`the oracle profile (~/.obsidian-wiki/config.oracle). If the oracle genuinely lacks this, ` +
		`re-run the IDENTICAL read to proceed. ${CROSS_STORE_GUIDANCE}`
	);
}

// ---------------------------------------------------------------------------
// Session wiring
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let cwd = "/";
	let oracleConsulted = false;
	const state: OracleFirstState = makeRouterState();

	// Cheap existsSync each check (mirrors graph-first's active()); the vault or
	// config could appear/vanish mid-session.
	const active = (): boolean => existsSync(ORACLE_VAULT) && existsSync(ORACLE_CONFIG);

	pi.on("before_agent_start", async (event) => {
		const block = wikiLinkBlock();
		if (!block) return;
		return { systemPrompt: event.systemPrompt + block };
	});

	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.cwd || "/";
		oracleConsulted = false;
		resetRouterState(state);
	});

	pi.on("tool_call", async (event) => {
		try {
			if (event.toolName !== "read" && event.toolName !== "bash") return;
			if (!active()) return;
			const input = event.input as { path?: string; file_path?: string; command?: string };

			// Consult signal first: watching the same stream we gate on costs nothing.
			if (isOracleConsult(event.toolName, input, cwd)) {
				oracleConsulted = true;
				return;
			}
			if (oracleConsulted) return; // doctrine's "before" ordering satisfied

			const { flagged, target, key } = classifyPiDocRead(event.toolName, input, cwd);
			switch (decideAction(state, key, flagged)) {
				case "nudge":
					pi.sendMessage(
						{
							customType: "oracle-first-nudge",
							display: true,
							content: buildNudge(target),
						},
						{ deliverAs: "nextTurn" },
					);
					return;
				case "block":
					return {
						block: true,
						reason: buildBlock(target),
					};
				case "bypass":
				default:
					return;
			}
		} catch {
			// fail open: never let the detector crash a read/bash call
		}
	});
}
