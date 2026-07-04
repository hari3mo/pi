/**
 * Chat Title Extension
 *
 * Sets the iTerm2 (or any terminal) window/tab title to a short summary
 * descriptor of the current chat: project name + a condensed version of
 * the most recent user prompt. Updates every time the user submits a new
 * message, so the window header stays a live descriptor of "what this
 * pi session is about" — handy for finding the right tab/window when
 * running several sessions at once. Also prepends a running session
 * timer (elapsed since session start) that ticks every second, shown
 * to the left of the summary title.
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

/** Format elapsed milliseconds as a compact running-timer string. */
function formatElapsed(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

export default function (pi: ExtensionAPI) {
	let projectLabel = "";
	let baseTitle = "";
	let startTime = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	function applyTitle(ctx: { ui: { setTitle(title: string): void } }) {
		ctx.ui.setTitle(`${formatElapsed(Date.now() - startTime)} \u00b7 ${baseTitle}`);
	}

	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		projectLabel = shortenCwd(ctx.cwd);
		baseTitle = `pi \u00b7 ${projectLabel}`;
		startTime = Date.now();
		if (!ctx.hasUI) return;
		applyTitle(ctx);
		stopTimer();
		timer = setInterval(() => applyTitle(ctx), 1000);
		// Don't let the timer keep the process alive on exit.
		timer.unref?.();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		// Heuristic title so the header updates the moment the prompt is
		// submitted. This is the only title source — no LLM call.
		const descriptor = summarizePrompt(event.prompt ?? "");
		baseTitle = descriptor
			? `pi \u00b7 ${projectLabel} \u00b7 ${descriptor}`
			: `pi \u00b7 ${projectLabel}`;
		applyTitle(ctx);
	});

	pi.on("session_shutdown", async () => {
		stopTimer();
	});

	pi.registerCommand("chat-title", {
		description: "Reset the terminal window title to just the project name",
		handler: async (_args, ctx) => {
			baseTitle = `pi \u00b7 ${projectLabel}`;
			applyTitle(ctx);
			ctx.ui.notify("Window title reset", "info");
		},
	});
}
