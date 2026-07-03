/**
 * Chat Descriptor Header
 *
 * Adds a one-line "summary descriptor" of the current conversation to the pi
 * terminal header. The descriptor starts as the first user message (truncated)
 * and, once the current model is available, is refined into a short title by a
 * cheap async model call after each assistant turn.
 *
 * Restore the built-in header with /builtin-header.
 */

import { complete, getModel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type ContentBlock = { type?: string; text?: string };
type SessionEntry = {
	type: string;
	message?: { role?: string; content?: unknown };
};

const extractText = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n");
};

const firstUserMessage = (entries: SessionEntry[]): string => {
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		const text = extractText(entry.message.content).trim();
		if (text) return text.replace(/\s+/g, " ");
	}
	return "";
};

const buildConversationText = (entries: SessionEntry[]): string => {
	const sections: string[] = [];
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(entry.message.content).trim();
		if (text) sections.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	// Keep the prompt small — most recent context matters most.
	return sections.join("\n\n").slice(-6000);
};

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
	let requestRender: (() => void) | undefined;

	const setDescriptor = (value: string) => {
		const next = value.trim().replace(/\s+/g, " ");
		if (!next || next === descriptor) return;
		descriptor = next;
		requestRender?.();
	};

	// Cheap async refinement of the descriptor using the current model.
	const refineDescriptor = async (ctx: any) => {
		if (generating || !ctx.model) return;
		const entries: SessionEntry[] = ctx.sessionManager.getBranch();
		const messageCount = entries.filter(
			(e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
		).length;
		if (messageCount === lastSummarizedCount) return;

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
				lastSummarizedCount = messageCount;
				setDescriptor(title);
			}
		} catch {
			// Never let header refinement break the session — keep the last descriptor.
		} finally {
			generating = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		// Seed from any existing conversation (e.g. resumed session).
		const seed = firstUserMessage(ctx.sessionManager.getBranch());
		if (seed) descriptor = seed;

		ctx.ui.setHeader((tui, theme: Theme) => {
			requestRender = () => tui.requestRender();
			return {
				render(width: number): string[] {
					const title =
						theme.fg("accent", theme.bold("π")) +
						theme.fg("dim", ` v${VERSION}`);
					const label = theme.fg("muted", "chat: ");
					const body = descriptor
						? theme.fg("text", descriptor)
						: theme.fg("dim", "(no messages yet)");
					const line = label + body;
					return [title, truncateToWidth(line, width, "…"), ""];
				},
				invalidate() {},
			};
		});
	});

	// Refresh the descriptor after each assistant turn.
	pi.on("message_end", async (event, ctx) => {
		if (ctx.mode !== "tui") return;
		// On the very first user message, show it immediately before refinement.
		if (!descriptor) {
			const seed = firstUserMessage(ctx.sessionManager.getBranch());
			if (seed) setDescriptor(seed);
		}
		if (event.message?.role === "assistant") {
			void refineDescriptor(ctx);
		}
	});

	pi.registerCommand("builtin-header", {
		description: "Restore the built-in pi header",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
