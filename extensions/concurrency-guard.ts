/**
 * Concurrency Guard Extension
 *
 * Makes concurrent pi sessions across different shells safe on ~/.pi/agent:
 *
 *   1. before_agent_start — if the config repo's HEAD advanced since this
 *      session last looked AND the new commits touch files THIS session did
 *      not edit, inject a one-line notice: another session/shell changed
 *      config — re-read before building on remembered content. (Snapshots of
 *      our own edits are filtered out, so autocommit stays silent.) The same
 *      detection emits "config-repo-advanced" on the shared event bus, which
 *      self-audit uses to auto-re-run validate-config.py so the injected
 *      problems track the new HEAD with no user action. Loaded resources
 *      (extensions/skills/prompts/themes/keybindings/AGENTS.md) can only be
 *      refreshed by pi's /reload, which cannot be triggered from an event hook
 *      (pi 0.80.3: sendUserMessage does not dispatch commands), so the notice
 *      tells the user to run /reload when those files changed.
 *   2. tool_call (edit/write) — if the target file under ~/.pi/agent is
 *      git-dirty but was NOT touched by this session, warn into the session:
 *      uncommitted changes from another shell are about to be built over.
 *
 * This mechanically enforces the archived lesson "edits in ~/.pi/agent can be
 * silently wiped by a concurrent session — grep the live file rather than
 * trusting session memory" (docs/config-index.md 2026-07-04). Fail-open:
 * any git failure disables the check for that event, never blocks a turn.
 */

import { execFileSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isReloadResource } from "./lib/config-paths.ts";

const AGENT_DIR = getAgentDir();

function git(...args: string[]): string {
	try {
		return execFileSync("git", ["-C", AGENT_DIR, ...args], {
			encoding: "utf8",
			timeout: 5_000,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

/** Repo-relative path if inside the agent dir, else undefined. */
function agentRel(path: string, cwd: string): string | undefined {
	const abs = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
	return abs.startsWith(AGENT_DIR + "/") ? abs.slice(AGENT_DIR.length + 1) : undefined;
}

export default function (pi: ExtensionAPI) {
	let lastKnownHead = "";
	/** Repo-relative paths this session has edited (so its own snapshots stay silent). */
	const touched = new Set<string>();
	const warnedDirty = new Set<string>();

	pi.on("session_start", async () => {
		lastKnownHead = git("rev-parse", "HEAD");
		touched.clear();
		warnedDirty.clear();
	});

	pi.on("before_agent_start", async (event) => {
		if (!lastKnownHead) return;
		const head = git("rev-parse", "HEAD");
		if (!head || head === lastKnownHead) return;
		const changed = git("diff", "--name-only", `${lastKnownHead}..${head}`)
			.split("\n")
			.filter(Boolean);
		const range = `${lastKnownHead.slice(0, 7)}..${head.slice(0, 7)}`;
		lastKnownHead = head;
		const foreign = changed.filter((f) => !touched.has(f));
		if (foreign.length === 0) return; // just autocommit snapshotting our own edits
		const list = foreign.slice(0, 8).join(", ") + (foreign.length > 8 ? ", ..." : "");
		// Auto-refresh the harness self-audit for this cross-shell change: self-audit
		// listens on this shared-bus signal and re-runs validate-config.py, so its
		// injected problems track the new HEAD with no user action and no reload. This
		// is loop-safe: it neither advances HEAD nor commits nor reloads, and
		// lastKnownHead was just advanced above so this range emits at most once.
		pi.events.emit("config-repo-advanced", { range, foreign });
		// Loaded resources (extensions/skills/prompts/themes/keybindings/AGENTS.md) can
		// only be refreshed by pi's /reload. ponytail: /reload cannot be triggered from
		// an event hook in pi 0.80.3 (sendUserMessage delivers slash text to the LLM,
		// it does not dispatch the command), so we tell the user to run it. Upgrade path:
		// auto-queue /reload once pi exposes reload() off a non-command context.
		const reloadHint = foreign.some(isReloadResource)
			? ` These include loaded resources (extensions/skills/prompts/themes/keybindings/AGENTS.md); their in-memory copies are now stale — tell the user to run /reload to refresh them (the conversation is preserved).`
			: "";
		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Concurrent-session notice (~/.pi/agent)\n\n` +
				`The config repo advanced (${range}) since this session last looked, touching files ` +
				`this session did not edit: ${list}. Another shell/session (or its autocommit) changed them — ` +
				`RE-READ any of these before building on remembered content (git log ${range} for details). ` +
				`The harness self-audit was auto-refreshed to reflect this change.` +
				reloadHint,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		try {
			if (event.toolName !== "edit" && event.toolName !== "write") return;
			const input = event.input as { path?: string } | undefined;
			if (!input?.path) return;
			const rel = agentRel(input.path, ctx.cwd);
			if (!rel) return;
			if (touched.has(rel)) return;
			const dirty = git("status", "--porcelain", "--", rel);
			touched.add(rel);
			if (dirty && !warnedDirty.has(rel)) {
				warnedDirty.add(rel);
				pi.sendMessage(
					{
						customType: "concurrency-guard",
						content:
							`[concurrency-guard] ${rel} has UNCOMMITTED changes this session did not make ` +
							`(another shell is editing it). Re-read the live file before this edit lands, or ` +
							`you may clobber concurrent work.`,
						display: true,
					},
					{ triggerTurn: false },
				);
			}
		} catch {
			// fail-open: never block a tool call
		}
	});
}
