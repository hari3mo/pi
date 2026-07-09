#!/usr/bin/env node
/**
 * Runnable check for the wiki-first detector + escalation ladder
 * (extensions/wiki-first.ts). Imports the REAL exported pure functions with
 * pi's own jiti loader (wiki-first.ts has no bare value imports, so no
 * node_modules provisioning is needed).
 *
 * Asserts:
 *   - read/bash targeting README.md/docs/examples under the pi package → flagged
 *   - wiki-vault reads, ordinary project files, pi source, non-read bash → pass
 *   - the wiki-consult signal (vault read / config.wiki / wiki-query)
 *   - the escalation ladder: first flagged → nudge, second+ → block, and an
 *     IDENTICAL retry of a blocked read → bypass.
 *
 * Run: node scripts/check-wiki-first.mjs
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { AGENT_DIR, loadJiti } from "./lib/jiti-loader.mjs";

const { jiti } = await loadJiti();
const { classifyPiDocRead, isWikiConsult, decideAction, buildNudge, buildBlock } = await jiti.import(
	join(AGENT_DIR, "extensions", "wiki-first.ts"),
);
const { CROSS_STORE_GUIDANCE } = await jiti.import(join(AGENT_DIR, "extensions", "lib", "knowledge-router.ts"));

const PI = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");
const CWD = AGENT_DIR;

let failed = 0;
let passed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	else passed++;
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
	["read", { path: `${CWD}/wiki/SCHEMA.md` }, false, "wiki vault read passes (it IS a consult)"],
	["read", { path: `${PI}/dist/index.js` }, false, "pi compiled source (not a doc root) passes"],
	["read", { path: `${PI}/package.json` }, false, "pi package.json (not a doc root) passes"],
	["bash", { command: `grep -rn foo ${PI}/docs` }, false, "grep (not a read util) passes"],
	["bash", { command: `ls ${PI}/docs` }, false, "ls (not a read util) passes"],
	["bash", { command: `cat ${CWD}/extensions/wiki-first.ts` }, false, "cat project file passes"],
	["read", {}, false, "empty input passes"],
];
for (const [tool, input, want, note] of cases) {
	const got = classifyPiDocRead(tool, input, CWD).flagged;
	check(`detector ${want ? "flag " : "pass "} — ${note}`, got === want);
}

// --- wiki-consult signal ---
check("consult: read under wiki vault", isWikiConsult("read", { path: `${CWD}/wiki/concepts/x.md` }, CWD));
check("consult: bash naming config.wiki", isWikiConsult("bash", { command: "cat ~/.obsidian-wiki/config.wiki" }, CWD));
check("consult: bash naming wiki-query", isWikiConsult("bash", { command: "run wiki-query wiki" }, CWD));
check("consult: ordinary read is NOT a consult", isWikiConsult("read", { path: `${CWD}/AGENTS.md` }, CWD) === false);

// --- domain-vault consult (v2) ---
const PRISM_VAULT = "/tmp/prism-oracle/prism-wiki";
check("consult: read under domain vault", isWikiConsult("read", { path: `${PRISM_VAULT}/concepts/x.md` }, CWD, [PRISM_VAULT]));
check("consult: bash naming domain vault", isWikiConsult("bash", { command: `rg foo ${PRISM_VAULT}` }, CWD, [PRISM_VAULT]));
check("consult: domain vault NOT consulted without extraVaults", isWikiConsult("read", { path: `${PRISM_VAULT}/concepts/x.md` }, CWD) === false);
check("consult: empty extraVaults entries ignored", isWikiConsult("read", { path: `${CWD}/AGENTS.md` }, CWD, [""]) === false);

// --- domain-aware messages (v2) ---
check("msg: nudge names domain profile when present", buildNudge("x", "/tmp/config.prism").includes("/tmp/config.prism"));
check("msg: block names domain profile when present", buildBlock("x", "/tmp/config.prism").includes("/tmp/config.prism"));
check("msg: nudge unchanged without domain", !buildNudge("x").includes("domain wiki"));

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
check("msg: every message names both stores (wiki + graph)", nudge.includes("wiki") && nudge.includes("graph") && block.includes("graph"));
check("msg: block keeps IDENTICAL-retry escape", /IDENTICAL read to proceed/.test(block));

assert.equal(failed, 0, `${failed} wiki-first check(s) failed`);
console.log(`\nwiki-first: ${passed} assertions passed`);
