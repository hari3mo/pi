// Repro + regression harness for pi-tui scrollback-wipe-on-above-viewport-change.
import assert from "node:assert";

const TUI_PATH =
	"/Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js";
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

console.log("all assertions passed");
