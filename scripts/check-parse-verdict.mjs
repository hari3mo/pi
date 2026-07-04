#!/usr/bin/env node
/**
 * Runnable check for parseQaVerdict (extensions/subagent/index.ts).
 *
 * index.ts imports pi packages at the top, so it can't be imported standalone
 * to reach the module-private parseQaVerdict. Instead we read the REAL function
 * source out of index.ts (brace-matched), strip its TS type annotations, and
 * eval it — so this exercises the shipped code, not a drifting copy.
 *
 * Regression under test: a reviewer return whose FIRST line is the verdict
 * ("[VERDICT: FAIL: implementation]") but whose findings prose mentions a later
 * "PASS" must parse as FAIL: implementation (top-down line-anchored scan), not
 * as PASS (the old last-token-anywhere bug that also reset reworkFailCount).
 *
 * Run: node scripts/check-parse-verdict.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "extensions", "subagent", "index.ts"), "utf8");

// Brace-match the parseQaVerdict function out of the source.
const start = src.indexOf("function parseQaVerdict(");
assert.notEqual(start, -1, "parseQaVerdict not found in index.ts");
let depth = 0;
let end = -1;
for (let i = src.indexOf("{", start); i < src.length; i++) {
	if (src[i] === "{") depth++;
	else if (src[i] === "}" && --depth === 0) {
		end = i + 1;
		break;
	}
}
assert.notEqual(end, -1, "could not brace-match parseQaVerdict body");

// Strip the type annotations (order: longest first so the union goes before
// the bare alias). If the annotations ever change, this throws loudly — that
// is the intended signal to update the check.
const stripped = src
	.slice(start, end)
	.replaceAll(": QaVerdict | null", "")
	.replaceAll(": QaVerdict", "")
	.replaceAll(": RegExpMatchArray", "")
	.replaceAll(": string", "");
// biome-ignore lint: eval of the shipped function body is the point of the check.
const parseQaVerdict = eval(`(${stripped})`);

const cases = [
	// The live-demo regression: verdict stated FIRST, "PASS" only in prose.
	["[VERDICT: FAIL: implementation]\n\nThe guard is missing. After adding it the tests PASS.", "FAIL: implementation"],
	["[VERDICT: PASS]\n\nLooks correct; nothing to change.", "PASS"],
	["[VERDICT: FAIL: design]\n\nWrong approach entirely.", "FAIL: design"],
	["PASS", "PASS"],
	["FAIL: design\nThe approach is unsound.", "FAIL: design"],
	// No line-anchored verdict → fallback to last-keyword-anywhere (legacy).
	["The FAIL: implementation was fixed and now everything is PASS.", "PASS"],
	["No structured verdict here at all.", null],
];

let failed = 0;
for (const [text, expected] of cases) {
	const got = parseQaVerdict(text);
	const ok = got === expected;
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"}  expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}  <- ${JSON.stringify(text.slice(0, 42))}`);
}

assert.equal(failed, 0, `${failed} parseQaVerdict case(s) failed`);
console.log(`\nparseQaVerdict: ${cases.length} cases passed`);
