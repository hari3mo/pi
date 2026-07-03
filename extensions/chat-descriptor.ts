/**
 * Chat Descriptor
 *
 * Shows a persistent one-line "summary descriptor" of the current conversation
 * as a sticky widget directly above the input editor. Unlike the header (which
 * scrolls off the top once messages arrive), this widget stays visible the
 * whole session.
 *
 * The descriptor seeds from your first message, then is refined into a terse
 * title by a cheap async call to the current session model after each assistant
 * turn. Toggle it off/on with /chat-descriptor.
 */

import { complete, getModel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "chat-descriptor";
const MAX_LEN = 100;

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

function countMessages(entries: SessionEntry[]): number {
	return entries.filter(
		(e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
	).length;
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

export default function (pi: ExtensionAPI) {
	let descriptor = "";
	let lastSummarizedCount = 0;
	let generating = false;
	let enabled = true;

	const paint = (ctx: ExtensionContext) => {
		if (!enabled || ctx.mode !== "tui") return;
		const theme = ctx.ui.theme;
		if (!descriptor) {
			ctx.ui.setWidget(WIDGET_KEY, [theme.fg("dim", "▌ (no conversation yet)")]);
			return;
		}
		const text = descriptor.length > MAX_LEN ? `${descriptor.slice(0, MAX_LEN - 1)}…` : descriptor;
		ctx.ui.setWidget(WIDGET_KEY, [theme.fg("accent", "▌ ") + theme.fg("muted", text)]);
	};

	const setDescriptor = (value: string, ctx: ExtensionContext) => {
		const next = value.trim().replace(/\s+/g, " ");
		if (!next || next === descriptor) return;
		descriptor = next;
		paint(ctx);
	};

	// Cheap async refinement using the current session model.
	const refine = async (ctx: any) => {
		if (generating || !ctx.model) return;
		const entries: SessionEntry[] = ctx.sessionManager.getBranch();
		const count = countMessages(entries);
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
				setDescriptor(title, ctx);
			}
		} catch {
			// Never let refinement break the session — keep the last descriptor.
		} finally {
			generating = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const seed = firstUserMessage(ctx.sessionManager.getBranch());
		if (seed) descriptor = seed;
		paint(ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		if (ctx.mode !== "tui" || !enabled) return;
		if (!descriptor) {
			const seed = firstUserMessage(ctx.sessionManager.getBranch());
			if (seed) setDescriptor(seed, ctx);
		}
		if (event.message?.role === "assistant") void refine(ctx);
	});

	pi.registerCommand("chat-descriptor", {
		description: "Toggle the conversation summary widget above the editor",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (enabled) {
				paint(ctx);
				ctx.ui.notify("Chat descriptor on", "info");
			} else {
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				ctx.ui.notify("Chat descriptor off", "info");
			}
		},
	});
}
