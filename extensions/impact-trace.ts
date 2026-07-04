/**
 * Impact-Trace Extension
 *
 * Every successful edit/write surfaces its graph dependents. When
 * graphify-out/graph.json exists, after an edit the extension resolves the file
 * repo-relative, looks up its nodes in the graph, and collects INBOUND
 * cross-file references (other files whose nodes point at this file's nodes via
 * references/calls/imports/… edges). If any exist it injects one small message:
 *
 *   [impact-trace] <file> is referenced by: <fileA>:<line> (references), … —
 *   verify each reflects the change.
 *
 * The list is capped at 10 (+ "…and N more"). A "(graph may be stale — rebuilt
 * on commit)" note is appended when graph.json predates the edit or the
 * needs_update flag is set (mirrors graphify-bridge staleness). Debounced once
 * per file per session. Silent when there are no inbound refs, the file is not
 * in the graph, graphify-out/ is absent, or on ANY error — never wedge an edit.
 *
 * Follow-through closure: dependents that were flagged but never subsequently
 * edited this session get ONE summary reminder at agent_end. No auto-dispatch,
 * no blocking. Applies to subagents too.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGraphRoot, inboundRefs, isGraphStale, loadGraph, markSeen, OUT } from "./lib/graph-lookup.ts";

const MAX_LIST = 10;

export default function (pi: ExtensionAPI) {
	let root: string | undefined;
	const reportedFiles = new Set<string>(); // debounce: files already reported (once per session)
	const flaggedDeps = new Set<string>(); // dependents we surfaced
	const editedFiles = new Set<string>(); // files edited this session
	let turn = 0;
	let followupSent = false;

	pi.on("session_start", async (_event, ctx) => {
		root = findGraphRoot(ctx.cwd);
		reportedFiles.clear();
		flaggedDeps.clear();
		editedFiles.clear();
		turn = 0;
		followupSent = false;
	});

	pi.on("tool_result", async (event, ctx) => {
		try {
			if (event.toolName !== "edit" && event.toolName !== "write") return;
			if (event.isError) return;
			if (!root || !existsSync(join(root, OUT, "graph.json"))) return;

			const input = event.input as { path?: string; file_path?: string };
			const rawPath = input.path ?? input.file_path;
			if (!rawPath) return;
			const abs = isAbsolute(rawPath) ? rawPath : resolve(ctx.cwd, rawPath);
			const rel = relative(root, abs);
			if (!rel || rel.startsWith("..")) return; // outside the graph root

			editedFiles.add(rel); // track every edit (so a later edit clears a flagged dep)
			if (!markSeen(reportedFiles, rel)) return; // debounce: once per file per session

			const graph = loadGraph(root);
			if (!graph) return;
			const refs = inboundRefs(graph, rel);
			if (refs.length === 0) return;

			let stale = false;
			try {
				stale = isGraphStale(root, graph.mtimeMs, statSync(abs).mtimeMs);
			} catch {
				// stat failure → treat as not-stale; the refs still stand
			}

			for (const r of refs) if (r.file !== rel) flaggedDeps.add(r.file);

			const shown = refs
				.slice(0, MAX_LIST)
				.map((r) => `${r.file}${r.line ? `:${r.line}` : ""} (${r.relation})`);
			const more = refs.length > MAX_LIST ? ` …and ${refs.length - MAX_LIST} more` : "";
			const note = stale ? " (graph may be stale — rebuilt on commit)" : "";

			pi.sendMessage(
				{
					customType: "impact-trace",
					display: true,
					content: `[impact-trace] ${rel} is referenced by: ${shown.join(", ")}${more} — verify each reflects the change.${note}`,
				},
				{ deliverAs: "nextTurn" },
			);
		} catch {
			// never wedge an edit
		}
	});

	pi.on("agent_end", async () => {
		try {
			turn++;
			// Grace: only remind once at least one extra loop has passed, so a
			// dependent flagged this turn isn't nagged before the agent can act.
			if (followupSent || turn < 2) return;
			const pending = [...flaggedDeps].filter((dep) => !editedFiles.has(dep));
			if (pending.length === 0) return;
			followupSent = true;
			const shown = pending.slice(0, MAX_LIST).join(", ");
			const more = pending.length > MAX_LIST ? ` …and ${pending.length - MAX_LIST} more` : "";
			pi.sendMessage(
				{
					customType: "impact-trace-followup",
					display: true,
					content: `[impact-trace] Flagged dependents not touched this session: ${shown}${more}. Confirm they need no change.`,
				},
				{ deliverAs: "nextTurn" },
			);
		} catch {
			// never block a turn
		}
	});
}
