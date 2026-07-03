/**
 * Edit Mode Extension
 *
 * Toggles between "edit" (writes apply automatically) and "read" (writes
 * ask for confirmation) modes for the built-in `write`/`edit` tools.
 *
 * - Ctrl+Tab or /mode to toggle
 * - /mode read | /mode edit to set explicitly
 * - --read flag to start in read mode
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

type Mode = "read" | "edit";

export default function (pi: ExtensionAPI): void {
	let mode: Mode = "edit";

	pi.registerFlag("read", {
		description: "Start in read mode (writes ask for confirmation)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (mode === "edit") {
			ctx.ui.setStatus("edit-mode", ctx.ui.theme.fg("accent", "✎ edit"));
		} else {
			ctx.ui.setStatus("edit-mode", ctx.ui.theme.fg("warning", "👁 read"));
		}
	}

	function persist(): void {
		pi.appendEntry("edit-mode", { mode });
	}

	function toggle(ctx: ExtensionContext): void {
		mode = mode === "edit" ? "read" : "edit";
		updateStatus(ctx);
		persist();
		if (mode === "read") {
			ctx.ui.notify("Read mode: writes will ask for confirmation.");
		} else {
			ctx.ui.notify("Edit mode: writes apply automatically.");
		}
	}

	pi.registerShortcut(Key.ctrl("tab"), {
		description: "Toggle read/edit mode",
		handler: async (ctx) => toggle(ctx),
	});

	pi.registerCommand("mode", {
		description: "Toggle or show read/edit mode",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed === "read" || trimmed === "edit") {
				mode = trimmed;
				updateStatus(ctx);
				persist();
				if (mode === "read") {
					ctx.ui.notify("Read mode: writes will ask for confirmation.");
				} else {
					ctx.ui.notify("Edit mode: writes apply automatically.");
				}
				return;
			}
			toggle(ctx);
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (mode !== "read") return;
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					"Read mode is active and no interactive UI is available to confirm. Describe the intended change instead, or start without --read.",
			};
		}

		const path = (event.input as { path?: string }).path ?? "file";
		const ok = await ctx.ui.confirm("Read mode", `Allow ${event.toolName} to ${path}?`);
		if (ok) return;

		return {
			block: true,
			reason: `User declined this ${event.toolName} in read mode. Describe the change instead, or ask the user to switch to edit mode (toggle with the /mode command).`,
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("read") === true) {
			mode = "read";
		}

		const entries = ctx.sessionManager.getEntries();
		const editModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "edit-mode")
			.pop() as { data?: { mode?: Mode } } | undefined;

		if (editModeEntry?.data?.mode === "read" || editModeEntry?.data?.mode === "edit") {
			mode = editModeEntry.data.mode;
		}

		updateStatus(ctx);
	});
}
