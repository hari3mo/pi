/**
 * Read-Only Default Extension
 *
 * Every new pi session starts in read-only mode: the built-in `edit` and
 * `write` tools are disabled, and `bash` is restricted to an allowlist of
 * non-destructive commands. This makes exploration/analysis the safe default
 * instead of full write access.
 *
 * Toggle for the current session:
 *   /write      - exit read-only mode, restore full tool access
 *   /read-only  - re-enter read-only mode
 *
 * Start a session already in write mode with `pi --write`.
 *
 * The toggle state persists across /resume within the same session file, but
 * every brand-new session starts read-only again.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WRITE_TOOLS = new Set<string>(["edit", "write"]);

// Destructive/write-capable bash patterns blocked in read-only mode.
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

function isDestructiveCommand(command: string): boolean {
	return DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
}

interface ReadOnlyState {
	readOnly: boolean;
	toolsBeforeReadOnly?: string[];
}

export default function (pi: ExtensionAPI) {
	let readOnly = true;
	let toolsBeforeReadOnly: string[] | undefined;

	pi.registerFlag("write", {
		description: "Start the session in full write mode instead of the read-only default",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus("read-only-mode", readOnly ? ctx.ui.theme.fg("warning", "🔒 read-only") : undefined);
	}

	function persist(): void {
		pi.appendEntry<ReadOnlyState>("read-only-mode", { readOnly, toolsBeforeReadOnly });
	}

	function enableReadOnly(ctx: ExtensionContext, notify: boolean): void {
		readOnly = true;
		if (toolsBeforeReadOnly === undefined) {
			toolsBeforeReadOnly = pi.getActiveTools();
		}
		pi.setActiveTools(toolsBeforeReadOnly.filter((name) => !WRITE_TOOLS.has(name)));
		updateStatus(ctx);
		persist();
		if (notify) ctx.ui.notify("Read-only mode enabled. edit/write tools disabled, bash restricted.", "info");
	}

	function disableReadOnly(ctx: ExtensionContext, notify: boolean): void {
		readOnly = false;
		pi.setActiveTools(toolsBeforeReadOnly ?? pi.getActiveTools());
		toolsBeforeReadOnly = undefined;
		updateStatus(ctx);
		persist();
		if (notify) ctx.ui.notify("Write mode enabled. Full tool access restored for this session.", "info");
	}

	pi.registerCommand("write", {
		description: "Exit read-only mode and restore full tool access for this session",
		handler: async (_args, ctx) => {
			if (!readOnly) {
				ctx.ui.notify("Already in write mode.", "info");
				return;
			}
			disableReadOnly(ctx, true);
		},
	});

	pi.registerCommand("read-only", {
		description: "Re-enter read-only mode (disables edit/write, restricts bash)",
		handler: async (_args, ctx) => {
			if (readOnly) {
				ctx.ui.notify("Already in read-only mode.", "info");
				return;
			}
			enableReadOnly(ctx, true);
		},
	});

	// Block write-capable bash commands while read-only.
	pi.on("tool_call", async (event) => {
		if (!readOnly || event.toolName !== "bash") return;
		const command = (event.input as { command?: string }).command ?? "";
		if (isDestructiveCommand(command)) {
			return {
				block: true,
				reason: `Read-only mode: command blocked. Run /write to enable full tool access first.\nCommand: ${command}`,
			};
		}
	});

	// Let the model know it's read-only so it explains changes instead of attempting them.
	pi.on("before_agent_start", async () => {
		if (!readOnly) return;
		return {
			message: {
				customType: "read-only-mode-context",
				content:
					"[READ-ONLY MODE ACTIVE]\n" +
					"The edit and write tools are disabled, and bash is restricted to non-destructive commands.\n" +
					"Do not attempt file changes. Investigate, explain findings, and propose a plan instead.\n" +
					"If changes are actually needed, tell the user to run /write to enable full tool access.",
				display: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		readOnly = true;
		toolsBeforeReadOnly = undefined;

		if (pi.getFlag("write") === true) {
			readOnly = false;
		} else {
			// Respect an in-session toggle to write mode carried across /resume.
			const entries = ctx.sessionManager.getEntries();
			const last = entries
				.filter((e): e is typeof e & { customType: string; data?: ReadOnlyState } => e.type === "custom" && (e as { customType?: string }).customType === "read-only-mode")
				.pop();
			if (last?.data && last.data.readOnly === false) {
				readOnly = false;
			}
		}

		if (readOnly) {
			toolsBeforeReadOnly = pi.getActiveTools();
			pi.setActiveTools(toolsBeforeReadOnly.filter((name) => !WRITE_TOOLS.has(name)));
		}
		updateStatus(ctx);
	});
}
