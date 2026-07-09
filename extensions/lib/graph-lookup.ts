/**
 * Shared graphify graph.json access for the graph-aware extensions
 * (graph-first.ts, impact-trace.ts).
 *
 * Pure (only node:fs / node:path) so it loads under jiti without the pi
 * package on the module path and is unit-testable in isolation
 * (scripts/check-impact-trace.mjs). Mirrors the lib/config-paths.ts pattern.
 *
 * The real graph.json (graphify networkx export) uses:
 *   - top-level `links` (older/other exports may use `edges` — handled)
 *   - nodes: { id, source_file: "<repo-rel>", source_location: "L<line>", ... }
 *   - links: { source, target, relation, source_file, source_location, ... }
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { classifyCwd, DEFAULT_DOMAIN, resolveGraphDir } from "./domains.ts";

export const OUT = "graphify-out";

/** Walk up from cwd to the nearest directory containing graphify-out/graph.json. */
export function findGraphRoot(cwd: string): string | undefined {
	let dir = cwd;
	for (;;) {
		if (existsSync(join(dir, OUT, "graph.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/** A located graph: `root` + the subdir under it holding graph.json (usually OUT). */
export interface GraphLoc {
	root: string;
	out: string;
}

/**
 * Domain-aware graph location (v2, config/domains.json). A cwd classifying to
 * a non-default domain resolves to that domain's dedicated graph dir (e.g.
 * prism → <prism-oracle>/prism-graph, which holds graph.json DIRECTLY — no
 * graphify-out nesting). Falls back to the plain walk-up. Fail-open: any
 * domain-config problem behaves exactly like v1.
 */
export function findGraphLoc(cwd: string): GraphLoc | undefined {
	try {
		const domain = classifyCwd(cwd);
		if (domain !== DEFAULT_DOMAIN) {
			const gdir = resolveGraphDir(domain);
			if (gdir && existsSync(join(gdir, "graph.json"))) {
				return { root: dirname(gdir), out: basename(gdir) };
			}
		}
	} catch {
		/* fail open → v1 behavior */
	}
	const found = findGraphRoot(cwd);
	return found ? { root: found, out: OUT } : undefined;
}

/**
 * Pinned graphify interpreter written by the graphify skill/CLI (uv/pipx-safe);
 * falls back to system python3. Allowlists path chars (mirrors graphify's own
 * hook probe) before trusting the recorded path.
 */
export function graphifyPython(root: string, out: string = OUT): string {
	try {
		const p = readFileSync(join(root, out, ".graphify_python"), "utf8").trim();
		if (p && !/[^a-zA-Z0-9/_.@:\\-]/.test(p) && existsSync(p)) return p;
	} catch {
		// fall through to system python
	}
	return "python3";
}

export interface GraphNode {
	id: string;
	source_file?: string;
	source_location?: string;
	[k: string]: unknown;
}
export interface GraphLink {
	source: string;
	target: string;
	relation?: string;
	source_file?: string;
	source_location?: string;
	[k: string]: unknown;
}
export interface RawGraph {
	nodes?: GraphNode[];
	links?: GraphLink[];
	edges?: GraphLink[];
}
export interface LoadedGraph {
	nodes: GraphNode[];
	links: GraphLink[];
	mtimeMs: number;
}

/** Lazy parse of graph.json, cached by (root, mtime) so re-edits are cheap. */
let cache: { root: string; mtimeMs: number; graph: LoadedGraph } | undefined;
export function loadGraph(root: string): LoadedGraph | undefined {
	try {
		const p = join(root, OUT, "graph.json");
		const mtimeMs = statSync(p).mtimeMs;
		if (cache && cache.root === root && cache.mtimeMs === mtimeMs) return cache.graph;
		const data = JSON.parse(readFileSync(p, "utf8")) as RawGraph;
		const graph: LoadedGraph = {
			nodes: data.nodes ?? [],
			links: data.links ?? data.edges ?? [],
			mtimeMs,
		};
		cache = { root, mtimeMs, graph };
		return graph;
	} catch {
		return undefined;
	}
}

export interface InboundRef {
	file: string;
	line?: string;
	relation: string;
}

/**
 * Cross-file INBOUND references to `relPath`: edges from nodes in OTHER files
 * that point at a node whose source_file === relPath. These are the dependents
 * that may need to reflect a change to relPath.
 *
 * Excludes intra-file tree edges (`contains`) and purely semantic edges
 * (conceptually_related_to / semantically_similar_to / rationale_for) — those
 * are not "someone depends on this code" signals. Any other/new relation type
 * is treated as a dependency by default (defensive against graph evolution).
 * Deduped by (file, line, relation); order preserved.
 */
export function inboundRefs(graph: RawGraph, relPath: string): InboundRef[] {
	const NON_DEPENDENT = new Set([
		"contains",
		"conceptually_related_to",
		"semantically_similar_to",
		"rationale_for",
	]);
	const nodes = graph.nodes ?? [];
	const links = graph.links ?? graph.edges ?? [];
	const byId = new Map<string, GraphNode>();
	const targetIds = new Set<string>();
	for (const n of nodes) {
		byId.set(n.id, n);
		if (n.source_file === relPath) targetIds.add(n.id);
	}
	if (targetIds.size === 0) return [];

	const out: InboundRef[] = [];
	const seen = new Set<string>();
	for (const l of links) {
		if (!targetIds.has(l.target)) continue;
		const relation = l.relation ?? "references";
		if (NON_DEPENDENT.has(relation)) continue;
		const srcNode = byId.get(l.source);
		const file = srcNode?.source_file ?? l.source_file;
		if (!file || file === relPath) continue; // intra-file or unresolved source
		const line = l.source_location ?? srcNode?.source_location ?? undefined;
		const key = `${file}|${line ?? ""}|${relation}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ file, line, relation });
	}
	return out;
}

/** True the FIRST time a key is seen; false thereafter. Backs per-session debounce. */
export function markSeen(seen: Set<string>, key: string): boolean {
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
}

/**
 * The graph is stale w.r.t. an edit when the doc-semantics flag is set OR the
 * graph.json predates the edited file (the recorded refs are from before this
 * edit; a commit rebuilds the graph). Mirrors graphify-bridge's `needs_update`.
 */
export function isGraphStale(root: string, graphMtimeMs: number, fileMtimeMs: number): boolean {
	if (existsSync(join(root, OUT, "needs_update"))) return true;
	return graphMtimeMs < fileMtimeMs;
}
