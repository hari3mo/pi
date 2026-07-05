#!/usr/bin/env node
/**
 * Runnable check for knowledge-compound's flush logic (extensions/knowledge-compound.ts).
 * Imports the REAL exported pure functions with pi's own jiti loader and feeds
 * them a fixture of "recorded graph queries", asserting:
 *   - isSubstantive filter: errors, short answers, and non-query actions are dropped
 *   - addCandidate: dedupe (normalized question) + cap at MAX_ITEMS
 *   - buildSaveResultArgs: exact argv for `graphify save-result`
 *
 * Smallest thing that fails if the flush logic breaks. Run:
 *   node scripts/check-knowledge-compound.mjs
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { AGENT_DIR, loadJiti, provisionNodeModules } from "./lib/jiti-loader.mjs";

// The extension imports @earendil-works/* — provision bare-specifier resolution.
provisionNodeModules();
const { jiti } = await loadJiti();
const { isSubstantive, addCandidate, buildSaveResultArgs, normalizeQuestion } = await jiti.import(
	join(AGENT_DIR, "extensions", "knowledge-compound.ts"),
);

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

const LONG = "x".repeat(250); // above the 200-char durability floor

// --- isSubstantive filter ---------------------------------------------------
check("substantive: long query answer → true", isSubstantive("query", false, LONG) === true);
check("substantive: explain also captured → true", isSubstantive("explain", false, LONG) === true);
check("filter: errored answer → false", isSubstantive("query", true, LONG) === false);
check("filter: short answer → false", isSubstantive("query", false, "too short") === false);
check("filter: status action → false", isSubstantive("status", false, LONG) === false);
check("filter: path action → false", isSubstantive("path", false, LONG) === false);
check("filter: 'Error:' prefix → false", isSubstantive("query", false, `Error: ${LONG}`) === false);

// --- addCandidate: filter + dedupe + cap (fed a fixture of recorded queries) -
const recorded = [
	{ action: "query", question: "Why does the Config Index bridge six communities?", answer: `A. ${LONG}`, isError: false },
	{ action: "query", question: "why   does the CONFIG index bridge six communities?", answer: `dup ${LONG}`, isError: false }, // dedupe
	{ action: "status", question: "", answer: LONG, isError: false }, // filtered (action)
	{ action: "query", question: "broken", answer: LONG, isError: true }, // filtered (error)
	{ action: "explain", question: "ExtensionContext", answer: `B. ${LONG}`, isError: false },
	{ action: "query", question: "third distinct question here", answer: `C. ${LONG}`, isError: false },
	{ action: "query", question: "fourth question over the cap", answer: `D. ${LONG}`, isError: false }, // over cap
];
const buffer = [];
for (const r of recorded) addCandidate(buffer, r, 3);
check("addCandidate: capped at 3", buffer.length === 3);
check("addCandidate: deduped reworded repeat", buffer.filter((b) => b.question.toLowerCase().includes("config index")).length === 1);
check("addCandidate: kept the explain item", buffer.some((b) => b.action === "explain" && b.question === "ExtensionContext"));
check("addCandidate: dropped over-cap 4th distinct", !buffer.some((b) => b.question === "fourth question over the cap"));
check("normalizeQuestion: case/whitespace collapse", normalizeQuestion("Why   DOES x?") === "why does x?");

// --- buildSaveResultArgs: exact command line --------------------------------
const item = buffer[0];
const args = buildSaveResultArgs(item);
check(
	"saveResultArgs: exact argv",
	JSON.stringify(args) ===
		JSON.stringify(["save-result", "--question", item.question, "--answer", item.answer, "--type", "query", "--outcome", "useful"]),
);

assert.equal(failed, 0, `${failed} knowledge-compound check(s) failed`);
console.log("\nknowledge-compound: all assertions passed");
