/**
 * Minimal UI — companion extension to the "porcelain" theme.
 *
 * Comprehensive quiet redesign of pi's chrome:
 *   - Footer: one whisper-dim line — model · branch · context% · tokens · cost
 *   - Working indicator: a slow breathing dot in grayscale
 *
 * /minimal-ui   toggle between minimal chrome and pi defaults
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fmtTokens } from "./lib/format.ts";

const SEP = "  ·  ";

// Lets the top-level thinking_level_select handler nudge the minimal footer.
let requestFooterRender: (() => void) | undefined;
let working = false;
let pulseFrame = 0;

function applyMinimalChrome(pi: ExtensionAPI, ctx: ExtensionContext): void {
	// Breathing dot — theme-derived luminance ramp (dim -> muted -> accent -> dim)
	// so it reads with the right contrast on both dark and light theme variants.
	const theme = ctx.ui.theme;
	ctx.ui.setWorkingIndicator({
		frames: [
			theme.fg("dim", "·"),
			theme.fg("dim", "•"),
			theme.fg("muted", "•"),
			theme.fg("muted", "•"),
			theme.fg("dim", "•"),
			theme.fg("dim", "·"),
		],
		intervalMs: 220,
	});

	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		requestFooterRender = () => tui.requestRender();
		const pulseTimer = setInterval(() => {
			if (!working) return;
			pulseFrame++;
			tui.requestRender();
		}, 160);

		return {
			dispose: () => {
				clearInterval(pulseTimer);
				requestFooterRender = undefined;
				unsub();
			},
			invalidate() {},
			render(width: number): string[] {
				let input = 0;
				let output = 0;
				let cost = 0;
				let lastContext = 0;
				for (const e of ctx.sessionManager.getBranch()) {
					if (e.type !== "message") continue;
					if (e.message.role === "assistant") {
						const m = e.message as AssistantMessage;
						input += m.usage.input;
						output += m.usage.output;
						cost += m.usage.cost.total;
						lastContext = m.usage.input + m.usage.output + m.usage.cacheRead + m.usage.cacheWrite;
					} else if (e.message.role === "toolResult" && (e.message as { toolName?: string }).toolName === "subagent") {
						// Fold in delegated subagent spend (persisted in tool result details).
						const details = (e.message as { details?: { results?: Array<{ usage?: { cost?: number } }> } }).details;
						for (const r of details?.results ?? []) cost += r.usage?.cost ?? 0;
					}
				}

				const model = ctx.model?.id ?? "no model";
				const branch = footerData.getGitBranch();
				const window = ctx.model?.contextWindow ?? 0;
				const ctxPct = window > 0 && lastContext > 0 ? `${Math.min(100, Math.round((lastContext / window) * 100))}%` : null;

				const leftParts = [model];
				if (branch) leftParts.push(branch);
				leftParts.push(pi.getThinkingLevel());

				const rightParts: string[] = [];
				if (ctxPct) rightParts.push(`ctx ${ctxPct}`);
				if (input + output > 0) rightParts.push(`${fmtTokens(input)}↑ ${fmtTokens(output)}↓`);
				if (cost > 0) rightParts.push(`$${cost.toFixed(2)}`);

				const left = theme.fg("dim", leftParts.join(SEP));
				const right = theme.fg("dim", rightParts.join(SEP));

				const gap = width - visibleWidth(left) - visibleWidth(right);
				if (gap < 1) return [truncateToWidth(left, width)];
				return [left + " ".repeat(gap) + right];
			},
		};
	});

	const ramp = ["dim", "muted", "accent", "muted"] as const;
	ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
		const ed = new CustomEditor(tui, editorTheme, keybindings);
		const idleBorder = ed.borderColor; // capture default
		const origRender = ed.render.bind(ed);
		ed.render = (width: number) => {
			ed.borderColor = working ? (s: string) => theme.fg(ramp[pulseFrame % ramp.length], s) : idleBorder;
			return origRender(width);
		};
		return ed;
	});
}

function restoreDefaults(ctx: ExtensionContext): void {
	ctx.ui.setFooter(undefined);
	ctx.ui.setWorkingIndicator(undefined);
	ctx.ui.setEditorComponent(undefined);
}

export default function (pi: ExtensionAPI) {
	let enabled = true;

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) applyMinimalChrome(pi, ctx);
	});

	pi.on("thinking_level_select", async () => {
		requestFooterRender?.();
	});

	pi.on("agent_start", async () => {
		working = true;
		requestFooterRender?.();
	});

	pi.on("agent_end", async () => {
		working = false;
		requestFooterRender?.();
	});

	pi.registerCommand("minimal-ui", {
		description: "Toggle minimal chrome (quiet footer + breathing indicator)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (enabled) {
				applyMinimalChrome(pi, ctx);
				ctx.ui.notify("Minimal chrome on", "info");
			} else {
				restoreDefaults(ctx);
				ctx.ui.notify("Default chrome restored", "info");
			}
		},
	});
}
