/**
 * Concurrency Guard Extension — thin consumer of lib/change-detection.ts.
 *
 * Makes concurrent pi sessions across different shells safe on ~/.pi/agent.
 * ALL detection, classification, and staleness state live in the tracker
 * (extensions/lib/change-detection.ts — the single engine); this extension
 * only wires pi events to it and renders the results:
 *
 *   1. before_agent_start — tracker.detectAdvance() classifies the repo
 *      advance once (own snapshot = silent / foreign = plain notice /
 *      collided = "re-read before further edits" notice) and the classified
 *      result is re-broadcast verbatim as "config-repo-advanced" on the
 *      shared bus — the ONE interface consumers use (self-audit re-runs the
 *      validator off it; future subscribers get range/foreign/collided/
 *      staleResources with no extra classification pass). While any loaded
 *      resource (extensions/skills/prompts/themes/keybindings/AGENTS.md) is
 *      stale from a cross-shell change, EVERY turn re-injects a "Stale loaded
 *      resources" block with the concrete git delta, and a persistent widget
 *      shows above the editor — not one forgettable prose notice.
 *   2. tool_call (edit/write) — tracker.checkEdit() classifies the target:
 *      stale loaded resource not re-read → BLOCK the first attempt ({ block:
 *      true } is the verified pi 0.80.3 capability; programmatic /reload is
 *      NOT — sendUserMessage hard-sets expandPromptTemplates:false so slash
 *      text goes to the LLM verbatim, and ctx.reload() exists only on command
 *      contexts), warn on the second, then stand aside (never wedge);
 *      git-dirty from another shell → warn once before the edit lands.
 *   3. tool_result — non-error edit/write records ownership (touched + blob
 *      hash, so own autocommit snapshots stay silent and foreign clobbers are
 *      caught); non-error read cures the edit gate for a stale file.
 *   4. agent_end — ≥2 same-file collisions → one nudge to serialize sessions.
 *   5. /refresh — the manual companion: report the pending delta, then
 *      ctx.reload() (re-fires session_start, which resets the tracker — so
 *      the notice won't re-fire for the change just synced, and the stale
 *      registry empties exactly when the in-memory copies stop being stale).
 *
 * Fail-open: every handler body is try/caught; any git failure degrades to
 * silence for that event, never blocks a turn.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createChangeTracker } from "./lib/change-detection.ts";

export default function (pi: ExtensionAPI) {
	const tracker = createChangeTracker(getAgentDir());
	let serializeNudged = false;

	const clamp = (xs: string[]) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? ", ..." : "");

	// Persistent staleness UI: a widget above the editor while any loaded
	// resource is stale from a cross-shell change. Cleared on reset (reload).
	function updateWidget(ctx: { hasUI?: boolean; ui?: { setWidget(key: string, content: string[] | undefined): void } } | undefined): void {
		try {
			if (!ctx?.hasUI || !ctx.ui) return;
			const stale = tracker.staleResources();
			if (stale.length === 0) {
				ctx.ui.setWidget("concurrency-guard", undefined);
				return;
			}
			const names =
				stale.slice(0, 4).map((s) => s.rel).join(", ") +
				(stale.length > 4 ? `, +${stale.length - 4} more` : "");
			ctx.ui.setWidget("concurrency-guard", [
				`⚠ stale loaded resources (changed by another shell): ${names} — run /refresh to reload`,
			]);
		} catch {
			// fail-open
		}
	}

	// Recurring prompt block: re-injected EVERY turn while staleness persists.
	function staleSection(): string {
		const stale = tracker.staleResources();
		if (stale.length === 0) return "";
		const lines = stale.slice(0, 8).map(
			(s) =>
				`- ${s.rel} (${s.range}${s.delta ? ` — ${s.delta}` : ""})` +
				(s.readSince ? " [live content re-read; loaded copy still stale]" : " [NOT re-read — first edit is blocked]"),
		);
		if (stale.length > 8) lines.push(`- ... +${stale.length - 8} more`);
		return (
			`\n\n## Stale loaded resources (~/.pi/agent)\n\n` +
			`Another shell changed ${stale.length} loaded resource(s); pi's in-memory copies are STALE until reload:\n` +
			lines.join("\n") +
			`\nRe-read a file (read tool) before editing it. Tell the user to run /refresh ` +
			`(re-checks repo state and reloads extensions/skills/prompts/themes while preserving the conversation).`
		);
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			tracker.reset();
			serializeNudged = false;
			updateWidget(ctx);
		} catch {
			// fail-open
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const adv = tracker.detectAdvance();
			let extra = "";
			if (adv) {
				// The ONE classified result, broadcast for all consumers (self-audit
				// re-runs validate-config.py off this; payload is a fresh object per
				// emit, so subscribers may hold it). Loop-safe: detectAdvance advanced
				// the baseline, so this range emits at most once.
				pi.events.emit("config-repo-advanced", adv);
				const sections: string[] = [];
				if (adv.collided.length) {
					sections.push(
						`HIGHEST RISK — a file YOU edited was committed with DIFFERENT content by another session: ` +
							`${clamp(adv.collided)}. Your in-memory copy is stale and your next edit may clobber theirs. ` +
							`RE-READ each before further edits: \`git log ${adv.range} -- ${adv.collided[0]}\` for what changed, ` +
							`or query the knowledge graph for the file's role before re-editing.`,
					);
				}
				if (adv.foreign.length) {
					sections.push(
						`The config repo advanced (${adv.range}) since this session last looked, touching files ` +
							`this session did not edit: ${clamp(adv.foreign)}. Another shell/session (or its autocommit) ` +
							`changed them — RE-READ any of these before building on remembered content ` +
							`(git log ${adv.range} for details).`,
					);
				}
				extra +=
					`\n\n## Concurrent-session notice (~/.pi/agent)\n\n` +
					sections.join("\n\n") +
					` The harness self-audit was auto-refreshed to reflect this change.`;
			}
			extra += staleSection();
			updateWidget(ctx);
			if (!extra) return;
			return { systemPrompt: event.systemPrompt + extra };
		} catch {
			return; // fail-open: never block a turn
		}
	});

	// tool_call fires BEFORE the edit executes: one classification call decides
	// block (stale resource, first attempt) / warn (second attempt, or dirty from
	// another shell). We do NOT mark the file touched here — a failed/aborted
	// edit must not suppress later foreign-change notices (that's tool_result's).
	pi.on("tool_call", async (event, ctx) => {
		try {
			if (event.toolName !== "edit" && event.toolName !== "write") return;
			const input = event.input as { path?: string } | undefined;
			if (!input?.path) return;
			const rel = tracker.rel(input.path, ctx.cwd);
			if (!rel) return;
			const verdict = tracker.checkEdit(rel);
			if (!verdict) return;
			if (verdict.kind === "stale-block") {
				return { block: true, reason: verdict.reason };
			}
			pi.sendMessage(
				{ customType: "concurrency-guard", content: verdict.reason, display: true },
				{ triggerTurn: false },
			);
		} catch {
			// fail-open: never block a tool call
		}
	});

	// tool_result fires AFTER execution. Non-error edit/write → this session owns
	// the file's current content (own snapshot stays silent; a foreign commit of
	// DIFFERENT content is caught as a collision). Non-error read → the session
	// knows the live content, curing the stale-edit gate for that file.
	// ponytail: hash covers the edit/write tool only; a later bash write to the
	// same file is out of scope and could yield a stale-hash false notice.
	pi.on("tool_result", async (event, ctx) => {
		try {
			if (event.isError) return;
			const isWrite = event.toolName === "edit" || event.toolName === "write";
			if (!isWrite && event.toolName !== "read") return;
			const input = event.input as { path?: string } | undefined;
			if (!input?.path) return;
			const rel = tracker.rel(input.path, ctx.cwd);
			if (!rel) return;
			if (isWrite) tracker.recordWrite(rel);
			else tracker.recordRead(rel);
		} catch {
			// fail-open: never affect a tool result
		}
	});

	// Self-improving loop (house doctrine: features close their own loop): if this
	// session keeps colliding on files another session commits over, send ONE nudge
	// to serialize the sessions or split file ownership. Fail-open, one message max.
	pi.on("agent_end", async () => {
		try {
			if (tracker.collisions() >= 2 && !serializeNudged) {
				serializeNudged = true;
				pi.sendMessage(
					{
						customType: "concurrency-guard",
						content:
							`[concurrency-guard] ${tracker.collisions()} same-file collisions this session — another ` +
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

	// /refresh — the manual companion to the notices above. An event hook cannot
	// dispatch a command (pi 0.80.3: sendUserMessage hard-sets
	// expandPromptTemplates:false) and ctx.reload() only exists on a command
	// context — this command does it in one step. Upgrade path: auto-queue
	// /reload once pi exposes reload() off a non-command context.
	pi.registerCommand("refresh", {
		description: "Sync with other shells: re-check config repo state and reload resources",
		handler: async (_args, ctx) => {
			const delta = tracker.pendingDelta();
			if (delta?.range && delta.changed?.length) {
				const list = delta.changed.slice(0, 8).join(", ") + (delta.changed.length > 8 ? ", ..." : "");
				ctx.ui.notify(
					`[refresh] Config repo advanced ${delta.range} — ${delta.changed.length} file(s): ${list}. Reloading resources...`,
					"info",
				);
			} else {
				ctx.ui.notify(
					`[refresh] Already in sync${delta ? ` (HEAD ${delta.head.slice(0, 7)})` : ""}. Reloading resources...`,
					"info",
				);
			}
			// Reload re-reads extensions/skills/prompts/AGENTS.md while preserving the
			// conversation, and re-fires session_start — which resets the tracker
			// (baseline + stale registry + widget), so the notices won't re-fire for
			// the change we just synced. If reload fails the old instance keeps its
			// stale state and the notices correctly stay live. Terminal for this handler.
			await ctx.reload();
			return;
		},
	});
}
