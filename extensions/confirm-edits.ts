/**
 * Confirm Edits Extension
 *
 * Prompts yes/no before every edit/write tool call.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "Edit blocked (no UI to confirm)" };
		}

		const path = event.input.path as string;
		const ok = await ctx.ui.confirm("Allow edit?", `${event.toolName}: ${path}`);
		if (!ok) return { block: true, reason: "Blocked by user" };

		return undefined;
	});
}
