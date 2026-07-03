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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_DESCRIPTOR_LEN = 42;

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

export default function (pi: ExtensionAPI) {
	let projectLabel = "";

	function setTitleFrom(descriptor: string) {
		const title = descriptor ? `pi \u00b7 ${projectLabel} \u00b7 ${descriptor}` : `pi \u00b7 ${projectLabel}`;
		pi.getActiveTools; // no-op reference kept out; real call below
	}

	pi.on("session_start", async (_event, ctx) => {
		projectLabel = shortenCwd(ctx.cwd);
		if (ctx.mode === "tui" || ctx.mode === "rpc") {
			ctx.ui.setTitle(`pi \u00b7 ${projectLabel}`);
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
		const descriptor = summarizePrompt(event.prompt ?? "");
		const title = descriptor ? `pi \u00b7 ${projectLabel} \u00b7 ${descriptor}` : `pi \u00b7 ${projectLabel}`;
		ctx.ui.setTitle(title);
	});

	pi.registerCommand("chat-title", {
		description: "Reset the terminal window title to just the project name",
		handler: async (_args, ctx) => {
			ctx.ui.setTitle(`pi \u00b7 ${projectLabel}`);
			ctx.ui.notify("Window title reset", "info");
		},
	});
}
