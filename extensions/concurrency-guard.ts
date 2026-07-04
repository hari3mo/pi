/**
 * Concurrency Guard Extension
 *
 * Makes concurrent pi sessions across different shells safe on ~/.pi/agent:
 *
 *   1. before_agent_start — if the config repo's HEAD advanced since this
 *      session last looked, classify each committed file. Files THIS session
 *      did not edit → a plain foreign-change notice. Files this session DID
 *      edit are content-checked: the committed blob is compared to the hash we
 *      recorded on our last write — a match is our own autocommit snapshot
 *      (stay silent, no false positives), a mismatch is the highest-risk case
 *      (another session committed DIFFERENT content over a file we edited) and
 *      gets its own "re-read before further edits" notice. The same
 *      detection emits "config-repo-advanced" on the shared event bus, which
 *      self-audit uses to auto-re-run validate-config.py so the injected
 *      problems track the new HEAD with no user action. Loaded resources
 *      (extensions/skills/prompts/themes/keybindings/AGENTS.md) can only be
 *      refreshed by pi's /reload, which cannot be triggered from an event hook
 *      (pi 0.80.3: sendUserMessage does not dispatch commands), so the notice
 *      tells the user to run /reload when those files changed.
 *   2. tool_call (edit/write) — if the target file under ~/.pi/agent is
 *      git-dirty but was NOT touched by this session, warn into the session
 *      (BEFORE the edit lands): uncommitted changes from another shell are
 *      about to be built over.
 *   3. tool_result (edit/write, non-error only) — mark the file touched and
 *      record its post-edit content hash. Kept off tool_call so a failed edit
 *      does not suppress later foreign-change notices for that path.
 *   4. agent_end — if ≥2 same-file collisions occurred this session, send one
 *      nudge to serialize the sessions or split file ownership.
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
	/** rel -> git blob hash of the content THIS session last wrote (post-edit). */
	const touchedHashes = new Map<string, string>();
	const warnedDirty = new Set<string>();
	/** Same-file collisions seen this session (foreign commit over a file we edited). */
	let collisionCount = 0;
	let serializeNudged = false;

	pi.on("session_start", async () => {
		lastKnownHead = git("rev-parse", "HEAD");
		touched.clear();
		touchedHashes.clear();
		warnedDirty.clear();
		collisionCount = 0;
		serializeNudged = false;
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

		// Classify each committed file. Never edited by us → plain foreign change.
		// Edited by us → compare the committed blob to the hash we recorded on our
		// last write: a match is our own autocommit snapshot (silent, no false
		// positives); a mismatch means another session committed different content
		// over a file we edited (highest risk). Empty committed hash (deletion or
		// git error) falls through to silent, honoring fail-open.
		const foreign: string[] = [];
		const collided: string[] = [];
		for (const f of changed) {
			if (!touched.has(f)) {
				foreign.push(f);
				continue;
			}
			const committed = git("rev-parse", `${head}:${f}`);
			const ours = touchedHashes.get(f);
			if (committed && ours && committed !== ours) collided.push(f);
		}
		if (foreign.length === 0 && collided.length === 0) return; // our own snapshot(s)
		collisionCount += collided.length;
		// Auto-refresh the harness self-audit for this cross-shell change: self-audit
		// listens on this shared-bus signal and re-runs validate-config.py, so its
		// injected problems track the new HEAD with no user action and no reload. This
		// is loop-safe: it neither advances HEAD nor commits nor reloads, and
		// lastKnownHead was just advanced above so this range emits at most once.
		pi.events.emit("config-repo-advanced", { range, foreign, collided });
		// Loaded resources (extensions/skills/prompts/themes/keybindings/AGENTS.md) can
		// only be refreshed by pi's /reload. ponytail: /reload cannot be triggered from
		// an event hook in pi 0.80.3 (sendUserMessage delivers slash text to the LLM,
		// it does not dispatch the command), so we tell the user to run it. Upgrade path:
		// auto-queue /reload once pi exposes reload() off a non-command context.
		const reloadHint = [...collided, ...foreign].some(isReloadResource)
			? ` These include loaded resources (extensions/skills/prompts/themes/keybindings/AGENTS.md); their in-memory copies are now stale — tell the user to run /reload to refresh them (the conversation is preserved).`
			: "";
		const clamp = (xs: string[]) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? ", ..." : "");
		const sections: string[] = [];
		if (collided.length) {
			sections.push(
				`HIGHEST RISK — a file YOU edited was committed with DIFFERENT content by another session: ` +
					`${clamp(collided)}. Your in-memory copy is stale and your next edit may clobber theirs. ` +
					`RE-READ each before further edits: \`git log ${range} -- ${collided[0]}\` for what changed, ` +
					`or query the knowledge graph for the file's role before re-editing.`,
			);
		}
		if (foreign.length) {
			sections.push(
				`The config repo advanced (${range}) since this session last looked, touching files ` +
					`this session did not edit: ${clamp(foreign)}. Another shell/session (or its autocommit) ` +
					`changed them — RE-READ any of these before building on remembered content ` +
					`(git log ${range} for details).`,
			);
		}
		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Concurrent-session notice (~/.pi/agent)\n\n` +
				sections.join("\n\n") +
				` The harness self-audit was auto-refreshed to reflect this change.` +
				reloadHint,
		};
	});

	// tool_call fires BEFORE the edit executes: warn (once) if the target is dirty
	// from another shell so the model re-reads before clobbering. We do NOT mark
	// the file touched here — a failed/aborted edit must not suppress later
	// foreign-change notices for that path (that marking moved to tool_result).
	pi.on("tool_call", async (event, ctx) => {
		try {
			if (event.toolName !== "edit" && event.toolName !== "write") return;
			const input = event.input as { path?: string } | undefined;
			if (!input?.path) return;
			const rel = agentRel(input.path, ctx.cwd);
			if (!rel) return;
			if (touched.has(rel) || warnedDirty.has(rel)) return;
			const dirty = git("status", "--porcelain", "--", rel);
			if (dirty) {
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

	// tool_result fires AFTER the edit executed. Only on a NON-error result do we
	// record that this session owns the file's current content: mark it touched
	// (so its autocommit snapshot stays silent) and hash the post-edit blob (so a
	// later foreign commit of DIFFERENT content is caught as a same-file collision).
	// A failed edit records nothing, so foreign notices still fire for that path.
	// ponytail: hash covers the edit/write tool only; a later bash write to the
	// same file is out of scope and could yield a stale-hash false notice.
	pi.on("tool_result", async (event, ctx) => {
		try {
			if (event.toolName !== "edit" && event.toolName !== "write") return;
			if (event.isError) return;
			const input = event.input as { path?: string } | undefined;
			if (!input?.path) return;
			const rel = agentRel(input.path, ctx.cwd);
			if (!rel) return;
			touched.add(rel);
			const hash = git("hash-object", rel);
			if (hash) touchedHashes.set(rel, hash);
		} catch {
			// fail-open: never affect a tool result
		}
	});

	// Self-improving loop (house doctrine: features close their own loop): if this
	// session keeps colliding on files another session commits over, send ONE nudge
	// to serialize the sessions or split file ownership. Fail-open, one message max.
	pi.on("agent_end", async () => {
		try {
			if (collisionCount >= 2 && !serializeNudged) {
				serializeNudged = true;
				pi.sendMessage(
					{
						customType: "concurrency-guard",
						content:
							`[concurrency-guard] ${collisionCount} same-file collisions this session — another ` +
							`session keeps committing over files you edit. Consider serializing the two sessions ` +
							`or splitting file ownership (one session per file/dir) to stop the churn.`,
						display: true,
					},
					{ triggerTurn: false },
				);
			}
		} catch {
			// never block
		}
	});
}
