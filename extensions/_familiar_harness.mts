/**
 * Preview + acceptance harness for the "Nova" terminal star-sprite persona.
 *
 * Renders the splash + a full cycle of the state expressions to stdout and
 * exits 0. Runnable with pi's own strip-types path:
 *
 *   node --experimental-strip-types extensions/_familiar_harness.mts [width] [rows]
 *
 * Assert-based checks (the acceptance path a verifier runs): every rendered
 * frame is non-empty, the four moods produce distinct faces, and no line
 * exceeds the 80-column width budget.
 */

import assert from "node:assert";
import { visibleWidth } from "@earendil-works/pi-tui";
import { FamiliarSplash, faceFor, headerSegments, type Mood, widgetLinePlain } from "./familiar.ts";

const WIDTH = Number(process.argv[2] ?? 80);
const ROWS = Number(process.argv[3] ?? 24);
const BUDGET = 80;
(process.stdout as { rows?: number }).rows = ROWS;

// Identity theme: strips color out so widths are the visible glyph widths.
const theme = { fg: (_name: string, text: string) => text };
const tui = { requestRender() {} };
const moods: Mood[] = ["idle", "thinking", "tool", "error"];

const overBudget: string[] = [];
const checkWidth = (lines: string[]) => {
	for (const l of lines) if (visibleWidth(l) > BUDGET) overBudget.push(l);
};

// ---- 1) splash: advance through the mood demo, capture a frame per mood ----
const splash = new FamiliarSplash(tui, theme, () => {});
const splashFrames: string[][] = [];
for (let i = 0; i < moods.length; i++) {
	splash.tick = i * 14 + 5; // land mid-mood in the demo cycle
	const frame = splash.render(WIDTH);
	splashFrames.push(frame);
	checkWidth(frame);
}
splash.dispose();

console.log(`=== SPLASH (width=${WIDTH}, rows=${ROWS}) ===`);
for (const l of splashFrames[0]!) console.log(l);

// ---- 2) state expression cycle: art + widget + header per mood ----
console.log("\n=== STATE EXPRESSIONS ===");
const widgetLines: string[] = [];
const artBlocks: string[] = [];
for (const m of moods) {
	const f = faceFor(m, { tick: 1 });
	const widget = widgetLinePlain(m, 1);
	const header = headerSegments(m, 1).map((line) => line.map((s) => s.t).join(""));
	widgetLines.push(widget);
	artBlocks.push(f.art.join("\n"));
	checkWidth(f.art);
	checkWidth([widget]);
	checkWidth(header);

	console.log(`\n[${m}]  ${f.color}`);
	for (const l of f.art) console.log("   " + l);
	console.log("   widget: " + widget);
	console.log("   header: " + header.join("  |  "));
}

// ---- 3) asserts ----
for (const frame of splashFrames) {
	assert.ok(frame.length > 0, "splash frame has rows");
	assert.ok(frame.some((l) => l.trim().length > 0), "splash frame is non-empty");
}
assert.strictEqual(new Set(widgetLines).size, moods.length, "each mood has a distinct status line");
assert.strictEqual(new Set(artBlocks).size, moods.length, "each mood has a distinct sprite face");
assert.ok(
	new Set(splashFrames.map((f) => f.join("\n"))).size > 1,
	"splash animates across moods",
);
assert.strictEqual(overBudget.length, 0, `all lines within ${BUDGET} cols (offenders: ${overBudget.length})`);

console.log("\nALL CHECKS PASSED");
process.exit(0);
