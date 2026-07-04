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
import { join } from "node:path";
import { AGENT_DIR, loadJiti } from "./lib/jiti-loader.mjs";

const { jiti } = await loadJiti();
const { classifyStructureGrep, decideAction, buildNudge, buildBlock } = await jiti.import(
	join(AGENT_DIR, "extensions", "graph-first.ts"),
);
const { grepIsOracleQuestion, CROSS_STORE_GUIDANCE, PI_PKG } = await jiti.import(
	join(AGENT_DIR, "extensions", "lib", "knowledge-router.ts"),
);

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
	// --- REVIEWER PROBES: legit content greps that MUST pass (worst failure = blocking these) ---
	['grep -rn "import failed" logs/', false, "probe: keyword+id but logs/ path → content (guard a)"],
	['grep -rn "type of" docs/', false, "probe: keyword+word but docs/ path → content (guard a)"],
	['grep -rn "const" --include=*.md docs/', false, "probe: bare keyword + *.md glob → content (guard a)"],
	['rg --glob "*.md" "from memory" docs/', false, "probe: keyword+id but *.md glob → content (guard a)"],
	['grep -rn "class action lawsuit" docs/', false, "probe: keyword + 3-word prose → content (guard b)"],
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

// --- cross-store routing (deliverable 2) ---
check("cross: grep into pi package path → oracle question", grepIsOracleQuestion(`grep -rn "def foo" ${PI_PKG}/dist`) === true);
check("cross: grep into oracle/ path → oracle question", grepIsOracleQuestion('grep -rn "def x" oracle/') === true);
check("cross: ordinary repo grep → NOT an oracle question", grepIsOracleQuestion("grep -rn myHelper extensions/") === false);
check("cross: bare 'moral/oracle' word not a path → false", grepIsOracleQuestion("grep -rn suboracle/x .") === false);

// --- redirect messages name BOTH stores (deliverable 2) ---
const defNudge = buildNudge("myHelper", "grep -rn myHelper extensions/");
const defBlock = buildBlock("myHelper", "grep -rn myHelper extensions/");
check("msg: default nudge names the graph tool", defNudge.includes("graph") && defNudge.includes("myHelper"));
check("msg: every message carries cross-store guidance", defNudge.includes(CROSS_STORE_GUIDANCE) && defBlock.includes(CROSS_STORE_GUIDANCE));
check("msg: default block keeps IDENTICAL-retry escape", /IDENTICAL command to proceed/.test(defBlock));
const oraNudge = buildNudge("foo", `grep -rn "def foo" ${PI_PKG}/dist`);
const oraBlock = buildBlock("foo", `grep -rn "def foo" ${PI_PKG}/dist`);
check("msg: oracle-targeted nudge leads with wiki-query", oraNudge.includes("wiki-query") && oraNudge.includes("oracle"));
check("msg: oracle-targeted block keeps IDENTICAL-retry escape", /IDENTICAL command to proceed/.test(oraBlock));
check("msg: every message names both stores (graph + wiki-query)", oraNudge.includes("graph") && defNudge.includes("wiki-query"));

assert.equal(failed, 0, `${failed} graph-first check(s) failed`);
console.log(`\ngraph-first: ${cases.length + 8 + 10} assertions passed`);
