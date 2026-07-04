#!/usr/bin/env node
/**
 * Runnable check for the oracle-first detector + escalation ladder
 * (extensions/oracle-first.ts). Imports the REAL exported pure functions with
 * pi's own jiti loader (oracle-first.ts has no bare value imports, so no
 * node_modules provisioning is needed).
 *
 * Asserts:
 *   - read/bash targeting README.md/docs/examples under the pi package → flagged
 *   - oracle-vault reads, ordinary project files, pi source, non-read bash → pass
 *   - the oracle-consult signal (vault read / config.oracle / wiki-query)
 *   - the escalation ladder: first flagged → nudge, second+ → block, and an
 *     IDENTICAL retry of a blocked read → bypass.
 *
 * Run: node scripts/check-oracle-first.mjs
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { AGENT_DIR, loadJiti } from "./lib/jiti-loader.mjs";

const { jiti } = await loadJiti();
const { classifyPiDocRead, isOracleConsult, decideAction, buildNudge, buildBlock } = await jiti.import(
	join(AGENT_DIR, "extensions", "oracle-first.ts"),
);
const { CROSS_STORE_GUIDANCE } = await jiti.import(join(AGENT_DIR, "extensions", "lib", "knowledge-router.ts"));

const PI = "/Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent";
const CWD = "/Users/harissaif/.pi/agent";

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

// --- detector: [toolName, input, expectFlagged, note] ---
const cases = [
	["read", { path: `${PI}/README.md` }, true, "read README.md → flag"],
	["read", { path: `${PI}/docs/extensions.md` }, true, "read docs/ → flag"],
	["read", { path: `${PI}/examples/foo/index.ts` }, true, "read examples/ → flag"],
	["read", { file_path: `${PI}/docs/tui.md` }, true, "read file_path variant → flag"],
	["bash", { command: `sed -n '1,50p' ${PI}/docs/skills.md` }, true, "sed pi docs → flag"],
	["bash", { command: `head -60 ${PI}/README.md` }, true, "head pi README → flag"],
	["bash", { command: `cat ${PI}/examples/extensions/x.ts` }, true, "cat pi examples → flag"],
	// misses (false positive here is the worst failure) --------------------
	["read", { path: `${CWD}/AGENTS.md` }, false, "project file passes"],
	["read", { path: `${CWD}/oracle/SCHEMA.md` }, false, "oracle vault read passes (it IS a consult)"],
	["read", { path: `${PI}/dist/index.js` }, false, "pi compiled source (not a doc root) passes"],
	["read", { path: `${PI}/package.json` }, false, "pi package.json (not a doc root) passes"],
	["bash", { command: `grep -rn foo ${PI}/docs` }, false, "grep (not a read util) passes"],
	["bash", { command: `ls ${PI}/docs` }, false, "ls (not a read util) passes"],
	["bash", { command: `cat ${CWD}/extensions/oracle-first.ts` }, false, "cat project file passes"],
	["read", {}, false, "empty input passes"],
];
for (const [tool, input, want, note] of cases) {
	const got = classifyPiDocRead(tool, input, CWD).flagged;
	check(`detector ${want ? "flag " : "pass "} — ${note}`, got === want);
}

// --- oracle-consult signal ---
check("consult: read under oracle vault", isOracleConsult("read", { path: `${CWD}/oracle/concepts/x.md` }, CWD));
check("consult: bash naming config.oracle", isOracleConsult("bash", { command: "cat ~/.obsidian-wiki/config.oracle" }, CWD));
check("consult: bash naming wiki-query", isOracleConsult("bash", { command: "run wiki-query oracle" }, CWD));
check("consult: ordinary read is NOT a consult", isOracleConsult("read", { path: `${CWD}/AGENTS.md` }, CWD) === false);

// --- escalation ladder ---
const state = { count: 0, blocked: new Set() };
const A = classifyPiDocRead("read", { path: `${PI}/README.md` }, CWD).key;
const B = classifyPiDocRead("read", { path: `${PI}/docs/tui.md` }, CWD).key;
check("first flagged → nudge", decideAction(state, A, true) === "nudge");
check("second flagged (new) → block", decideAction(state, B, true) === "block");
check("identical retry of blocked B → bypass", decideAction(state, B, true) === "bypass");
check("identical retry again → bypass", decideAction(state, B, true) === "bypass");
check("non-flagged → allow", decideAction(state, "x", false) === "allow");
check("third distinct flagged → block", decideAction(state, "read:other", true) === "block");

// --- redirect messages name BOTH stores (deliverable 2) ---
const nudge = buildNudge(`${PI}/README.md`);
const block = buildBlock(`${PI}/docs/tui.md`);
check("msg: nudge leads with wiki-query + names the target", nudge.includes("wiki-query") && nudge.includes(`${PI}/README.md`));
check("msg: every message carries cross-store guidance", nudge.includes(CROSS_STORE_GUIDANCE) && block.includes(CROSS_STORE_GUIDANCE));
check("msg: every message names both stores (oracle + graph)", nudge.includes("oracle") && nudge.includes("graph") && block.includes("graph"));
check("msg: block keeps IDENTICAL-retry escape", /IDENTICAL read to proceed/.test(block));

assert.equal(failed, 0, `${failed} oracle-first check(s) failed`);
console.log(`\noracle-first: ${cases.length + 10 + 4} assertions passed`);
