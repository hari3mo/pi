/**
 * Write-Gate Default Extension
 *
 * New pi sessions start in "confirm" mode: reads are unrestricted, and every
 * edit/write tool call or destructive bash command prompts the user before
 * running. Two other modes are reachable:
 *
 *   /write      - auto-approve writes under ~/.pi; prompt/block outside it (also: pi --write)
 *   /confirm    - default: prompt before each write/destructive command
 *   /read-only  - strict: edit/write disabled, destructive bash blocked
 *
 * Ctrl+` cycles the modes: confirm -> write -> read-only -> confirm.
 * (Note: Ctrl+` may require a terminal with the Kitty keyboard protocol;
 * in legacy encoding it can collide with NUL/Ctrl+Space.)
 *
 * In headless modes (no UI) confirm-mode blocks writes, since it cannot prompt;
 * use `pi --write` for unattended write access under ~/.pi only.
 *
 * The mode persists across /resume within the same session file, but every
 * brand-new session starts in confirm mode again.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { Type } from "typebox";

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

// Auto-write is intentionally narrow: /write, pi --write, and "allow all writes"
// only skip prompts for mutations under ~/.pi. Outside that root, interactive
// sessions still ask and headless sessions block.
const AUTO_WRITE_ROOT = path.resolve(os.homedir(), ".pi");

function isUnderAutoWriteRoot(candidate: string): boolean {
	const relative = path.relative(AUTO_WRITE_ROOT, path.resolve(candidate));
	return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveUserPath(candidate: string, cwd: string): string {
	const expanded =
		candidate === "~"
			? os.homedir()
			: candidate.startsWith("~/")
				? path.join(os.homedir(), candidate.slice(2))
				: candidate;
	return path.resolve(cwd, expanded);
}

function stripShellToken(raw: string): string {
	return raw.trim().replace(/^[\d&]*>{1,2}/, "").replace(/^[`'\"]+|[`'\",;:)]+$/g, "");
}

function shellTokenPaths(command: string, cwd: string): string[] {
	const paths: string[] = [];
	for (const raw of command.split(/[\s|&;()<>]+/)) {
		const token = stripShellToken(raw);
		if (!token || token.startsWith("-") || token === "/dev/null") continue;
		const values = token.includes("=") ? [token, token.slice(token.indexOf("=") + 1)] : [token];
		for (const value of values) {
			if (!value || value === "/dev/null") continue;
			if (value === "~" || value.startsWith("~/") || path.isAbsolute(value)) {
				paths.push(resolveUserPath(value, cwd));
			} else if (value.startsWith("./") || value.startsWith("../") || value.includes("/")) {
				paths.push(path.resolve(cwd, value));
			}
		}
	}
	return paths;
}

function isDestructiveCommand(command: string): boolean {
	const sanitized = command.replace(SAFE_REDIRECT_RE, " ");
	return DESTRUCTIVE_PATTERNS.some((p) => p.test(sanitized));
}

function autoWriteScope(
	toolName: string,
	input: Record<string, unknown>,
	ctx: ExtensionContext,
): { trusted: boolean; target: string } {
	if (toolName === "edit" || toolName === "write") {
		const target = typeof input.path === "string" ? input.path : toolName;
		return { target, trusted: isUnderAutoWriteRoot(resolveUserPath(target, ctx.cwd)) };
	}
	const command = typeof input.command === "string" ? input.command : "";
	const trusted =
		isUnderAutoWriteRoot(ctx.cwd) && shellTokenPaths(command, ctx.cwd).every(isUnderAutoWriteRoot);
	return { target: command, trusted };
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
		description: "Start with auto-write for ~/.pi only; prompt/block outside it",
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

	// Persistent footer label so the gate mode is always visible (see docs/tui.md
	// Pattern 4: Persistent Status Indicator). Guarded for headless sessions.
	function updateStatusBar(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const label =
			mode === "write" ? "gate: write ~/.pi" : mode === "readonly" ? "gate: read-only" : "gate: confirm";
		const color = mode === "write" ? "success" : mode === "readonly" ? "warning" : "muted";
		ctx.ui.setStatus("write-gate", ctx.ui.theme.fg(color, label));
	}

	function setMode(next: Mode, ctx: ExtensionContext, notify: boolean): void {
		mode = next;
		applyTools();
		persist();
		updateStatusBar(ctx);
		if (!notify) return;
		const msg =
			next === "write"
				? `Write mode: auto-approve writes under ${AUTO_WRITE_ROOT}; prompt elsewhere.`
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

	// Orchestrator pre-flight: lets the model raise a selection prompt so the
	// user can open the gate without typing /write.
	pi.registerTool({
		name: "request_write_mode",
		label: "Request Write Mode",
		description:
			"Show the user a selection prompt asking to switch the write gate to write mode so " +
			"spawned subagents inherit write access. Call this (instead of asking in prose) before " +
			"any exploration or subagent dispatch when the gate is not in write mode.",
		parameters: Type.Object({
			reason: Type.Optional(Type.String({ description: "One line: why write mode is needed." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const reply = (text: string) => ({ content: [{ type: "text" as const, text }] });
			if (mode === "write")
				return reply(
					`Write gate already open. Auto-write is scoped to ${AUTO_WRITE_ROOT}; spawned subagents inherit --write but prompts/blocks still apply outside that root.`,
				);
			// Headless (no UI): nobody can answer a select() prompt, so throwing
			// (isError:true) forces the agent to stop and report the blocker
			// instead of improvising a workaround (e.g. editing directly or
			// spawning writer subagents that will silently run read-only).
			if (!ctx.hasUI) {
				throw new Error(
					"Write gate is closed and this session is non-interactive — no user can open it. STOP: do not edit files directly and do not spawn writer subagents; surface the blocker in your final answer.",
				);
			}
			const reason = (params as { reason?: string }).reason?.trim();
			const choice = await ctx.ui.select(
				`Orchestrator requests write mode${reason ? ` — ${reason}` : ""}. Subagents inherit the gate.`,
				["Switch to write mode", "Stay in current mode (subagents read-only)", "Cancel the task"],
			);
			if (choice === "Switch to write mode") {
				trustWritesThisSession = false;
				setMode("write", ctx, true);
				return reply(
					`User switched to write mode. Auto-write is scoped to ${AUTO_WRITE_ROOT}; spawned subagents inherit --write but prompts/blocks still apply outside that root.`,
				);
			}
			if (choice === "Stay in current mode (subagents read-only)") {
				return reply("User kept the current gate mode. Subagents run read-only and can only return plans.");
			}
			return reply("User cancelled. Stop and await further instructions from the user.");
		},
	});

	// Gate write-capable tool calls according to the current mode.
	pi.on("tool_call", async (event, ctx) => {
		// Fable lead never edits directly (AGENTS.md Hard Delegation Thresholds):
		// an additional check evaluated in EVERY gate mode, before the write-mode
		// early return. Spawned subagent children (incl. fable-engineer, which runs
		// claude-fable-5 and MUST write) set PI_SUBAGENT=1 and are exempt. Fails
		// open: any error here must fall through to the normal gating below.
		try {
			if (
				process.env.PI_SUBAGENT !== "1" &&
				WRITE_TOOLS.has(event.toolName) &&
				((ctx.model as { id?: string } | undefined)?.id ?? "").includes("fable")
			) {
				return {
					block: true,
					reason:
						"Fable lead never edits directly — delegate to a worker-tier agent (see AGENTS.md Hard Delegation Thresholds).",
				};
			}
		} catch {
			/* fail open: never let the fable guard crash the gate hook */
		}

		const isWriteTool = WRITE_TOOLS.has(event.toolName);
		const isBadBash =
			event.toolName === "bash" &&
			isDestructiveCommand((event.input as { command?: string }).command ?? "");
		const isMutation = isWriteTool || isBadBash;
		const scope = isMutation ? autoWriteScope(event.toolName, event.input, ctx) : undefined;

		if (mode === "write") {
			if (!isMutation || scope?.trusted) return;
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Write mode auto-approval is scoped to ${AUTO_WRITE_ROOT}; cannot prompt for ${scope?.target ?? event.toolName} outside that root in this headless session.`,
				};
			}
			const choice = await ctx.ui.select(
				`Allow ${event.toolName} outside auto-write scope (${AUTO_WRITE_ROOT})?  ${scope?.target ?? ""}`,
				["Allow once", "Deny"],
			);
			if (choice === "Allow once") return;
			return { block: true, reason: "Write denied by user." };
		}

		// Subagent orchestration: children inherit the gate (only write mode
		// grants them --write). If the user is about to orchestrate from a
		// gated mode, offer to switch to write mode first instead of letting
		// workers silently fail their writes. Auto-write inside the child remains
		// scoped to ~/.pi by this extension.
		if (event.toolName === "subagent") {
			if (!ctx.hasUI) return; // headless: run as-is, children stay read-only
			const choice = await ctx.ui.select(
				`Subagents inherit the write gate and cannot prompt for approval; auto-write is scoped to ${AUTO_WRITE_ROOT}. Switch to write mode?`,
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

		if (!isMutation) return;

		if (mode === "readonly") {
			// edit/write are already stripped; this guards destructive bash.
			return {
				block: true,
				reason: `Read-only mode: command blocked. Run /write or /confirm to enable writes first.`,
			};
		}

		// confirm mode
		if (trustWritesThisSession && scope?.trusted) return;
		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					"Confirm mode: cannot prompt for approval without a UI. " +
					`Start with \`pi --write\` for unattended write access under ${AUTO_WRITE_ROOT}.`,
			};
		}

		const allowAll = scope?.trusted === true;
		const allowAllLabel = `Allow all writes under ${AUTO_WRITE_ROOT} this session`;
		const choice = await ctx.ui.select(
			`Allow ${event.toolName}?  ${scope?.target ?? event.toolName}${allowAll ? "" : ` (outside auto-write scope ${AUTO_WRITE_ROOT})`}`,
			allowAll ? ["Allow once", allowAllLabel, "Deny"] : ["Allow once", "Deny"],
		);
		if (choice === allowAllLabel) {
			trustWritesThisSession = true;
			return;
		}
		if (choice === "Allow once") return;
		return { block: true, reason: "Write denied by user." };
	});

	// Tell the model which mode it is in so it behaves accordingly.
	pi.on("before_agent_start", async (_event, ctx) => {
		// Orchestrator lead (fable) with a closed gate: subagents would inherit
		// read-only, so the pre-flight prompt must come before ANY exploration.
		const isOrchestrator = ((ctx.model as { id?: string } | undefined)?.id ?? "").includes("fable");
		const orchestratorNote = isOrchestrator
			? "\n\n[ORCHESTRATOR PRE-FLIGHT] You are the orchestrator and the write gate is NOT in write mode.\n" +
				"Spawned subagents inherit this gate and cannot write. If the task will plausibly require\n" +
				"file changes, your FIRST action must be to call the request_write_mode tool — it shows the\n" +
				"user a selection prompt to open the gate. Do this before reading code, exploring the repo,\n" +
				"or dispatching any subagent; do not ask in prose."
			: "";
		const content =
			mode === "write"
				? `[WRITE MODE ACTIVE — SCOPED]\nAuto-write is limited to ${AUTO_WRITE_ROOT}. File changes outside that root still prompt in UI sessions and are blocked in headless sessions.`
				: mode === "readonly"
					? "[READ-ONLY MODE ACTIVE]\n" +
						"The edit and write tools are disabled, and bash is restricted to non-destructive commands.\n" +
						"Do not attempt file changes. Investigate, explain findings, and propose a plan instead.\n" +
						"If changes are actually needed, tell the user to run /write to enable scoped write access."
					: "[CONFIRM-WRITE MODE ACTIVE]\n" +
						"Reads are unrestricted. Each edit/write tool call or destructive bash command will\n" +
						"prompt the user for approval before it runs. 'Allow all' only auto-approves writes under\n" +
						`${AUTO_WRITE_ROOT}. If the user denies a write, respect it.`;
		return {
			message: {
				customType: "write-gate-context",
				content: content + orchestratorNote,
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
		updateStatusBar(ctx);
	});
}
