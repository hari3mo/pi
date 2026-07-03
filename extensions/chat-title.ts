/**
 * Chat Title Extension
 *
 * Sets the iTerm2 (or any terminal) window/tab title to a short summary
 * descriptor of the current chat: project name + a condensed version of
 * the most recent user prompt. Updates every time the user submits a new
 * message, so the window header stays a live descriptor of "what this
 * pi session is about" — handy for finding the right tab/window when
 * running several sessions at once.
 */

import { homedir } from "node:os";
import { basename, sep } from "node:path";
import { convertToLlm, serializeConversation, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai/compat";

const MAX_DESCRIPTOR_LEN = 42;
// Cap how much conversation text we feed to the title model — keeps the
// extra call cheap even after a long tool-heavy turn.
const MAX_CONVERSATION_CHARS = 8000;
// Don't let a stuck title call hang around forever.
const TITLE_TIMEOUT_MS = 15_000;

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
	return basename(cwd) || cwd;
}

/** Turn a raw user prompt into a short, single-line descriptor for a window title. */
function summarizePrompt(prompt: string): string {
	const firstLine = prompt
		.replace(/```[\s\S]*?```/g, " ") // drop fenced code blocks
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "";

	const cleaned = firstLine
		.replace(/[`*_#>]/g, "") // strip common markdown noise
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length <= MAX_DESCRIPTOR_LEN) return cleaned;
	return `${cleaned.slice(0, MAX_DESCRIPTOR_LEN - 1).trimEnd()}\u2026`;
}

/** Clean up whatever the title model returned into a single short phrase. */
function sanitizeLlmTitle(raw: string): string {
	let cleaned = raw
		.replace(/[\r\n]+/g, " ")
		.trim()
		.replace(/^["'`\s]+|["'`\s]+$/g, "") // strip wrapping quotes/backticks
		.replace(/[.!?]+$/, "") // no trailing punctuation in a title
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > MAX_DESCRIPTOR_LEN) {
		cleaned = `${cleaned.slice(0, MAX_DESCRIPTOR_LEN - 1).trimEnd()}\u2026`;
	}
	return cleaned;
}

/**
 * Ask the model currently active in the session for a short window-title
 * descriptor of this turn's exchange. Uses `ctx.model` (whatever the user
 * has selected) rather than hardcoding a separate "cheap" model — auth for
 * it is already resolved for the live conversation, and there's no
 * guarantee a lighter model (e.g. a flash/haiku tier) is registered in
 * every setup. Returns undefined on any failure so the caller can fall
 * back to the existing heuristic title instead of clobbering it.
 */
async function generateLlmTitle(ctx: ExtensionContext, messages: unknown[]): Promise<string | undefined> {
	const model = ctx.model;
	if (!model) return undefined;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return undefined;

	// biome-ignore lint/suspicious/noExplicitAny: messages come straight from the agent_end event
	const conversationText = serializeConversation(convertToLlm(messages as any)).slice(0, MAX_CONVERSATION_CHARS);
	if (!conversationText.trim()) return undefined;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

	try {
		const response = await complete(
			model,
			{
				messages: [
					{
						role: "user" as const,
						content: [
							{
								type: "text" as const,
								text: `Generate a short terminal window title describing what this exchange is about, 3 to 6 words. Plain text only: no quotes, no markdown, no trailing punctuation, no preamble like "Title:" — just the words.\n\n<exchange>\n${conversationText}\n</exchange>`,
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				maxTokens: 32,
				signal: controller.signal,
			},
		);

		const text = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join(" ");

		const sanitized = sanitizeLlmTitle(text);
		return sanitized || undefined;
	} catch {
		return undefined;
	} finally {
		clearTimeout(timeout);
	}
}

export default function (pi: ExtensionAPI) {
	let projectLabel = "";

	pi.on("session_start", async (_event, ctx) => {
		projectLabel = shortenCwd(ctx.cwd);
		if (ctx.hasUI) ctx.ui.setTitle(`pi \u00b7 ${projectLabel}`);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		// Instant, cheap heuristic title so the header updates the moment the
		// prompt is submitted — replaced by the LLM-generated one below once
		// the turn finishes and there's more context to summarize from.
		const descriptor = summarizePrompt(event.prompt ?? "");
		const title = descriptor ? `pi \u00b7 ${projectLabel} \u00b7 ${descriptor}` : `pi \u00b7 ${projectLabel}`;
		ctx.ui.setTitle(title);
	});

	pi.on("agent_end", (event, ctx) => {
		if (!ctx.hasUI) return;
		// Fire-and-forget: don't hold up turn completion waiting on an extra
		// LLM call. If it fails or times out, the heuristic title from
		// before_agent_start simply stays put.
		void generateLlmTitle(ctx, event.messages).then((descriptor) => {
			if (!descriptor) return;
			ctx.ui.setTitle(`pi \u00b7 ${projectLabel} \u00b7 ${descriptor}`);
		});
	});

	pi.registerCommand("chat-title", {
		description: "Reset the terminal window title to just the project name",
		handler: async (_args, ctx) => {
			ctx.ui.setTitle(`pi \u00b7 ${projectLabel}`);
			ctx.ui.notify("Window title reset", "info");
		},
	});
}
