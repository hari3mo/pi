/**
 * Session Timer Extension
 *
 * Shows elapsed wall-clock time since the current session started, via
 * ctx.ui.setStatus() on the footer's extension-status line. Ticks every
 * second. Does not touch the built-in footer layout.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h > 0) return `⏱${h}h${String(m).padStart(2, "0")}m`;
	if (m > 0) return `⏱${m}m${String(s).padStart(2, "0")}s`;
	return `⏱${s}s`;
}

export default function (pi: ExtensionAPI) {
	let startedAt = Date.now();
	let timer: ReturnType<typeof setInterval> | undefined;

	function tick(ctx: ExtensionContext): void {
		ctx.ui.setStatus("session-timer", ctx.ui.theme.fg("dim", formatDuration(Date.now() - startedAt)));
	}

	pi.on("session_start", async (_event, ctx) => {
		startedAt = Date.now();
		if (timer) clearInterval(timer);
		tick(ctx);
		timer = setInterval(() => tick(ctx), 1000);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (timer) {
			clearInterval(timer);
			timer = undefined;
		}
		ctx.ui.setStatus("session-timer", undefined);
	});
}
