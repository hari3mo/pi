/**
 * Session Receipt Extension
 *
 * Renders a narrow "shop receipt" style summary of the current session:
 * duration, turn count, token usage, cost, tool-call tally, and files
 * touched. Computed on demand from ctx.sessionManager.getBranch(), so it
 * works even after /resume (no extension-local state to reconstruct).
 *
 * /receipt   toggle the session receipt widget on/off
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

const MAX_FILES_SHOWN = 8;

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}m`;
}

function fmtCost(n: number): string {
	if (n <= 0) return "$0.00";
	return n >= 0.1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

function fmtDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

/** Pad a receipt label to a fixed column width, e.g. "session   ". */
function label(text: string): string {
	return text.padEnd(10, " ");
}

export default function (pi: ExtensionAPI) {
	let visible = false;

	pi.registerCommand("receipt", {
		description: "Toggle the session receipt widget",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;

			if (visible) {
				ctx.ui.setWidget("receipt", undefined);
				visible = false;
				return;
			}

			const branch = ctx.sessionManager.getBranch();

			let earliestMs: number | undefined;
			let turns = 0;
			let tokensIn = 0;
			let tokensOut = 0;
			let cost = 0;
			const toolCounts = new Map<string, number>();
			const filesTouched = new Set<string>();

			for (const entry of branch) {
				const entryMs = Date.parse(entry.timestamp);
				if (!Number.isNaN(entryMs) && (earliestMs === undefined || entryMs < earliestMs)) {
					earliestMs = entryMs;
				}

				if (entry.type !== "message") continue;
				const message = entry.message;
				if (!message || message.role !== "assistant") continue;

				const assistant = message as AssistantMessage;
				turns += 1;
				tokensIn += assistant.usage?.input ?? 0;
				tokensOut += assistant.usage?.output ?? 0;
				cost += assistant.usage?.cost?.total ?? 0;

				for (const block of assistant.content ?? []) {
					if (!block || (block as { type?: string }).type !== "toolCall") continue;
					const toolCall = block as { name?: string; arguments?: Record<string, unknown> };
					const name = toolCall.name ?? "unknown";
					toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);

					if (name === "edit" || name === "write") {
						const args = toolCall.arguments ?? {};
						const path = (args as { path?: unknown }).path;
						if (typeof path === "string" && path.length > 0) {
							filesTouched.add(path);
						}
					}
				}
			}

			const theme = ctx.ui.theme;

			if (turns === 0) {
				ctx.ui.setWidget("receipt", [theme.fg("muted", "nothing on the tab yet.")]);
				visible = true;
				return;
			}

			const sessionName = ctx.sessionManager.getSessionName?.() ?? undefined;
			const duration = fmtDuration(Date.now() - (earliestMs ?? Date.now()));

			const topTools = [...toolCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([name, count]) => `${name} \u00d7${count}`)
				.join(" \u00b7 ");

			const fileList = [...filesTouched].map((path) => basename(path));
			const shownFiles = fileList.slice(0, MAX_FILES_SHOWN);
			const extraFiles = fileList.length - shownFiles.length;
			const filesLine = fileList.length === 0 ? "none" : shownFiles.join(", ") + (extraFiles > 0 ? `, +${extraFiles} more` : "");

			const lines = [
				theme.fg("dim", "\u2500\u2500 harimo's pi \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"),
				`${theme.fg("muted", label("session"))}${sessionName || "unnamed"}`,
				`${theme.fg("muted", label("duration"))}${duration}`,
				`${theme.fg("muted", label("turns"))}${turns}`,
				`${theme.fg("muted", label("tokens"))}${fmtTokens(tokensIn)} in \u00b7 ${fmtTokens(tokensOut)} out`,
				`${theme.fg("muted", label("cost"))}${fmtCost(cost)}`,
				`${theme.fg("muted", label("tools"))}${topTools || "none"}`,
				`${theme.fg("muted", label("files"))}${filesLine}`,
				theme.fg("dim", "\u2500".repeat(29)),
				theme.fg("muted", "thanks for hacking. come again."),
			];

			ctx.ui.setWidget("receipt", lines);
			visible = true;
		},
	});
}
