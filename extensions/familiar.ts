/**
 * familiar — "Harimo", a terminal star-sprite for the pi TUI.
 *
 * A small ASCII star-sprite that lives in your prompt and reacts to what pi is
 * doing — kin to the cosmic void-blackhole identity, not its opposite: where
 * the black hole is the whole galaxy spiralling into a supermassive core, Harimo
 * is a single mote of that same starlight, twinkling quietly in the background
 * (the daemon still runs, it just wears a star now). A little sparking star
 * reads crisply in glyphs on any terminal.
 *
 * Chrome, all opt-in:
 *   - splash   : the void-blackhole landing page stays the startup splash.
 *   - header   : the void-blackhole harimo wordmark stays on the prompt page.
 *   - widget   : a persistent status line below the editor — the "living"
 *                familiar sprite, twinkling and reacting; one modest timer drives it.
 *
 * State reactions (twinkles / flares / expression changes, CPU trivial):
 *   idle      *o.o*  adrift      — resting; faint twinkle, slow blink
 *   thinking  *-.o*  scanning…   — rays shimmering while the agent streams
 *   tool      *^.^*  flaring     — rays pulse bright while a tool runs
 *   error     *x.x*  collapse!   — rays scatter after a tool error (auto-decays)
 *
 * Coexistence: void-blackhole owns the startup splash + prompt-page wordmark;
 * Harimo owns only the status widget when awake. custom-header bows out via
 * `personaEnabled()` so only one header renders at a time. With the persona
 * DISABLED (the default: no flag file) this module does nothing and the void
 * identity behaves exactly as before.
 *
 * Toggle (a real registered command, per the pi 0.80.3 constraint that
 * extensions cannot synthesize "/cmd" text):  /familiar
 * Status applies live; the void splash + wordmark header remain the landing
 * page and prompt-page chrome.
 *
 * Fail-open: every render is wrapped so a throw can never break the session.
 */

import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";

// pi-coding-agent does not re-export the TUI type; we only ever call
// requestRender(), so a minimal structural type keeps the callbacks honest.
type TUIRef = { requestRender: () => void };
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// --------------------------------------------------------------- opt-in flag --
// Presence of this file = Harimo is awake. Resolved next to the agent dir so the
// guards in void-blackhole/custom-header (which import personaEnabled) read the
// exact same path regardless of who imports this module.
const FLAG_PATH: string = (() => {
	try {
		return fileURLToPath(new URL("../.familiar-enabled", import.meta.url));
	} catch {
		return join(process.env.HOME ?? ".", ".pi/agent/.familiar-enabled");
	}
})();

/** True when the Harimo persona is enabled. Fail-open: any error → disabled. */
export function personaEnabled(): boolean {
	try {
		return existsSync(FLAG_PATH);
	} catch {
		return false;
	}
}

// ------------------------------------------------------------------- faces ----
export type Mood = "idle" | "thinking" | "tool" | "error";

const MOODS: readonly Mood[] = ["idle", "thinking", "tool", "error"] as const;

export interface Face {
	mood: Mood;
	eyes: string; // 3 chars — the sprite's face
	ray: string; //  1 char — the animated sparkle glyph on the rays
	word: string;
	/** Semantic theme color name for this mood. */
	color: string;
	/** Front-facing star-sprite, 3 lines, ASCII-only (safe width anywhere). */
	art: string[];
	/** Compact sprite for the one-line status widget. */
	kao: string;
}

/**
 * Pure mood → face. `tick` drives the cheap in-mood animation (eye scan,
 * scanning dots, ray pulse); `blink` briefly shuts the eyes. Deterministic, so
 * the harness can assert frames differ across moods and fit the width budget.
 */
export function faceFor(mood: Mood, opts?: { tick?: number; blink?: boolean }): Face {
	const t = opts?.tick ?? 0;
	const blink = opts?.blink ?? false;
	let eyes: string;
	let ray: string;
	let word: string;
	let color: string;
	switch (mood) {
		case "thinking":
			eyes = blink ? "-.-" : ["o.o", "-.o", "o.-"][t % 3]!;
			ray = ["~", "*", "~", "."][t % 4]!; // rays shimmer as it scans
			word = "scanning" + ".".repeat(t % 4);
			color = "accent";
			break;
		case "tool":
			eyes = blink ? "-.-" : "^.^";
			ray = t % 2 ? "*" : "+"; // flaring — rays pulse bright
			word = "flaring";
			color = "success";
			break;
		case "error":
			eyes = "x.x"; // too rattled to twinkle
			ray = "!"; //     rays scattered by the shock
			word = "collapse!";
			color = "error";
			break;
		default: // idle
			eyes = blink ? "-.-" : "o.o";
			ray = "."; // faint resting twinkle
			word = "adrift";
			color = "muted";
			break;
	}
	const art = [
		` \\ ${ray} /`,
		`( ${eyes} )`,
		` / ${ray} \\`,
	];
	const kao = `*${eyes}*`;
	return { mood, eyes, ray, word, color, art, kao };
}

/** Plain (uncolored) one-line status text. Exported for the harness. */
export function widgetLinePlain(mood: Mood, tick: number, blink = false): string {
	const f = faceFor(mood, { tick, blink });
	return `harimo ${f.kao}  ${f.word}`;
}

type Seg = { t: string; c: string };

/** Header as 3 lines of colored segments — sprite + wordmark + mood. */
export function headerSegments(mood: Mood, tick: number): Seg[][] {
	const f = faceFor(mood, { tick });
	const pad = (s: string) => s + " ".repeat(Math.max(0, 8 - s.length));
	return [
		[{ t: pad(f.art[0]!), c: f.color }, { t: "  ", c: "dim" }, { t: "harimo", c: "accent" }],
		[
			{ t: pad(f.art[1]!), c: f.color },
			{ t: "  ", c: "dim" },
			{ t: "your terminal star-sprite", c: "dim" },
		],
		[{ t: pad(f.art[2]!), c: f.color }, { t: "  ", c: "dim" }, { t: `~ ${f.word}`, c: f.color } ],
	];
}

// A theme-ish thing that also tolerates the harness's identity stub.
type Fg = { fg?: (name: string, text: string) => string };
const fgOf = (theme: Fg) => (name: string, text: string) =>
	typeof theme?.fg === "function" ? theme.fg(name, text) : text;

const centerAnsi = (s: string, width: number): string => {
	const pad = Math.max(0, Math.floor((width - visibleWidth(s)) / 2));
	return " ".repeat(pad) + s;
};

// ---------------------------------------------------------- splash component --
class FamiliarSplash {
	private tui: { requestRender: () => void };
	private theme: Fg;
	private onClose: () => void;
	private interval: ReturnType<typeof setInterval> | null = null;
	private cwd: string;
	// exposed for the harness (advanced directly instead of via the timer)
	tick = 0;

	constructor(tui: { requestRender: () => void }, theme: Fg, onClose: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.onClose = onClose;
		const home = process.env.HOME ?? "";
		this.cwd =
			home && process.cwd().startsWith(home)
				? "~" + process.cwd().slice(home.length)
				: process.cwd();
		this.interval = setInterval(() => {
			this.tick++;
			this.tui.requestRender();
		}, 140);
		this.interval.unref?.();
	}

	handleInput(): void {
		this.close();
	}

	private close(): void {
		this.dispose();
		this.onClose();
	}

	invalidate(): void {}

	render(width: number): string[] {
		try {
			return this.renderInner(Math.max(1, width));
		} catch {
			return [""]; // fail-open: never break the session over a splash frame
		}
	}

	private renderInner(width: number): string[] {
		const fg = fgOf(this.theme);
		// Slow demo: cycle the mood every ~14 frames so the splash shows off all
		// four state reactions on its own.
		const demoMood = MOODS[Math.floor(this.tick / 14) % MOODS.length]!;
		const blink = this.tick % 18 < 2; // brief double-frame blink
		const f = faceFor(demoMood, { tick: this.tick, blink });

		// Stardust drifting past the sprite — starlight motes, not warm embers.
		const sparks = [" .  *   '", "  '  .  * ", " *   '  . ", "  .  '  * "];
		const starLine = fg("muted", sparks[this.tick % sparks.length]!);

		// Legend with the current mood lit in its own color.
		const legend =
			fg("dim", "· ") +
			MOODS.map((m) => (m === demoMood ? fg(faceFor(m).color, m) : fg("dim", m))).join(
				fg("dim", " · "),
			) +
			fg("dim", " ·");

		const content: string[] = [
			starLine,
			fg(f.color, f.art[0]!),
			fg(f.color, f.art[1]!),
			fg(f.color, f.art[2]!),
			"",
			fg("accent", "n o v a"),
			"",
			fg("dim", "your terminal star-sprite"),
			fg("dim", this.cwd),
			"",
			legend,
			"",
			fg("muted", "press any key to wake the session"),
		];

		const rows = process.stdout.rows ?? 24;
		const topPad = Math.max(1, Math.floor((rows - content.length) / 2));
		const lines: string[] = [];
		for (let i = 0; i < topPad; i++) lines.push("");
		for (const c of content) lines.push(truncateToWidth(centerAnsi(c, width), width));
		return lines;
	}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

// ------------------------------------------------------------- live state -----
// Module-scoped so the event handlers and widget share one mood. Only ever
// mutated while the familiar widget is mounted (chromeOn).
let chromeOn = false;
let mood: Mood = "idle";
let tick = 0;
let widgetRender: (() => void) | null = null;
let beat: ReturnType<typeof setInterval> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function startBeat(): void {
	if (beat) return;
	// ~3 fps: enough for a blink + scanning dots + ray pulse, CPU-trivial.
	beat = setInterval(() => {
		tick++;
		widgetRender?.();
	}, 320);
	beat.unref?.();
}

function stopBeat(): void {
	if (beat) {
		clearInterval(beat);
		beat = null;
	}
}

function clearErrorTimer(): void {
	if (errorTimer) {
		clearTimeout(errorTimer);
		errorTimer = null;
	}
}

/** Change mood and repaint the widget. */
function settle(next: Mood): void {
	clearErrorTimer();
	if (next === mood) return;
	mood = next;
	headerRender?.();
	widgetRender?.();
}

/** Puff up on a tool error, then drift back to the streaming pose. */
function flashError(): void {
	clearErrorTimer();
	mood = "error";
	headerRender?.();
	widgetRender?.();
	errorTimer = setTimeout(() => {
		errorTimer = null;
		if (chromeOn) settle("thinking"); // tool errors happen mid agent-loop
	}, 2500);
	errorTimer.unref?.();
}

export function applyFamiliarWidget(ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") return;
	chromeOn = true;

	ctx.ui.setWidget(
		"familiar",
		(tui: TUIRef, theme: Theme) => {
			widgetRender = () => tui.requestRender();
			startBeat();
			const fg = fgOf(theme);
			return {
				render(width: number): string[] {
					try {
						const blink = mood !== "error" && tick % 7 === 0;
						const f = faceFor(mood, { tick, blink });
						const line = fg(f.color, `harimo ${f.kao}`) + fg("dim", `  ${f.word}`);
						return [truncateToWidth(line, width)];
					} catch {
						return [""];
					}
				},
				invalidate() {},
				dispose() {
					widgetRender = null;
				},
			};
		},
		{ placement: "belowEditor" },
	);
}

function removeChrome(ctx: ExtensionContext): void {
	chromeOn = false;
	clearErrorTimer();
	stopBeat();
	mood = "idle";
	tick = 0;
	ctx.ui.setWidget("familiar", undefined);
}

// ------------------------------------------------------------- extension -----
export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		if (!personaEnabled() || ctx.mode !== "tui") return;
		if (event.reason === "startup") return; // void-blackhole installs widget after its splash.
		applyFamiliarWidget(ctx);
	});

	pi.on("agent_start", async () => {
		if (chromeOn) settle("thinking");
	});
	pi.on("tool_execution_start", async () => {
		if (chromeOn) settle("tool");
	});
	pi.on("tool_execution_end", async (event) => {
		if (!chromeOn) return;
		if (event.isError) flashError();
		else settle("thinking");
	});
	pi.on("agent_end", async () => {
		if (chromeOn) settle("idle");
	});
	pi.on("session_shutdown", async () => {
		clearErrorTimer();
		stopBeat();
	});

	pi.registerCommand("familiar", {
		description:
			"Toggle Harimo, the terminal star-sprite persona (splash + header + status line)",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Harimo lives in the interactive TUI", "error");
				return;
			}
			if (personaEnabled()) {
				try {
					unlinkSync(FLAG_PATH);
				} catch {}
				removeChrome(ctx);
				ctx.ui.notify(
					"Harimo winked out ✧  Restart pi to restore the void splash + header.",
					"info",
				);
			} else {
				try {
					writeFileSync(FLAG_PATH, "on\n");
				} catch {}
				applyFamiliarWidget(ctx);
				settle("idle");
				ctx.ui.notify(
					"Harimo is awake ✧  void splash + wordmark header stay; sprite lives in status.",
					"info",
				);
			}
		},
	});
}

// Exported for the preview harness (extensions/_familiar_harness.mts).
export { FamiliarSplash };
