/**
 * Shared formatting helpers used across several extensions.
 *
 * NOT an extension itself (lives under extensions/lib/, not extensions/*.ts
 * or extensions/*\/index.ts) so it is not auto-loaded by pi's extension loader.
 */

import { homedir } from "node:os";
import { basename, sep } from "node:path";

/** "1h 2m" / "3m 4s" / "5s" duration formatter. */
export function fmtDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

// pi's native "Working…" braille spinner: same frame set and 80ms cadence as
// pi-tui's Loader (DEFAULT_FRAMES / DEFAULT_INTERVAL_MS). Shared so the subagent
// in-progress rows and the minimal-ui working indicator animate identically.
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const SPINNER_INTERVAL_MS = 80;

/** "1.2k" / "3.40m" token count formatter. */
export function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}m`;
}

/** Collapse an absolute cwd to a short "~/…/leaf" form, or bare basename outside home. */
export function shortenCwd(cwd: string): string {
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
