// Repro + regression harness for pi-tui scrollback-wipe-on-above-viewport-change.
import assert from "node:assert";
import { execSync } from "node:child_process";
import { join } from "node:path";

// Portable: PI_TUI_PATH override -> `npm root -g` -> legacy ~/.local layout.
const TUI_PATH =
	process.env.PI_TUI_PATH ??
	join(
		(() => {
			try {
				return execSync("npm root -g", { encoding: "utf8" }).trim();
			} catch {
				return join(process.env.HOME, ".local", "lib", "node_modules");
			}
		})(),
		"@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js",
	);
const { TUI } = await import(TUI_PATH);

function makeTerminal(cols, rows) {
	return {
		columns: cols,
		rows,
		writes: [],
		write(s) {
			this.writes.push(s);
		},
		hideCursor() {},
		showCursor() {},
		clearWrites() {
			this.writes = [];
		},
		output() {
			return this.writes.join("");
		},
	};
}

function setup() {
	const term = makeTerminal(40, 10);
	const tui = new TUI(term);
	let lines = [];
	tui.addChild({ render: () => lines, invalidate() {} });
	const setLines = (l) => {
		lines = l;
	};
	return { term, tui, setLines };
}

const mkLines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`);

// --- Case 1: in-place change above viewport must NOT wipe scrollback ---
{
	const { term, tui, setLines } = setup();
	setLines(mkLines(30));
	tui.doRender(); // initial full render, viewportTop = 20
	term.clearWrites();

	const changed = mkLines(30);
	changed[5] = "CHANGED above viewport";
	setLines(changed);
	tui.doRender();
	const out = term.output();
	console.log(
		"case1 above-viewport in-place change:",
		out.includes("\x1b[3J") ? "WIPES SCROLLBACK (3J)" : "ok (no 3J)",
		"| fullRedraws:",
		tui.fullRedraws,
	);
	assert(!out.includes("\x1b[3J"), "case1: 3J emitted");
	assert(!out.includes("\x1b[2J"), "case1: 2J emitted");
	// off-screen row must not be repainted
	assert(!out.includes("CHANGED above viewport"), "case1: repainted off-screen row");
}

// --- Case 2: change above AND below viewport -> repaint only visible part, no 3J ---
{
	const { term, tui, setLines } = setup();
	setLines(mkLines(30));
	tui.doRender();
	term.clearWrites();

	const changed = mkLines(30);
	changed[5] = "CHANGED above viewport";
	changed[25] = "CHANGED inside viewport";
	setLines(changed);
	tui.doRender();
	const out = term.output();
	console.log(
		"case2 mixed change:",
		out.includes("\x1b[3J") ? "WIPES SCROLLBACK (3J)" : "ok (no 3J)",
		"| visible repaint:",
		out.includes("CHANGED inside viewport"),
	);
	assert(!out.includes("\x1b[3J"), "case2: 3J emitted");
	assert(out.includes("CHANGED inside viewport"), "case2: visible change not painted");
	assert(!out.includes("CHANGED above viewport"), "case2: repainted off-screen row");
}

// --- Case 3: subsequent diff stays consistent after skipped off-screen change ---
{
	const { term, tui, setLines } = setup();
	setLines(mkLines(30));
	tui.doRender();

	const changed = mkLines(30);
	changed[5] = "CHANGED above viewport";
	setLines(changed);
	tui.doRender();

	term.clearWrites();
	const next = [...changed, "appended tail line"];
	setLines(next);
	tui.doRender();
	const out = term.output();
	console.log(
		"case3 append after skip:",
		out.includes("appended tail line") && !out.includes("\x1b[3J") ? "ok" : "BROKEN",
	);
	assert(out.includes("appended tail line"), "case3: append not painted");
	assert(!out.includes("\x1b[3J"), "case3: 3J emitted");
}

// --- Case 4: shrink above viewport (line count above viewport changes) still safe ---
// A shrink that removes lines above the viewport shifts physical alignment; a full
// redraw is the only correct answer there. Just assert it doesn't corrupt (no throw).
{
	const { term, tui, setLines } = setup();
	setLines(mkLines(30));
	tui.doRender();
	term.clearWrites();
	setLines(mkLines(15)); // shrink crossing viewport top (20)
	tui.doRender();
	console.log("case4 drastic shrink: rendered without throw, fullRedraws:", tui.fullRedraws);
}

// --- Case 5: width change still does a real full redraw (rewrap) ---
{
	const { term, tui, setLines } = setup();
	setLines(mkLines(30));
	tui.doRender();
	term.clearWrites();
	term.columns = 50;
	tui.doRender();
	const out = term.output();
	console.log("case5 width change:", out.includes("\x1b[3J") ? "full clear (expected)" : "NO CLEAR (bug)");
	assert(out.includes("\x1b[3J"), "case5: width change must still fully clear");
}

// --- Case 6: full-screen component collapse must repaint the new top content ---
// Models the void-blackhole splash -> main screen transition: during the splash the
// buffer is tall (art fills the terminal, viewportTop > 0); on close the buffer
// shrinks and a header wordmark appears at the TOP. The scrollback-fix clamp used
// to skip those above-old-viewport rows, clipping the wordmark. The reflow branch
// must paint them in place, with no 3J/2J (scrollback preserved).
{
	const { term, tui, setLines } = setup();
	// splash: 2 spacer rows + 6 "context" rows + 20 art rows + footer = 29 lines, height 10 -> viewportTop 19
	const splash = ["", "", ...mkLines(6).map((l) => `ctx ${l}`), ...mkLines(20).map((l) => `art ${l}`), "footer"];
	setLines(splash);
	tui.doRender();
	term.clearWrites();

	// splash closes: short main screen with wordmark header at top
	const main = ["", "WORDMARK ROW A", "WORDMARK ROW B", "WORDMARK ROW C", ...mkLines(6).map((l) => `ctx ${l}`), "editor", "footer"];
	setLines(main);
	tui.doRender();
	const out = term.output();
	console.log(
		"case6 splash collapse:",
		out.includes("WORDMARK ROW A") && !out.includes("\x1b[3J") ? "ok (wordmark painted, no 3J)" : "BROKEN",
	);
	assert(out.includes("WORDMARK ROW A"), "case6: top wordmark row clipped");
	assert(out.includes("WORDMARK ROW C"), "case6: wordmark row clipped");
	assert(!out.includes("\x1b[3J"), "case6: 3J emitted");
	assert(!out.includes("\x1b[2J"), "case6: 2J emitted");

	// shimmer tick after collapse: an on-screen header row mutates, must repaint
	// in place (row 3 >= new viewportTop 2); row 1 is legitimately in scrollback
	// at this tiny height and stays skipped.
	term.clearWrites();
	const shimmer = [...main];
	shimmer[3] = "WORDMARK ROW C GLINT";
	setLines(shimmer);
	tui.doRender();
	const out2 = term.output();
	assert(out2.includes("WORDMARK ROW C GLINT"), "case6: shimmer after collapse not painted");
	assert(!out2.includes("\x1b[3J"), "case6: shimmer caused 3J");

	// append after collapse stays aligned
	term.clearWrites();
	setLines([...shimmer, "appended after collapse"]);
	tui.doRender();
	assert(term.output().includes("appended after collapse"), "case6: append after collapse not painted");
	console.log("case6 shimmer + append after collapse: ok");
}

// --- Case 7: mid-session full-screen collapse (long transcript) bottom-pins correctly ---
{
	const { term, tui, setLines } = setup();
	const transcript = mkLines(25);
	setLines([...transcript, ...mkLines(20).map((l) => `art ${l}`)]); // /void open: 45 lines, viewportTop 35
	tui.doRender();
	term.clearWrites();

	const closed = [...transcript, "editor", "footer"]; // 27 lines, new viewportTop 17
	setLines(closed);
	tui.doRender();
	const out = term.output();
	// bottom-pinned window = rows 17..26 -> "line 17" must be painted, no 3J
	assert(out.includes("line 17"), "case7: bottom-pinned window top not painted");
	assert(out.includes("footer"), "case7: footer not painted");
	assert(!out.includes("\x1b[3J"), "case7: 3J emitted");
	console.log("case7 mid-session collapse: ok (bottom-pinned, no 3J)");
}

// --- Case 8: real geometry — main screen FITS the terminal after collapse ---
// height 40, splash 60 lines (viewportTop 20) -> main 25 lines (viewportTop 0).
// Whole wordmark must paint, leftover screen rows must be cleared, shimmer at
// row 2 (now on-screen) must repaint in place.
{
	const term = makeTerminal(80, 40);
	const tui = new TUI(term);
	let lines = [];
	tui.addChild({ render: () => lines, invalidate() {} });

	lines = ["", "", ...mkLines(8).map((l) => `ctx ${l}`), ...mkLines(48).map((l) => `art ${l}`), "footer"]; // 59 lines
	tui.doRender();
	term.clearWrites();

	lines = ["", "", "WORDMARK ROW A", "WORDMARK ROW B", "WORDMARK ROW C", "subtitle", ...mkLines(8).map((l) => `ctx ${l}`), "editor", "footer"]; // 16 lines < 40
	tui.doRender();
	const out = term.output();
	assert(out.includes("WORDMARK ROW A"), "case8: wordmark top clipped");
	assert(out.includes("WORDMARK ROW C"), "case8: wordmark bottom clipped");
	assert(!out.includes("\x1b[3J"), "case8: 3J emitted");
	assert(!out.includes("\x1b[2J"), "case8: 2J emitted");

	term.clearWrites();
	const shimmer = [...lines];
	shimmer[2] = "WORDMARK ROW A GLINT";
	lines = shimmer;
	tui.doRender();
	assert(term.output().includes("WORDMARK ROW A GLINT"), "case8: shimmer not painted on-screen");
	assert(!term.output().includes("\x1b[3J"), "case8: shimmer caused 3J");
	console.log("case8 fits-on-screen collapse + shimmer: ok");
}

console.log("all assertions passed");
