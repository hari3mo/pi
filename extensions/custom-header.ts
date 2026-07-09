/**
 * Custom Header Extension
 *
 * Replaces the built-in pi header (logo + keybinding hints) with a
 * figlet ASCII-art banner reading "harimo", followed by three quiet
 * subtitle lines: a time-of-day greeting, a cwd/git-branch context line,
 * and a deterministic "aphorism of the day".
 */

import { execFileSync } from "node:child_process";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { shortenCwd } from "./lib/format.ts";
import { personaEnabled } from "./familiar.ts";

// Generated with: figlet -f standard 'harimo'
const BANNER_LINES = [
	' _                _                 ',
	'| |__   __ _ _ __(_)_ __ ___   ___  ®',
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

// Measured once: the widest visible column the banner art occupies. Below
// this terminal width the art itself would be clipped mid-glyph, so render()
// drops it in favor of the compact greeting-only fallback.
const BANNER_WIDTH = Math.max(...BANNER_LINES.map((line) => line.length));

function getBanner(theme: Theme, width: number): string[] {
	// truncateToWidth on every line, even though the caller already guards on
	// BANNER_WIDTH — a stale/raced width can still slip a narrower value in
	// here than the one the guard checked, and an untruncated ANSI-colored
	// line would clip the art mid-glyph instead of cutting cleanly.
	const colored = BANNER_LINES.map((line) =>
		truncateToWidth(theme.fg("accent", line), width),
	);
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

	pi.on("session_start", async (_event, ctx) => {
		// Bow out cleanly when the Ember persona owns the header (flag check only).
		if (personaEnabled()) return;
		contextLine = computeContextLine(ctx.cwd);

		if (ctx.mode === "tui") {
			ctx.ui.setHeader((_tui, theme) => {
				return {
					render(width: number): string[] {
						const greetingLine = `${theme.fg("muted", `   ${getGreeting()}`)}${theme.fg("dim", ` v${VERSION}`)}`;
						const contextLineStyled = theme.fg("dim", `   ${contextLine}`);
						const aphorismLine = theme.fg("dim", `   \x1b[3m${getAphorism()}\x1b[23m`);
						const lines = [
							truncateToWidth(greetingLine, width),
							truncateToWidth(contextLineStyled, width),
							truncateToWidth(aphorismLine, width),
						];
						// +1 margin: BANNER_WIDTH is the widest banner line's exact length,
						// so require one spare column rather than an exact-fit width.
						if (width < BANNER_WIDTH + 1) return lines;
						return [...getBanner(theme, width), ...lines];
					},
					invalidate() {},
				};
			});
		}
	});

	pi.registerCommand("builtin-header", {
		description: "Restore built-in header with keybinding hints",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
