/**
 * familiar — "Ember", a terminal cat daemon for the pi TUI.
 *
 * A small, hearth-warm ASCII cat that lives in your prompt and reacts to what
 * pi is doing. Deliberately the opposite of the cosmic void-blackhole identity:
 * where the black hole is cold, vast and indifferent, Ember is small, warm and
 * present — a lap cat that is also a Unix daemon quietly running in the
 * background (that's the pun). Cats are the most iconic ASCII subject, so the
 * persona reads crisply in glyphs on any terminal.
 *
 * Chrome, all opt-in:
 *   - splash   : an animated warm welcome card (cat blinks, embers flicker,
 *                the face cycles through its moods to show off state reactions);
 *                any key wakes the session. Shown once on startup.
 *   - header   : a compact banner — the cat + the "ember" wordmark + the
 *                current mood, re-rendered only on state change (no timer).
 *   - widget   : a persistent status line below the editor — the "living"
 *                familiar, blinking and reacting; one modest timer drives it.
 *
 * State reactions (blinks / poses / expression changes, CPU trivial):
 *   idle      (=o.o=)  purring     — resting; slow blink
 *   thinking  (=-.o=)  thinking…   — eyes scanning while the agent streams
 *   tool      (=^.^=)/ on it       — batting a paw while a tool runs
 *   error     (=x.x=)! yowl!       — puffed up after a tool error (auto-decays)
 *
 * Coexistence: void-blackhole and custom-header stay the default and are
 * untouched except for a one-line `if (personaEnabled()) return;` guard that
 * lets them bow out cleanly when Ember is awake — a shared flag file is the
 * only race-free way to arbitrate who owns the startup splash + header. With
 * the persona DISABLED (the default: no flag file) this module does nothing
 * and the void identity behaves exactly as before.
 *
 * Toggle (a real registered command, per the pi 0.80.3 constraint that
 * extensions cannot synthesize "/cmd" text):  /familiar
 * Header + status apply live; the splash loads/unloads on the next startup.
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
// Presence of this file = Ember is awake. Resolved next to the agent dir so the
// guards in void-blackhole/custom-header (which import personaEnabled) read the
// exact same path regardless of who imports this module.
const FLAG_PATH: string = (() => {
	try {
		return fileURLToPath(new URL("../.familiar-enabled", import.meta.url));
	} catch {
		return join(process.env.HOME ?? ".", ".pi/agent/.familiar-enabled");
	}
})();

/** True when the Ember persona is enabled. Fail-open: any error → disabled. */
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
	eyes: string; //  3 chars
	mouth: string; // 1 char
	paw: string; //   "" | 1 char
	word: string;
	/** Semantic theme color name for this mood. */
	color: string;
	/** Front-facing cat, 3 lines, ASCII-only (safe width on any terminal). */
	art: string[];
	/** Compact kaomoji for the one-line status widget. */
	kao: string;
}

/**
 * Pure mood → face. `tick` drives the cheap in-mood animation (eye scan,
 * thinking dots, paw bat); `blink` briefly shuts the eyes. Deterministic, so
 * the harness can assert frames differ across moods and fit the width budget.
 */
export function faceFor(mood: Mood, opts?: { tick?: number; blink?: boolean }): Face {
	const t = opts?.tick ?? 0;
	const blink = opts?.blink ?? false;
	let eyes: string;
	let mouth: string;
	let paw = "";
	let word: string;
	let color: string;
	switch (mood) {
		case "thinking":
			eyes = blink ? "-.-" : ["o.o", "-.o", "o.-"][t % 3]!;
			mouth = "o";
			word = "thinking" + ".".repeat(t % 4);
			color = "accent";
			break;
		case "tool":
			eyes = blink ? "-.-" : "^.^";
			mouth = "w";
			paw = t % 2 ? "/" : "\\";
			word = "on it";
			color = "success";
			break;
		case "error":
			eyes = "x.x"; // too rattled to blink
			mouth = "O";
			paw = "!";
			word = "yowl!";
			color = "error";
			break;
		default: // idle
			eyes = blink ? "-.-" : "o.o";
			mouth = "w";
			word = "purring";
			color = "muted";
			break;
	}
	const art = [
		" /\\_/\\",
		`( ${eyes} )`,
		` >${mouth}<${paw ? ` ${paw}` : ""}`,
	];
	const kao = `(=${eyes}=)${paw}`;
	return { mood, eyes, mouth, paw, word, color, art, kao };
}

/** Plain (uncolored) one-line status text. Exported for the harness. */
export function widgetLinePlain(mood: Mood, tick: number, blink = false): string {
	const f = faceFor(mood, { tick, blink });
	return `ember ${f.kao}  ${f.word}`;
}

type Seg = { t: string; c: string };

/** Header as 3 lines of colored segments — cat + wordmark + mood. */
export function headerSegments(mood: Mood, tick: number): Seg[][] {
	const f = faceFor(mood, { tick });
	const pad = (s: string) => s + " ".repeat(Math.max(0, 8 - s.length));
	return [
		[{ t: pad(f.art[0]!), c: f.color }, { t: "  ", c: "dim" }, { t: "ember", c: "accent" }],
		[
			{ t: pad(f.art[1]!), c: f.color },
			{ t: "  ", c: "dim" },
			{ t: "your terminal cat daemon", c: "dim" },
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

		// Flickering embers drifting above the ears.
		const sparks = [" .  :   '", "  '  .  : ", " :   '  . ", "  .  '  : "];
		const emberLine = fg("warning", sparks[this.tick % sparks.length]!);

		// Legend with the current mood lit in its own color.
		const legend =
			fg("dim", "· ") +
			MOODS.map((m) => (m === demoMood ? fg(faceFor(m).color, m) : fg("dim", m))).join(
				fg("dim", " · "),
			) +
			fg("dim", " ·");

		const content: string[] = [
			emberLine,
			fg(f.color, f.art[0]!),
			fg(f.color, f.art[1]!),
			fg(f.color, f.art[2]!),
			"",
			fg("accent", "e m b e r"),
			"",
			fg("dim", "your terminal cat daemon"),
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
// Module-scoped so the event handlers, the header and the widget all share one
// mood. Only ever mutated while the chrome is mounted (chromeOn).
let chromeOn = false;
let mood: Mood = "idle";
let tick = 0;
let headerRender: (() => void) | null = null;
let widgetRender: (() => void) | null = null;
let beat: ReturnType<typeof setInterval> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function startBeat(): void {
	if (beat) return;
	// ~3 fps: enough for a blink + thinking dots + paw bat, CPU-trivial.
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

/** Change mood and repaint header + widget. */
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

function applyChrome(ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") return;
	chromeOn = true;

	ctx.ui.setHeader((tui: TUIRef, theme: Theme) => {
		headerRender = () => tui.requestRender();
		const fg = fgOf(theme);
		return {
			render(width: number): string[] {
				try {
					const rows = headerSegments(mood, tick).map((line) =>
						truncateToWidth(line.map((s) => fg(s.c, s.t)).join(""), width),
					);
					return ["", ...rows, ""];
				} catch {
					return [""];
				}
			},
			invalidate() {},
			dispose() {
				headerRender = null;
			},
		};
	});

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
						const line = fg(f.color, `ember ${f.kao}`) + fg("dim", `  ${f.word}`);
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
	ctx.ui.setHeader(undefined); // built-in header returns; custom-header on restart
}

// ------------------------------------------------------------- extension -----
export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		if (!personaEnabled() || ctx.mode !== "tui") return;
		if (event.reason !== "startup") {
			applyChrome(ctx);
			return;
		}
		// While the splash owns the screen the header must take zero rows (same
		// reasoning as void-blackhole). The real chrome installs once it closes.
		ctx.ui.setHeader(() => ({ render: (): string[] => [], invalidate() {} }));
		void ctx.ui
			.custom((tui, theme, _kb, done) => new FamiliarSplash(tui, theme, () => done(undefined)))
			.then(() => applyChrome(ctx));
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
			"Toggle Ember, the terminal cat-daemon persona (splash + header + status line)",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Ember lives in the interactive TUI", "error");
				return;
			}
			if (personaEnabled()) {
				try {
					unlinkSync(FLAG_PATH);
				} catch {}
				removeChrome(ctx);
				ctx.ui.notify(
					"Ember curled up 😴  Restart pi to restore the void splash + header.",
					"info",
				);
			} else {
				try {
					writeFileSync(FLAG_PATH, "on\n");
				} catch {}
				applyChrome(ctx);
				settle("idle");
				ctx.ui.notify(
					"Ember is awake ✧  header + status applied. Restart pi to meet the splash.",
					"info",
				);
			}
		},
	});
}

// Exported for the preview harness (extensions/_familiar_harness.mts).
export { FamiliarSplash };
