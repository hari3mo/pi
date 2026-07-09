/**
 * Graph-First Extension
 *
 * Structure-shaped code searches belong in the knowledge graph, not grep.
 * When graphify-out/graph.json exists, this watches the `bash` tool for
 * grep/rg commands that are hunting a symbol definition/reference/import and
 * steers them to the `graph` tool with a per-session escalation ladder:
 *
 *   FIRST structure-shaped grep  → allow, inject a one-line nudge naming the
 *                                  equivalent `graph explain '<id>'` call.
 *   SECOND and later             → BLOCK, with a reason that tells the model to
 *                                  re-run the IDENTICAL command to proceed if
 *                                  the graph genuinely could not answer.
 *   identical retry of a block   → always allowed (recorded as a bypass).
 *
 * Conservative by design: content greps (log strings, TODOs, data values) pass
 * untouched — a false positive (blocking a real content search) is worse than a
 * miss. Only `bash` grep/rg is ever touched; nothing else is blocked.
 *
 * Self-improving closure: per-session {nudges, blocks, bypasses} are appended to
 * graphify-out/.graph_first_stats.json (atomic, ~50 records). At agent_end, if
 * bypasses ≥ blocks (>0) the graph is consistently failing to answer, so one
 * nudge suggests a `/graphify --update` re-cache. scripts/audit-pipelines.py
 * WARNs when the recorded bypass ratio stays high across sessions.
 *
 * Inert and silent when graphify-out/ is absent; applies to subagents too;
 * everything is wrapped fail-open so it can never wedge a session.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGraphLoc, type GraphLoc, OUT } from "./lib/graph-lookup.ts";
import { persistStatsRecord } from "./lib/stats-store.ts";
import {
	CROSS_STORE_GUIDANCE,
	decide,
	grepIsWikiQuestion,
	makeRouterState,
	resetRouterState,
	type RouterAction,
	type RouterState,
} from "./lib/knowledge-router.ts";

const STATS_FILE = ".graph_first_stats.json";
const MAX_RECORDS = 50;

/** def/class/… — a structure keyword ANCHORED at the start of the pattern. */
const STRUCTURE_KEYWORD_RE = /^(def|class|function|interface|type|const|import|from|require)\b/;

// ---------------------------------------------------------------------------
// Pure classifier + escalation decision (unit-tested: scripts/check-graph-first.mjs)
// ---------------------------------------------------------------------------

export interface GrepClassification {
	flagged: boolean;
	identifier: string;
}

/**
 * Is `command` a grep/rg search hunting a code symbol (vs. content)? Returns
 * the best-guess identifier for the nudge. Self-contained so the check can
 * import it in isolation.
 */
export function classifyStructureGrep(command: string): GrepClassification {
	const none = { flagged: false, identifier: "" };
	if (!command) return none;

	// Quote-aware tokenizer (handles '...', "...", and backslash escapes).
	const tokenize = (cmd: string): string[] => {
		const out: string[] = [];
		let cur = "";
		let inS = false;
		let inD = false;
		let has = false;
		for (let i = 0; i < cmd.length; i++) {
			const c = cmd[i];
			if (inS) {
				if (c === "'") inS = false;
				else cur += c;
				continue;
			}
			if (inD) {
				if (c === '"') inD = false;
				else if (c === "\\" && i + 1 < cmd.length) cur += cmd[++i];
				else cur += c;
				continue;
			}
			if (c === "'") {
				inS = true;
				has = true;
				continue;
			}
			if (c === '"') {
				inD = true;
				has = true;
				continue;
			}
			if (c === "\\" && i + 1 < cmd.length) {
				cur += cmd[++i];
				has = true;
				continue;
			}
			if (/\s/.test(c)) {
				if (has) {
					out.push(cur);
					cur = "";
					has = false;
				}
				continue;
			}
			cur += c;
			has = true;
		}
		if (has) out.push(cur);
		return out;
	};

	const tokens = tokenize(command);
	// Find the grep/rg command token (basename), tolerating a leading pipeline.
	const isGrep = (t: string): boolean => /^(.*\/)?(grep|egrep|fgrep|rg)$/.test(t);
	const gi = tokens.findIndex(isGrep);
	if (gi === -1) return none;

	// Flags that consume the NEXT token as a value (so it is not the pattern).
	const VALUE_FLAGS = new Set([
		"-e", "--regexp", "-f", "--file", "-m", "--max-count", "-A", "-B", "-C",
		"--after-context", "--before-context", "--context", "--color", "--colour",
		"-g", "--glob", "--iglob", "-t", "--type", "-T", "--type-not", "--replace",
		"--pre", "--sort", "--sortr", "--exclude", "--exclude-dir", "--include-dir",
		"-d", "--directories", "-D", "--devices", "--binary-files",
	]);

	let repoWide = false;
	let pattern: string | undefined;
	const globValues: string[] = []; // --include/--glob/--iglob values (target guard)
	const pathArgs: string[] = []; // positional path args after the pattern
	for (let i = gi + 1; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok.startsWith("-") && tok !== "-") {
			if (tok === "-r" || tok === "-R" || tok === "--recursive") {
				repoWide = true;
				continue;
			}
			// --flag=value forms: capture the regexp pattern and include/glob globs.
			const eq = tok.indexOf("=");
			if (eq !== -1) {
				const name = tok.slice(0, eq);
				const val = tok.slice(eq + 1);
				if (name === "--regexp") {
					if (pattern === undefined) pattern = val;
				} else if (name === "--include" || name === "--glob" || name === "--iglob") {
					repoWide = true;
					globValues.push(val);
				}
				continue; // any other --flag=value is self-contained
			}
			// --glob/--iglob/-g take their glob in the NEXT token.
			if (tok === "-g" || tok === "--glob" || tok === "--iglob") {
				repoWide = true;
				if (i + 1 < tokens.length) globValues.push(tokens[i + 1]);
				i++;
				continue;
			}
			if (tok === "--include") {
				repoWide = true; // grep --include needs '='; bare form is inert
				continue;
			}
			if (tok === "-e" || tok === "--regexp") {
				if (pattern === undefined && i + 1 < tokens.length) pattern = tokens[i + 1];
				i++;
				continue;
			}
			if (VALUE_FLAGS.has(tok)) {
				i++; // skip the flag's value token
				continue;
			}
			// A short-flag cluster like -rn / -Rl carries recursion.
			if (/^-[A-Za-z]+$/.test(tok) && /[rR]/.test(tok)) repoWide = true;
			continue; // boolean / unknown flag
		}
		if (pattern === undefined) pattern = tok; // first positional is the search pattern
		else pathArgs.push(tok); // subsequent positionals are search paths
	}

	if (pattern === undefined) return none;

	// --- TARGET guard (a): a search scoped to a non-code context is content. ---
	// A doc/log/text glob (*.md/*.txt/*.log/*.rst) or a path under docs//logs//
	// *.log/README* means the user is grepping prose — pass untouched. This is the
	// primary defense: a blocked legit content grep is the worst failure.
	const DOC_EXT_RE = /\.(?:md|txt|log|rst)$/i;
	const nonCodeGlob = (g: string): boolean => DOC_EXT_RE.test(g);
	const nonCodePath = (p: string): boolean =>
		DOC_EXT_RE.test(p) || /(?:^|\/)(?:docs|logs)(?:\/|$)/.test(p) || /(?:^|\/)README[^/]*$/i.test(p);
	if (globValues.some(nonCodeGlob) || pathArgs.some(nonCodePath)) return none;

	// Structure keyword anchored at the start of the pattern (after regex ^).
	const normalized = pattern.replace(/^[\s^]+/, "");
	const words = normalized.split(/\s+/).filter(Boolean);
	const kw = STRUCTURE_KEYWORD_RE.exec(normalized);
	if (kw) {
		// PROSE guard (b): a ≥3-word pattern is a sentence, not a declaration
		// ("class action lawsuit") — content, pass.
		if (words.length >= 3) return none;
		// Guard (c): the keyword must be immediately followed by a real identifier
		// to be a symbol search ("def my_func"); a bare keyword or keyword+non-id is
		// ambiguous — pass. (Non-code targets already returned above via guard a.)
		const after = normalized.slice(kw[0].length).replace(/^[\s^\\b]+/, "");
		const idMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(after);
		if (!idMatch) return none;
		return { flagged: true, identifier: idMatch[0].slice(0, 48) };
	}

	// A bare identifier searched repo-wide. Exclude all-caps content markers
	// (TODO/FIXME/ERROR/WARN…) — a symbol has a lowercase letter or an underscore.
	const isSymbol =
		/^[A-Za-z_][A-Za-z0-9_]*$/.test(pattern) &&
		pattern.length >= 2 &&
		(/[a-z]/.test(pattern) || pattern.includes("_"));
	if (isSymbol && repoWide) return { flagged: true, identifier: pattern.slice(0, 48) };

	return none;
}

export type GraphFirstAction = RouterAction;
export type GraphFirstState = RouterState;

/**
 * Escalation ladder (shared core, keyed by the trimmed command). First flagged
 * grep nudges; later ones block; an identical retry of a blocked command always
 * bypasses. Thin wrapper so the check imports this file's stable signature.
 */
export function decideAction(state: GraphFirstState, command: string, flagged: boolean): GraphFirstAction {
	return decide(state, command.trim(), flagged);
}

// ---------------------------------------------------------------------------
// Redirect messages (cross-store aware — deliverable 2). Pure + exported so the
// check asserts both stores are named and the wiki-targeted grep leads with
// the wiki. A structure grep into pi's OWN source / the wiki vault is a
// pi-knowledge question the local graph cannot answer → point at the wiki.
// ---------------------------------------------------------------------------

export function buildNudge(identifier: string, command: string): string {
	const primary = grepIsWikiQuestion(command)
		? `[graph-first] This greps pi's own source / the wiki vault — the local graph does not ` +
			`index it. Try \`wiki-query\` against the wiki profile (~/.obsidian-wiki/config.wiki) instead. ` +
			`grep allowed this once.`
		: `[graph-first] Structure search — the \`graph\` tool is ~30x cheaper than grep. ` +
			`Try: explain '${identifier}' (or query). grep allowed this once.`;
	return `${primary} ${CROSS_STORE_GUIDANCE}`;
}

export function buildBlock(identifier: string, command: string): string {
	const primary = grepIsWikiQuestion(command)
		? `[graph-first] This targets pi's own source / the wiki vault — consult the wiki, not the ` +
			`local graph: \`wiki-query\` (~/.obsidian-wiki/config.wiki). If it genuinely lacks this, ` +
			`re-run the IDENTICAL command to proceed.`
		: `[graph-first] Structure searches should hit the knowledge graph first. Use the \`graph\` tool: ` +
			`explain '${identifier}' (or query). If the graph genuinely cannot answer, re-run the ` +
			`IDENTICAL command to proceed.`;
	return `${primary} ${CROSS_STORE_GUIDANCE}`;
}

// ---------------------------------------------------------------------------
// Session wiring
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let loc: GraphLoc | undefined;
	let sessionId = "";
	const state: GraphFirstState = makeRouterState();
	const counts = { nudges: 0, blocks: 0, bypasses: 0 };
	let endNudgeSent = false;
	let lastPersistedTotal = -1;

	const active = (): GraphLoc | undefined =>
		loc && existsSync(join(loc.root, loc.out, "graph.json")) ? loc : undefined;

	pi.on("session_start", async (_event, ctx) => {
		loc = findGraphLoc(ctx.cwd);
		sessionId = `${new Date().toISOString()}-${process.pid}`;
		resetRouterState(state);
		counts.nudges = 0;
		counts.blocks = 0;
		counts.bypasses = 0;
		endNudgeSent = false;
		lastPersistedTotal = -1;
	});

	pi.on("tool_call", async (event) => {
		try {
			if (event.toolName !== "bash") return;
			if (!active()) return;
			const command = (event.input as { command?: string }).command ?? "";
			const { flagged, identifier } = classifyStructureGrep(command);
			const action = decideAction(state, command, flagged);
			switch (action) {
				case "nudge":
					counts.nudges++;
					pi.events.emit("learning-violation", { doctrine: "graph-first", detail: `nudge: ${command.slice(0, 200)}` });
					pi.sendMessage(
						{
							customType: "graph-first-nudge",
							display: true,
							content: buildNudge(identifier, command),
						},
						{ deliverAs: "nextTurn" },
					);
					return;
				case "block":
					counts.blocks++;
					pi.events.emit("learning-violation", { doctrine: "graph-first", detail: `block: ${command.slice(0, 200)}` });
					return {
						block: true,
						reason: buildBlock(identifier, command),
					};
				case "bypass":
					counts.bypasses++;
					return;
				default:
					return;
			}
		} catch {
			// fail open: never let the detector crash a bash call
		}
	});

	pi.on("agent_end", async () => {
		try {
			const l = loc; // stats persist even if graph.json was removed mid-session
			if (!l) return;
			// Stats stay machine-local: skip persisting into a non-standard domain
			// graph dir (e.g. prism-graph/ inside the synced prism-oracle repo) —
			// a per-session stats file there would sync as noise.
			const total = counts.nudges + counts.blocks + counts.bypasses;
			if (l.out === OUT && total > 0 && total !== lastPersistedTotal) {
				persistStatsRecord(
					join(l.root, l.out, STATS_FILE),
					{
						id: sessionId,
						ts: Date.now(),
						nudges: counts.nudges,
						blocks: counts.blocks,
						bypasses: counts.bypasses,
					},
					MAX_RECORDS,
				);
				lastPersistedTotal = total;
			}
			if (!endNudgeSent && counts.blocks > 0 && counts.bypasses >= counts.blocks) {
				endNudgeSent = true;
				pi.sendMessage(
					{
						customType: "graph-first-drift",
						display: true,
						content:
							`[graph-first] The knowledge graph repeatedly could not answer structure searches this ` +
							`session (${counts.bypasses} bypass(es) ≥ ${counts.blocks} block(s)). Re-cache with ` +
							`\`/graphify --update\`, or capture what it is missing with learn_heuristic.`,
					},
					{ deliverAs: "nextTurn" },
				);
			}
		} catch {
			// never block a turn
		}
	});
}
