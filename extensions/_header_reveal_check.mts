// Self-check for the void-header draw-on ignition reveal (void-blackhole.ts
// setVoidHeader). Replicates the reveal-gate math and asserts the invariants:
// during the first sweep, columns ahead of the front are held dark; behind it
// they show; once the first sweep completes the mark is whole with no blanking.
// Run: node --experimental-strip-types extensions/_header_reveal_check.mts
import assert from "node:assert";

const LINE = "harimo"; // stand-in glyph row; y=0
const markW = LINE.length;
const range = markW + 1 + 40; // WORDMARK.length is 1 here
const bandWidth = 3;

// Which visible glyphs are shown (true) vs blanked (false) for a given phase.
function shown(phase: number, y = 0): boolean[] {
	const pos = phase % range;
	const revealing = phase < range;
	return [...LINE].map((_, x) => {
		const d = x + y;
		const want = revealing && d > pos ? "off" : Math.abs(d - pos) < bandWidth ? "glint" : "base";
		return want !== "off";
	});
}

// phase 0: only column 0 (d=0, not > pos=0) may show; everything ahead is dark.
const p0 = shown(0);
assert.ok(p0.slice(1).every((v) => v === false), "phase 0: cols ahead of front must be blank");

// Reveal is monotonic: a column shown at phase p stays shown at p+1 during the sweep.
for (let p = 0; p < range - 1; p++) {
	const a = shown(p);
	const b = shown(p + 1);
	for (let x = 0; x < markW; x++) {
		if (a[x]) assert.ok(b[x], `reveal regressed at phase ${p}->${p + 1}, col ${x}`);
	}
}

// Once the first sweep completes, nothing is ever blanked (pure shimmer).
for (let p = range; p < range * 2; p++) {
	assert.ok(shown(p).every((v) => v === true), `post-sweep phase ${p} must show every glyph`);
}

console.log("PASS: reveal blanks ahead of front, is monotonic, and flows into full shimmer");
