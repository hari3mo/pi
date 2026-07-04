#!/usr/bin/env node
/**
 * Runnable check for the graph-first detector + escalation ladder
 * (extensions/graph-first.ts). Imports the REAL exported pure functions with
 * pi's own jiti loader (graph-first.ts has no bare value imports beyond the
 * local lib, so no node_modules provisioning is needed).
 *
 * Asserts:
 *   - structure-shaped grep/rg → flagged (keyword-anchored + bare-symbol+repo-wide)
 *   - content greps (log strings, TODOs, non-symbol words) → pass untouched
 *   - the escalation ladder: first flagged → nudge, second+ → block, and an
 *     IDENTICAL retry of a blocked command → bypass.
 *
 * Run: node scripts/check-graph-first.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = join(here, "..");
const PKG = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
const jiti = createJiti(join(AGENT_DIR, "extensions", "_check_.js"), { interopDefault: false });
const { classifyStructureGrep, decideAction } = await jiti.import(join(AGENT_DIR, "extensions", "graph-first.ts"));

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

// --- detector: [command, expectFlagged] ---
const cases = [
	['grep -rn "def my_func" .', true, "keyword: def"],
	['grep -rn "class MyClass" src/', true, "keyword: class"],
	['rg "function handleClick"', true, "keyword: function"],
	['rg "interface Props"', true, "keyword: interface"],
	['rg "^const MAX_SIZE"', true, "keyword after ^ anchor"],
	["grep -rn myHelper .", true, "bare symbol + -r cluster"],
	['grep -R --include=*.ts fetchData .', true, "bare symbol + --include"],
	['grep -rn "TODO" src/', false, "all-caps content marker passes"],
	['grep -n "connection refused" app.log', false, "log string passes"],
	['rg "user typed a value"', false, "keyword not first-anchored passes"],
	['grep "the type is wrong" notes.txt', false, "keyword mid-string passes"],
	['rg "ERROR"', false, "log level passes"],
	["echo hello", false, "not a grep passes"],
	["cat file | grep foo", false, "bare id without repo-wide → miss (conservative)"],
];
for (const [cmd, want, note] of cases) {
	const got = classifyStructureGrep(cmd).flagged;
	check(`detector ${want ? "flag " : "pass "} — ${note}  <- ${JSON.stringify(cmd)}`, got === want);
}

// identifier extraction sanity
check("identifier: def my_func → my_func", classifyStructureGrep('grep -rn "def my_func" .').identifier === "my_func");
check("identifier: bare fetchData", classifyStructureGrep("grep -rn fetchData .").identifier === "fetchData");

// --- escalation ladder ---
const state = { count: 0, blocked: new Set() };
const A = 'grep -rn "def a" .';
const B = 'grep -rn "class B" .';
check("first flagged → nudge", decideAction(state, A, true) === "nudge");
check("second flagged (new) → block", decideAction(state, B, true) === "block");
check("identical retry of blocked B → bypass", decideAction(state, B, true) === "bypass");
check("identical retry again → bypass", decideAction(state, B, true) === "bypass");
check("non-flagged command → allow", decideAction(state, "echo hi", false) === "allow");
// A third distinct flagged command still blocks (post-nudge everything blocks)
check("third distinct flagged → block", decideAction(state, 'rg "interface C"', true) === "block");

assert.equal(failed, 0, `${failed} graph-first check(s) failed`);
console.log(`\ngraph-first: ${cases.length + 8} assertions passed`);
