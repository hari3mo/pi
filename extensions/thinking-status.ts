/**
 * Thinking Status Extension
 *
 * Shows the current thinking level in the footer status bar. Demonstrates
 * `pi.getThinkingLevel()` for initial state and the `thinking_level_select`
 * event for live updates.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const level = pi.getThinkingLevel();
		ctx.ui.setStatus("thinking", ctx.ui.theme.fg("dim", level));
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("thinking", ctx.ui.theme.fg("dim", event.level));
	});
}
