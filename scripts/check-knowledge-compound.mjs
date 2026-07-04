#!/usr/bin/env node
/**
 * Runnable check for knowledge-compound's flush logic (extensions/knowledge-compound.ts).
 * Imports the REAL exported pure functions with pi's own jiti loader and feeds
 * them a fixture of "recorded graph queries", asserting:
 *   - isSubstantive filter: errors, short answers, and non-query actions are dropped
 *   - addCandidate: dedupe (normalized question) + cap at MAX_ITEMS
 *   - buildSaveResultArgs: exact argv for `graphify save-result`
 *   - buildStagedNote: valid oracle frontmatter (synthesis/learned, NO pi_version),
 *     compact summary (≤200), draft lifecycle, and the Q/A body
 *
 * Smallest thing that fails if the flush logic breaks. Run:
 *   node scripts/check-knowledge-compound.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = join(here, "..");
const PKG = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

// Provision bare-specifier resolution (the extension imports @earendil-works/*).
import { mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
const nm = join(AGENT_DIR, "node_modules");
const linkDep = (target, dest) => {
	try { rmSync(dest, { recursive: true, force: true }); } catch {}
	if (existsSync(target)) symlinkSync(target, dest);
};
mkdirSync(join(nm, "@earendil-works"), { recursive: true });
linkDep(join(PKG, "node_modules", "typebox"), join(nm, "typebox"));
linkDep(join(PKG, "node_modules", "@earendil-works", "pi-ai"), join(nm, "@earendil-works", "pi-ai"));
linkDep(PKG, join(nm, "@earendil-works", "pi-coding-agent"));

const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
const jiti = createJiti(join(AGENT_DIR, "extensions", "_check_.js"), { interopDefault: false });
const { isSubstantive, addCandidate, buildSaveResultArgs, buildStagedNote, normalizeQuestion } = await jiti.import(
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

// --- buildStagedNote: oracle frontmatter + body -----------------------------
const now = new Date("2026-07-04T12:34:56.000Z");
const { filename, content } = buildStagedNote(item, now, 0);
check("stagedNote: filename kebab + timestamp", /^graph-20260704-123456-0-[a-z0-9-]+\.md$/.test(filename));
check("stagedNote: category synthesis", content.includes("category: synthesis"));
check("stagedNote: source_layer learned", content.includes("source_layer: learned"));
check("stagedNote: NO pi_version (learned pages omit it)", !content.includes("pi_version:"));
check("stagedNote: lifecycle draft", content.includes("lifecycle: draft"));
check("stagedNote: tags line canonical", content.includes("tags: [pi, graph, synthesis]"));
check("stagedNote: summary present and ≤200 chars", /^summary: ".+"$/m.test(content) && summaryLen(content) <= 200);
check("stagedNote: sources → graph.json", content.includes("graphify-out/graph.json"));
check("stagedNote: unreviewed draft marker", content.includes("UNREVIEWED"));
check("stagedNote: Q heading has the question", content.includes(`# Q: ${item.question}`));
check("stagedNote: answer body present", content.includes(item.answer));
check("stagedNote: records the graph action", content.includes("graph tool action: `query`"));

function summaryLen(md) {
	const m = md.match(/^summary: (".*")$/m);
	return m ? JSON.parse(m[1]).length : Infinity;
}

assert.equal(failed, 0, `${failed} knowledge-compound check(s) failed`);
console.log("\nknowledge-compound: all assertions passed");
