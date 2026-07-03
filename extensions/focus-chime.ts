/**
 * Focus Chime Extension
 *
 * macOS only. Fires a quiet native notification (osascript) when an agent
 * turn takes longer than 25 seconds to finish, so you can look away while
 * pi works and still know when it's done.
 *
 * /chime   toggle the chime on/off (default: on). Persists across restarts.
 */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LONG_TURN_THRESHOLD_MS = 25_000;

function fmtDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

/** Strip quotes/backslashes and replace newlines/control chars so the string can't break out of the AppleScript literal. */
function sanitize(s: string): string {
	return s.replace(/["\\]/g, "").replace(/[\x00-\x1f]/g, " ");
}

function fireChime(elapsedMs: number, cwd: string): void {
	try {
		const body = sanitize(`done in ${fmtDuration(elapsedMs)}`);
		const title = sanitize(`pi \u2014 ${basename(cwd)}`);
		const script = `display notification "${body}" with title "${title}" sound name "Glass"`;
		execFile("osascript", ["-e", script], () => {
			// Swallow errors — a missed chime should never surface to the user.
		});
	} catch {
		// Never throw from a notification side-effect.
	}
}

export default function (pi: ExtensionAPI) {
	if (process.platform !== "darwin") return;

	let enabled = true;
	let turnStartedAt: number | undefined;

	pi.on("session_start", async (_event, ctx) => {
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === "focus-chime") {
				const data = (entry as { data?: { enabled?: boolean } }).data;
				if (typeof data?.enabled === "boolean") enabled = data.enabled;
			}
		}
	});

	pi.on("agent_start", async () => {
		turnStartedAt = Date.now();
	});

	pi.on("agent_end", async (_event, ctx) => {
		const startedAt = turnStartedAt;
		turnStartedAt = undefined;
		if (startedAt === undefined || !enabled) return;
		if (ctx.mode !== "tui") return;

		const elapsed = Date.now() - startedAt;
		if (elapsed <= LONG_TURN_THRESHOLD_MS) return;

		fireChime(elapsed, ctx.cwd);
	});

	pi.registerCommand("chime", {
		description: "Toggle the focus chime notification for long turns",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			pi.appendEntry("focus-chime", { enabled });
			ctx.ui.notify(enabled ? "Focus chime on" : "Focus chime off", "info");
		},
	});
}
