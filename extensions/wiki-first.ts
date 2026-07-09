/**
 * Wiki-First Extension
 *
 * Knowledge questions about pi itself belong in the wiki vault (compiled,
 * distilled knowledge), not in a cold re-read of pi's own docs. This mirrors
 * graph-first.ts for the WIKI-FIRST doctrine (AGENTS.md, Fable Budget
 * Invariants): when a tool call READS pi's own documentation and the wiki has
 * NOT been consulted this session, it steers to `wiki-query` (wiki profile) +
 * the `graph` tool with the same per-session escalation ladder:
 *
 *   FIRST pi-doc read (wiki un-consulted)  → allow, inject a one-line nudge to
 *                                              try wiki-query + graph first.
 *   SECOND and later                         → BLOCK, with a reason that tells
 *                                              the model to re-run the IDENTICAL
 *                                              read to proceed if the wiki
 *                                              genuinely lacks the answer.
 *   identical retry of a block               → always allowed (a bypass).
 *
 * "Pi's own docs" = the read tool, or a cat/sed/head-style bash read, targeting
 * README.md / docs/ / examples/ under the installed pi package. Reading the
 * wiki vault, ordinary project files, or pi's compiled source is NEVER
 * touched — a false positive (blocking a legit read) is worse than a miss, so
 * the match is deliberately narrow (the three doc roots the doctrine names).
 *
 * "Wiki consulted" signal (cheapest reliable): any tool call this session that
 * (a) reads a file under the wiki vault, or (b) is a bash command mentioning
 * the wiki vault path, the wiki profile config, or `wiki-query`. Once seen,
 * the ladder goes dormant for the rest of the session — the doctrine's "before"
 * ordering is satisfied. We watch the SAME tool_call stream we gate on, so the
 * signal costs nothing extra and needs no separate probe.
 *
 * Subagents: NO PI_SUBAGENT gate — mirrors graph-first (applies to dispatched
 * tasks too; a subagent that legitimately needs pi docs bypasses via identical
 * retry). read-only-default.ts is the extension that exempts subagents; this one
 * deliberately does not.
 *
 * The redirect is active ONLY when both the wiki vault dir and the wiki
 * profile config exist. The prompt link block is injected whenever any wiki
 * config is present. Everything is wrapped fail-open so it can never wedge a
 * session; no stats file, no flags (see the follow-up note in the task return
 * for the optional self-improving closure graph-first has).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyCwd, DEFAULT_DOMAIN, loadDomains, resolveWikiProfile } from "./lib/domains.ts";
import {
	CROSS_STORE_GUIDANCE,
	decide,
	makeRouterState,
	WIKI_CONFIG,
	WIKI_VAULT,
	PI_PKG,
	resetRouterState,
	type RouterAction,
	type RouterState,
} from "./lib/knowledge-router.ts";

/** The three doc roots under PI_PKG the WIKI-FIRST doctrine names. */
const DOC_SUBPATHS = ["README.md", "docs/", "examples/"];
const ACTIVE_WIKI_CONFIG = `${process.env.HOME ?? ""}/.obsidian-wiki/config`;

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
	if (existsSync(ACTIVE_WIKI_CONFIG)) {
		lines.push(`Active wiki: ${vaultPathFromConfig(ACTIVE_WIKI_CONFIG)} (config ${ACTIVE_WIKI_CONFIG}).`);
	}
	if (existsSync(WIKI_CONFIG) && existsSync(WIKI_VAULT)) {
		lines.push(
			`Pi wiki: ${WIKI_VAULT} (config ${WIKI_CONFIG}); use wiki-query here for durable pi knowledge.`,
		);
	}
	// Domain wikis (config/domains.json): name each configured domain's vault
	// so the model can cross over regardless of cwd (e.g. the prism wiki).
	try {
		for (const [id] of Object.entries(loadDomains())) {
			const profile = resolveWikiProfile(id);
			if (!profile || !existsSync(profile)) continue;
			const vault = vaultPathFromConfig(profile);
			if (!existsSync(vault)) continue;
			lines.push(`${id} wiki: ${vault} (config ${profile}); use wiki-query here for durable ${id}-domain knowledge.`);
		}
	} catch {
		/* fail open */
	}
	if (lines.length === 0) return undefined;
	return `\n\n## Wiki links (cwd-independent)\n\n${lines.join("\n")}\nThese are absolute links; keep using them even when cwd is an unrelated project.`;
}

// ---------------------------------------------------------------------------
// Pure classifiers + escalation decision (unit-tested: scripts/check-wiki-first.mjs)
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
 * Does this tool call READ one of pi's own doc files while the wiki sits
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
 * Does this tool call CONSULT the wiki (so the ladder goes dormant)? Any read
 * under the wiki vault, or a bash command naming the wiki vault / profile /
 * `wiki-query`. Pure.
 */
export function isWikiConsult(
	toolName: string,
	input: { path?: string; file_path?: string; command?: string },
	cwd: string,
): boolean {
	try {
		if (toolName === "read") {
			const raw = input.path ?? input.file_path;
			if (!raw) return false;
			return resolve(cwd || "/", raw).startsWith(`${WIKI_VAULT}/`);
		}
		if (toolName === "bash") {
			const cmd = input.command ?? "";
			return cmd.includes(WIKI_VAULT) || cmd.includes("config.wiki") || cmd.includes("wiki-query");
		}
	} catch {
		// fail open
	}
	return false;
}

export type WikiFirstAction = RouterAction;
export type WikiFirstState = RouterState;

/**
 * Escalation ladder (shared core, keyed by classifyPiDocRead's per-tool key).
 * First flagged read nudges; later ones block; an identical retry of a blocked
 * read always bypasses. Thin wrapper so the check imports this file's signature.
 */
export function decideAction(state: WikiFirstState, key: string, flagged: boolean): WikiFirstAction {
	return decide(state, key, flagged);
}

// ---------------------------------------------------------------------------
// Redirect messages (cross-store aware — deliverable 2). Pure + exported so the
// check asserts both stores are named. A pi-doc read is a pi-knowledge question
// by construction, so the primary line points at the wiki; CROSS_STORE_GUIDANCE
// names the `graph` tool for THIS repo's live code structure (the reverse door).
// ---------------------------------------------------------------------------

export function buildNudge(target: string): string {
	return (
		`[wiki-first] Pi-knowledge lookup (${target}) — the wiki vault is compiled knowledge, ` +
		`cheaper than a cold pi-docs read. Try \`wiki-query\` against the wiki profile ` +
		`(~/.obsidian-wiki/config.wiki) first. Read allowed this once. ${CROSS_STORE_GUIDANCE}`
	);
}

export function buildBlock(target: string): string {
	return (
		`[wiki-first] Consult the wiki before pi's own docs (${target}). Use \`wiki-query\` against ` +
		`the wiki profile (~/.obsidian-wiki/config.wiki). If the wiki genuinely lacks this, ` +
		`re-run the IDENTICAL read to proceed. ${CROSS_STORE_GUIDANCE}`
	);
}

// ---------------------------------------------------------------------------
// Session wiring
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let cwd = "/";
	let wikiConsulted = false;
	const state: WikiFirstState = makeRouterState();

	// Cheap existsSync each check (mirrors graph-first's active()); the vault or
	// config could appear/vanish mid-session.
	const active = (): boolean => existsSync(WIKI_VAULT) && existsSync(WIKI_CONFIG);

	pi.on("before_agent_start", async (event) => {
		const block = wikiLinkBlock();
		if (!block) return;
		return { systemPrompt: event.systemPrompt + block };
	});

	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.cwd || "/";
		wikiConsulted = false;
		resetRouterState(state);
	});

	pi.on("tool_call", async (event) => {
		try {
			if (event.toolName !== "read" && event.toolName !== "bash") return;
			if (!active()) return;
			const input = event.input as { path?: string; file_path?: string; command?: string };

			// Consult signal first: watching the same stream we gate on costs nothing.
			if (isWikiConsult(event.toolName, input, cwd)) {
				wikiConsulted = true;
				return;
			}
			if (wikiConsulted) return; // doctrine's "before" ordering satisfied

			const { flagged, target, key } = classifyPiDocRead(event.toolName, input, cwd);
			switch (decideAction(state, key, flagged)) {
				case "nudge":
					pi.events.emit("learning-violation", { doctrine: "wiki-first", detail: `nudge: ${target}` });
					pi.sendMessage(
						{
							customType: "wiki-first-nudge",
							display: true,
							content: buildNudge(target),
						},
						{ deliverAs: "nextTurn" },
					);
					return;
				case "block":
					pi.events.emit("learning-violation", { doctrine: "wiki-first", detail: `block: ${target}` });
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
