/**
 * Write-Gate Default Extension
 *
 * New pi sessions start in "confirm" mode: reads are unrestricted, and every
 * edit/write tool call or destructive bash command prompts the user before
 * running. Two other modes are reachable:
 *
 *   /write      - full access, no prompts (also: pi --write)
 *   /confirm    - default: prompt before each write/destructive command
 *   /read-only  - strict: edit/write disabled, destructive bash blocked
 *
 * Ctrl+` cycles the modes: confirm -> write -> read-only -> confirm.
 * (Note: Ctrl+` may require a terminal with the Kitty keyboard protocol;
 * in legacy encoding it can collide with NUL/Ctrl+Space.)
 *
 * In headless modes (no UI) confirm-mode blocks writes, since it cannot prompt;
 * use `pi --write` for unattended write access.
 *
 * The mode persists across /resume within the same session file, but every
 * brand-new session starts in confirm mode again.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

const WRITE_TOOLS = new Set<string>(["edit", "write"]);

// Destructive/write-capable bash patterns gated in confirm mode / blocked in read-only mode.
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

// Redirections that cannot write a file: to /dev/null (any fd, incl. &> and >>)
// or fd duplications like 2>&1. Stripped before destructive-pattern matching so
// read-only commands such as `grep foo 2>/dev/null` pass freely in confirm mode.
const SAFE_REDIRECT_RE = /(\d+|&)?>{1,2}\s*\/dev\/null|\d*>&\d+/g;

function isDestructiveCommand(command: string): boolean {
	const sanitized = command.replace(SAFE_REDIRECT_RE, " ");
	return DESTRUCTIVE_PATTERNS.some((p) => p.test(sanitized));
}

type Mode = "confirm" | "write" | "readonly";

interface GateState {
	mode: Mode;
	toolsBeforeReadOnly?: string[];
}

export default function (pi: ExtensionAPI) {
	let mode: Mode = "confirm";
	let toolsBeforeReadOnly: string[] | undefined;
	let trustWritesThisSession = false;

	pi.registerFlag("write", {
		description: "Start the session in full write mode (no confirmation prompts)",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("read-only", {
		description: "Start the session in strict read-only mode",
		type: "boolean",
		default: false,
	});

	function persist(): void {
		pi.appendEntry<GateState>("write-gate-mode", { mode, toolsBeforeReadOnly });
	}

	function applyTools(): void {
		// Publish the gate mode for sibling extensions (same process). The
		// subagent extension reads this to decide whether spawned children get
		// --write (see extensions/subagent/index.ts).
		(globalThis as { __piWriteGateMode?: Mode }).__piWriteGateMode = mode;
		if (mode === "readonly") {
			if (toolsBeforeReadOnly === undefined) toolsBeforeReadOnly = pi.getActiveTools();
			pi.setActiveTools(toolsBeforeReadOnly.filter((name) => !WRITE_TOOLS.has(name)));
		} else if (toolsBeforeReadOnly !== undefined) {
			// Leaving read-only: restore the tools we removed.
			pi.setActiveTools(toolsBeforeReadOnly);
			toolsBeforeReadOnly = undefined;
		}
	}

	function setMode(next: Mode, ctx: ExtensionContext, notify: boolean): void {
		mode = next;
		applyTools();
		persist();
		if (!notify) return;
		const msg =
			next === "write"
				? "Write mode: full tool access, no prompts."
				: next === "readonly"
					? "Read-only mode: edit/write disabled, destructive bash blocked."
					: "Confirm mode: reads free, writes prompt for approval.";
		ctx.ui.notify(msg, "info");
	}

	const CYCLE: Mode[] = ["confirm", "write", "readonly"];
	pi.registerShortcut(Key.ctrl("`"), {
		description: "Cycle write-gate mode (confirm → write → read-only)",
		handler: async (ctx) => {
			const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
			trustWritesThisSession = false;
			setMode(next, ctx, true);
		},
	});

	pi.registerCommand("write", {
		description: "Full access, no confirmation prompts, for this session",
		handler: async (_args, ctx) => {
			if (mode === "write") {
				ctx.ui.notify("Already in write mode.", "info");
				return;
			}
			trustWritesThisSession = false;
			setMode("write", ctx, true);
		},
	});

	pi.registerCommand("confirm", {
		description: "Confirm-before-write mode (the default) for this session",
		handler: async (_args, ctx) => {
			if (mode === "confirm") {
				ctx.ui.notify("Already in confirm mode.", "info");
				return;
			}
			trustWritesThisSession = false;
			setMode("confirm", ctx, true);
		},
	});

	pi.registerCommand("read-only", {
		description: "Strict read-only mode (disables edit/write, blocks destructive bash)",
		handler: async (_args, ctx) => {
			if (mode === "readonly") {
				ctx.ui.notify("Already in read-only mode.", "info");
				return;
			}
			setMode("readonly", ctx, true);
		},
	});

	// Gate write-capable tool calls according to the current mode.
	pi.on("tool_call", async (event, ctx) => {
		if (mode === "write") return;

		// Subagent orchestration: children inherit the gate (only write mode
		// grants them --write). If the user is about to orchestrate from a
		// gated mode, offer to switch to write mode first instead of letting
		// builders silently fail their writes.
		if (event.toolName === "subagent") {
			if (!ctx.hasUI) return; // headless: run as-is, children stay read-only
			const choice = await ctx.ui.select(
				"Subagents inherit the write gate and cannot prompt for approval. Switch to write mode?",
				["Switch to write mode & run subagents", "Run subagents read-only", "Cancel"],
			);
			if (choice === "Switch to write mode & run subagents") {
				trustWritesThisSession = false;
				setMode("write", ctx, true);
				return;
			}
			if (choice === "Run subagents read-only") return;
			return {
				block: true,
				reason:
					"Subagent run cancelled by user. If subagents need write access, ask the user to run /write first.",
			};
		}

		const isWriteTool = WRITE_TOOLS.has(event.toolName);
		const isBadBash =
			event.toolName === "bash" &&
			isDestructiveCommand((event.input as { command?: string }).command ?? "");
		if (!isWriteTool && !isBadBash) return;

		if (mode === "readonly") {
			// edit/write are already stripped; this guards destructive bash.
			return {
				block: true,
				reason: `Read-only mode: command blocked. Run /write or /confirm to enable writes first.`,
			};
		}

		// confirm mode
		if (trustWritesThisSession) return;
		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					"Confirm mode: cannot prompt for approval without a UI. " +
					"Start with `pi --write` for unattended write access.",
			};
		}

		const target = isWriteTool
			? (event.input as { path?: string }).path ?? event.toolName
			: (event.input as { command?: string }).command ?? "";
		const choice = await ctx.ui.select(`Allow ${event.toolName}?  ${target}`, [
			"Allow once",
			"Allow all writes this session",
			"Deny",
		]);
		if (choice === "Allow all writes this session") {
			trustWritesThisSession = true;
			return;
		}
		if (choice === "Allow once") return;
		return { block: true, reason: "Write denied by user." };
	});

	// Tell the model which mode it is in so it behaves accordingly.
	pi.on("before_agent_start", async () => {
		if (mode === "write") return;
		const content =
			mode === "readonly"
				? "[READ-ONLY MODE ACTIVE]\n" +
					"The edit and write tools are disabled, and bash is restricted to non-destructive commands.\n" +
					"Do not attempt file changes. Investigate, explain findings, and propose a plan instead.\n" +
					"If changes are actually needed, tell the user to run /write to enable full tool access."
				: "[CONFIRM-WRITE MODE ACTIVE]\n" +
					"Reads are unrestricted. Each edit/write tool call or destructive bash command will\n" +
					"prompt the user for approval before it runs. Proceed normally and make the changes the\n" +
					"task requires; expect an approval prompt on writes. If the user denies a write, respect it.";
		return {
			message: {
				customType: "write-gate-context",
				content,
				display: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		trustWritesThisSession = false;
		toolsBeforeReadOnly = undefined;

		if (pi.getFlag("write") === true) {
			mode = "write";
		} else if (pi.getFlag("read-only") === true) {
			mode = "readonly";
		} else {
			mode = "confirm";
			// Respect an in-session mode toggle carried across /resume.
			const entries = ctx.sessionManager.getEntries();
			const last = entries
				.filter(
					(e): e is typeof e & { customType: string; data?: GateState } =>
						e.type === "custom" && (e as { customType?: string }).customType === "write-gate-mode",
				)
				.pop();
			if (last?.data?.mode) mode = last.data.mode;
		}

		applyTools();
	});
}
