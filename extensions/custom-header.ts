/**
 * Custom Header Extension
 *
 * Replaces the built-in pi header (logo + keybinding hints) with a
 * figlet ASCII-art banner reading "harimo", followed by three quiet
 * subtitle lines: a time-of-day greeting, a cwd/git-branch context line,
 * and a deterministic "aphorism of the day".
 */

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, sep } from "node:path";
import { complete, getModel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

// --- Chat descriptor: a one-line summary of the current conversation ---

type ContentBlock = { type?: string; text?: string };
type SessionEntry = { type: string; message?: { role?: string; content?: unknown } };

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n");
}

function firstUserMessage(entries: SessionEntry[]): string {
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		const text = extractText(entry.message.content).trim();
		if (text) return text.replace(/\s+/g, " ");
	}
	return "";
}

function buildConversationText(entries: SessionEntry[]): string {
	const sections: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(entry.message.content).trim();
		if (text) sections.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	// Keep the prompt small — trailing context matters most.
	return sections.join("\n\n").slice(-6000);
}

const SUMMARY_PROMPT = (conversation: string): string =>
	[
		"Write a terse title (max 8 words) describing what this conversation is about.",
		"No quotes, no trailing punctuation, no preamble — output only the title.",
		"",
		"<conversation>",
		conversation,
		"</conversation>",
	].join("\n");

// Generated with: figlet -f standard 'harimo'
const BANNER_LINES = [
	' _                _                 ',
	'| |__   __ _ _ __(_)_ __ ___   ___  ',
	"| '_ \\ / _` | '__| | '_ ` _ \\ / _ \\ ",
	'| | | | (_| | |  | | | | | | | (_) |',
	'|_| |_|\\__,_|_|  |_|_| |_| |_|\\___/ ',
];

// Deterministic "aphorism of the day" — same for everyone, everywhere, all day.
const APHORISMS = [
	"the void ships no bugs",
	"small diffs, long orbits",
	"make it work, make it right, make it porcelain",
	"every session spirals into the core",
	"attention is gravity",
	"delete more than you write",
	"the event horizon is just scope creep",
	"quiet tools, loud results",
	"entropy is the only reviewer that never sleeps",
	"a good name bends light",
];

function getBanner(theme: Theme): string[] {
	const colored = BANNER_LINES.map((line) => theme.fg("accent", line));
	return ["", ...colored, ""];
}

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour >= 5 && hour <= 11) return "morning, harimo";
	if (hour >= 12 && hour <= 16) return "afternoon, harimo";
	if (hour >= 17 && hour <= 21) return "evening, harimo";
	return "burning the midnight oil, harimo";
}

function getAphorism(): string {
	// Local-day math, not UTC — the aphorism should flip at local midnight.
	const localMs = Date.now() - new Date().getTimezoneOffset() * 60_000;
	const daysSinceEpoch = Math.floor(localMs / 86_400_000);
	return APHORISMS[daysSinceEpoch % APHORISMS.length]!;
}

/** Collapse an absolute cwd to a short "~/…/leaf" form, or bare basename outside home. */
function shortenCwd(cwd: string): string {
	const home = homedir();
	if (cwd === home) return "~";
	if (cwd.startsWith(home + sep)) {
		const remainder = cwd.slice(home.length + 1);
		const segments = remainder.split(sep).filter(Boolean);
		const last = segments[segments.length - 1] ?? "";
		return segments.length > 1 ? `~/\u2026/${last}` : `~/${last}`;
	}
	return basename(cwd);
}

/** Computed once at session_start, not per render — git branch lookup shells out. */
function computeContextLine(cwd: string): string {
	const dir = shortenCwd(cwd);
	try {
		const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 500,
		})
			.toString()
			.trim();
		return branch ? `${dir} · ${branch}` : dir;
	} catch {
		return dir;
	}
}

export default function (pi: ExtensionAPI) {
	let contextLine = "";
	let descriptor = "";
	let lastSummarizedCount = 0;
	let generating = false;
	let requestRender: (() => void) | undefined;

	const setDescriptor = (value: string) => {
		const next = value.trim().replace(/\s+/g, " ");
		if (!next || next === descriptor) return;
		descriptor = next;
		requestRender?.();
	};

	// Cheap async refinement of the descriptor using the current session model.
	const refineDescriptor = async (ctx: any) => {
		if (generating || !ctx.model) return;
		const entries: SessionEntry[] = ctx.sessionManager.getBranch();
		const count = entries.filter(
			(e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
		).length;
		if (count === lastSummarizedCount) return;

		const conversation = buildConversationText(entries);
		if (!conversation) return;

		generating = true;
		try {
			const model = getModel(ctx.model.provider, ctx.model.id);
			if (!model) return;
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth?.ok || !auth.apiKey) return;
			const response = await complete(
				model,
				{
					messages: [
						{
							role: "user" as const,
							content: [{ type: "text" as const, text: SUMMARY_PROMPT(conversation) }],
							timestamp: Date.now(),
						},
					],
				},
				{ apiKey: auth.apiKey, headers: auth.headers, env: auth.env, reasoningEffort: "minimal" },
			);
			const title = response.content
				.filter((c: ContentBlock): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join(" ")
				.trim();
			if (title) {
				lastSummarizedCount = count;
				setDescriptor(title);
			}
		} catch {
			// Never let header refinement break the session — keep the last descriptor.
		} finally {
			generating = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		contextLine = computeContextLine(ctx.cwd);

		// Seed from any existing conversation (e.g. a resumed session).
		const seed = firstUserMessage(ctx.sessionManager.getBranch());
		if (seed) descriptor = seed;

		if (ctx.mode === "tui") {
			ctx.ui.setHeader((tui, theme) => {
				requestRender = () => tui.requestRender();
				return {
					render(width: number): string[] {
						const banner = getBanner(theme);
						const greetingLine = `${theme.fg("muted", `   ${getGreeting()}`)}${theme.fg("dim", ` v${VERSION}`)}`;
						const contextLineStyled = theme.fg("dim", `   ${contextLine}`);
						const aphorismLine = theme.fg("dim", `   \x1b[3m${getAphorism()}\x1b[23m`);
						const lines = [
							...banner,
							truncateToWidth(greetingLine, width),
							truncateToWidth(contextLineStyled, width),
							truncateToWidth(aphorismLine, width),
						];
						if (descriptor) {
							const chatLine = `${theme.fg("muted", "   chat: ")}${theme.fg("dim", descriptor)}`;
							lines.push(truncateToWidth(chatLine, width, "…"));
						}
						return lines;
					},
					invalidate() {},
				};
			});
		}
	});

	// Refresh the chat descriptor after each assistant turn.
	pi.on("message_end", async (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (!descriptor) {
			const seed = firstUserMessage(ctx.sessionManager.getBranch());
			if (seed) setDescriptor(seed);
		}
		if (event.message?.role === "assistant") void refineDescriptor(ctx);
	});

	pi.registerCommand("builtin-header", {
		description: "Restore built-in header with keybinding hints",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
