/**
 * Thinking Status Extension
 *
 * Shows the current thinking level in the footer status bar. Demonstrates
 * `pi.getThinkingLevel()` for initial state and the `thinking_level_select`
 * event for live updates.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function formatThinkingStatus(ctx: { ui: { theme: { fg: (name: string, text: string) => string } } }, level: string) {
	return ctx.ui.theme.fg("dim", `🧠 ${level}`);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const level = pi.getThinkingLevel();
		ctx.ui.setStatus("thinking", formatThinkingStatus(ctx, level));
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("thinking", formatThinkingStatus(ctx, event.level));
	});
}
