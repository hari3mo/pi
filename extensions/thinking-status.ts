/**
 * Thinking Status Extension
 *
 * Shows the current thinking level in the footer status bar,
 * updating whenever it changes (keybinding, model switch, pi.setThinkingLevel()).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	function updateStatus(ctx: ExtensionContext) {
		const level = pi.getThinkingLevel();
		if (level === "off") {
			ctx.ui.setStatus("thinking", undefined);
		} else {
			ctx.ui.setStatus("thinking", ctx.ui.theme.fg("muted", `🧠 ${level}`));
		}
	}

	pi.on("thinking_level_select", async (_event, ctx) => updateStatus(ctx));
	pi.on("model_select", async (_event, ctx) => updateStatus(ctx));
	pi.on("session_start", async (_event, ctx) => updateStatus(ctx));
}
