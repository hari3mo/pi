/**
 * Graphify Bridge Extension
 *
 * Native integration between pi and the graphify knowledge graph
 * (graphify-out/graph.json), so the harness can answer questions about
 * itself from the graph instead of re-reading files:
 *
 *   1. before_agent_start — injects a compact (~600 char) graph block into the
 *      system prompt: size, top hubs, staleness, and an instruction to answer
 *      codebase/architecture questions via the `graph` tool first.
 *   2. `graph` tool — query / explain / path / status against the nearest
 *      graphify-out/graph.json, shelling out to the pinned graphify Python.
 *   3. /graph command — status for humans; `/graph update` re-runs the free
 *      AST rebuild + recluster (code only; doc changes need /graphify --update).
 *   4. session_start — fire-and-forget `graphify reflect --if-stale` so
 *      LESSONS.md (preferred sources / dead ends from past queries) stays fresh.
 *
 * Retrieval works in any project that has a graphify-out/ (walks up from cwd).
 * Updates are driven by the git post-commit hook (`graphify hook install`),
 * which re-extracts changed code files and reclusters on every snapshot.
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OUT = "graphify-out";
const TOOL_OUTPUT_CAP = 12_000;
const QUERY_TIMEOUT_MS = 60_000;
const UPDATE_TIMEOUT_MS = 300_000;

/** Walk up from cwd to the nearest directory containing graphify-out/graph.json. */
function findGraphRoot(cwd: string): string | undefined {
	let dir = cwd;
	for (;;) {
		if (existsSync(join(dir, OUT, "graph.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/** Pinned interpreter written by the graphify skill/CLI; safest entry point (uv/pipx safe). */
function graphifyPython(root: string): string {
	try {
		const p = readFileSync(join(root, OUT, ".graphify_python"), "utf8").trim();
		// Allowlist path characters (mirrors graphify's own hook probe).
		if (p && !/[^a-zA-Z0-9/_.@:\\-]/.test(p) && existsSync(p)) return p;
	} catch {
		// fall through
	}
	return "python3";
}

function runGraphify(root: string, args: string[], timeoutMs: number): Promise<string> {
	return new Promise((resolve) => {
		execFile(
			graphifyPython(root),
			["-m", "graphify", ...args],
			{ cwd: root, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
			(err, stdout, stderr) => {
				const out = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
				resolve(err && !out ? `graphify error: ${err.message}` : out);
			},
		);
	});
}

interface GraphStats {
	nodes: number;
	edges: number;
	communities: number;
	hubs: string[];
	updated: Date;
	stale: boolean;
	hasLessons: boolean;
}

/** Cheap stats straight from graph.json, cached by mtime. */
let statsCache: { root: string; mtimeMs: number; stats: GraphStats } | undefined;
function graphStats(root: string): GraphStats | undefined {
	try {
		const graphPath = join(root, OUT, "graph.json");
		const mtimeMs = statSync(graphPath).mtimeMs;
		if (statsCache && statsCache.root === root && statsCache.mtimeMs === mtimeMs) {
			// stale flag can change independently of graph.json; refresh it alone
			statsCache.stats.stale = existsSync(join(root, OUT, "needs_update"));
			return statsCache.stats;
		}
		const data = JSON.parse(readFileSync(graphPath, "utf8")) as {
			nodes: { id: string; label?: string; community?: number }[];
			links: { source: string; target: string }[];
		};
		const degree = new Map<string, number>();
		for (const l of data.links) {
			degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
			degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
		}
		const labelOf = new Map(data.nodes.map((n) => [n.id, n.label ?? n.id]));
		const hubs = [...degree.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([id]) => (labelOf.get(id) ?? id).slice(0, 48));
		const stats: GraphStats = {
			nodes: data.nodes.length,
			edges: data.links.length,
			communities: new Set(data.nodes.map((n) => n.community)).size,
			hubs,
			updated: new Date(mtimeMs),
			stale: existsSync(join(root, OUT, "needs_update")),
			hasLessons: existsSync(join(root, OUT, "reflections", "LESSONS.md")),
		};
		statsCache = { root, mtimeMs, stats };
		return stats;
	} catch {
		return undefined;
	}
}

function fmtAge(d: Date): string {
	const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
	if (mins < 60) return `${mins}m ago`;
	if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
	return `${Math.round(mins / (60 * 24))}d ago`;
}

function statusText(root: string): string {
	const s = graphStats(root);
	if (!s) return `graph.json unreadable under ${root}/${OUT}/`;
	return [
		`graph: ${s.nodes} nodes · ${s.edges} edges · ${s.communities} communities (updated ${fmtAge(s.updated)})`,
		`hubs: ${s.hubs.join(", ")}`,
		s.stale
			? "STALE: docs/images changed since last extraction — run /graphify --update (LLM re-extract). Code stays fresh via the post-commit hook."
			: "fresh: code changes rebuild automatically on commit",
		s.hasLessons ? `lessons: ${OUT}/reflections/LESSONS.md` : "",
	]
		.filter(Boolean)
		.join("\n");
}

const GraphParams = Type.Object({
	action: StringEnum(["query", "explain", "path", "status"], {
		description:
			"query: BFS traversal answering a question. explain: one node + its connections. path: shortest path between two concepts. status: size/hubs/staleness.",
	}),
	q: Type.Optional(Type.String({ description: "Question (query), node name (explain), or path start (path)" })),
	target: Type.Optional(Type.String({ description: "Path end node (path action only)" })),
	budget: Type.Optional(Type.Number({ description: "Token budget for query output (default 2000)" })),
});

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const root = findGraphRoot(ctx.cwd);
		if (!root) return;
		// Keep LESSONS.md current for this session; cheap no-op when fresh.
		execFile(graphifyPython(root), ["-m", "graphify", "reflect", "--if-stale"], { cwd: root, timeout: 30_000 }, () => {
			// Fire-and-forget: reflection failure must never block a session.
		});
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const root = findGraphRoot(ctx.cwd);
		if (!root) return;
		const s = graphStats(root);
		if (!s) return;
		const block = [
			`\n\n## Knowledge graph (graphify)`,
			`${OUT}/graph.json — ${s.nodes} nodes · ${s.edges} edges · ${s.communities} communities (updated ${fmtAge(s.updated)}${s.stale ? "; STALE for docs — suggest /graphify --update" : ""}).`,
			`Hubs: ${s.hubs.join(", ")}.`,
			`Answer questions about this codebase's structure/architecture with the \`graph\` tool (query/explain/path) BEFORE reading files or dispatching scouts — it is ~30x cheaper than reading.` +
				(s.hasLessons ? ` Past-query lessons: ${OUT}/reflections/LESSONS.md.` : ""),
		].join("\n");
		return { systemPrompt: event.systemPrompt + block };
	});

	pi.registerTool({
		name: "graph",
		label: "Graph",
		description:
			"Query the graphify knowledge graph of this codebase (graphify-out/graph.json). Actions: query (answer a question via traversal), explain (a node and its connections), path (shortest path between two concepts), status (size, hubs, staleness).",
		parameters: GraphParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = findGraphRoot(ctx.cwd);
			if (!root) {
				return { content: [{ type: "text", text: "No graphify-out/graph.json found — build one with /graphify first." }] };
			}
			let text: string;
			switch (params.action) {
				case "status":
					text = statusText(root);
					break;
				case "query": {
					if (!params.q) return { content: [{ type: "text", text: "Error: q required for query" }] };
					const args = ["query", params.q];
					if (params.budget) args.push("--budget", String(params.budget));
					text = await runGraphify(root, args, QUERY_TIMEOUT_MS);
					break;
				}
				case "explain":
					if (!params.q) return { content: [{ type: "text", text: "Error: q required for explain" }] };
					text = await runGraphify(root, ["explain", params.q], QUERY_TIMEOUT_MS);
					break;
				case "path":
					if (!params.q || !params.target) {
						return { content: [{ type: "text", text: "Error: q and target required for path" }] };
					}
					text = await runGraphify(root, ["path", params.q, params.target], QUERY_TIMEOUT_MS);
					break;
			}
			if (text.length > TOOL_OUTPUT_CAP) text = `${text.slice(0, TOOL_OUTPUT_CAP)}\n... (truncated)`;
			return { content: [{ type: "text", text: text || "(no output)" }] };
		},
	});

	pi.registerCommand("graph", {
		description: "Knowledge graph: /graph (status) or /graph update (AST rebuild + recluster)",
		getArgumentCompletions: () => [
			{ value: "status", label: "size, hubs, staleness" },
			{ value: "update", label: "re-extract changed code + recluster (no LLM)" },
		],
		handler: async (args, ctx) => {
			const root = findGraphRoot(ctx.cwd);
			if (!root) {
				ctx.ui.notify("No graphify-out/graph.json found — build one with /graphify first.", "warning");
				return;
			}
			const sub = (args ?? "").trim();
			if (sub === "update") {
				ctx.ui.notify("Rebuilding graph (AST + recluster, no LLM)...", "info");
				const out = await new Promise<string>((resolve) => {
					execFile(
						graphifyPython(root),
						[
							"-c",
							// Code-only refresh: pass the code corpus as changed_paths so graphify's
							// .md structural extractor never replaces the semantic (LLM) doc layer.
							"from pathlib import Path; from graphify.detect import detect; from graphify.watch import _rebuild_code; root = Path('.'); code = [Path(f) for f in detect(root)['files']['code']]; _rebuild_code(root, changed_paths=code)",
						],
						{ cwd: root, timeout: UPDATE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
						(err, stdout, stderr) => resolve(err ? `rebuild failed: ${err.message}\n${stderr}` : `${stdout}`.trim()),
					);
				});
				statsCache = undefined;
				ctx.ui.notify(out.split("\n").slice(-2).join(" ") || "Graph rebuilt.", "info");
				return;
			}
			ctx.ui.notify(statusText(root), "info");
		},
	});
}
