#!/usr/bin/env node
/**
 * Runnable check for the learning-tap extension's pure logic
 * (extensions/learning-tap/lib.ts). Imports the REAL exported functions via
 * pi's jiti loader and asserts:
 *   - isSubstantiveQuery: errors, short answers, non-query actions, and
 *     BFS-traversal node dumps are dropped
 *   - parseVerdict: normalized "[VERDICT: ...]" lines, bare PASS/FAIL lines,
 *     and legacy trailing verdicts all parse; prose without a verdict → null
 *   - addEvent: session-level dedupe by (kind, question/verdict) + cap
 *   - serializeEvent: >8KB lines are dropped, not truncated
 *   - appendEvents: real tmpdir round-trip, lock released, JSONL parseable
 *   - extractReturns: single mode, chain mode with headers, unstructured
 *
 * Smallest thing that fails if the tap logic breaks. Run:
 *   node scripts/check-learning-tap.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_DIR, loadJiti, provisionNodeModules } from "./lib/jiti-loader.mjs";

provisionNodeModules();
const { jiti } = await loadJiti();
const lib = await jiti.import(join(AGENT_DIR, "extensions", "learning-tap", "lib.ts"));
const {
	addEvent,
	appendEvents,
	extractReturns,
	isSubstantiveQuery,
	makeEvent,
	parseVerdict,
	serializeEvent,
	MAX_EVENTS_PER_SESSION,
} = lib;

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

const LONG = "durable insight ".repeat(20); // > 200 chars, not a BFS dump

// --- isSubstantiveQuery ------------------------------------------------------
check("substantive query passes", isSubstantiveQuery("query", false, LONG));
check("explain passes", isSubstantiveQuery("explain", false, LONG));
check("error dropped", !isSubstantiveQuery("query", true, LONG));
check("short answer dropped", !isSubstantiveQuery("query", false, "tiny"));
check("status action dropped", !isSubstantiveQuery("status", false, LONG));
check("BFS node dump dropped", !isSubstantiveQuery("query", false, `Traversal: BFS depth=2 | ${LONG}`));
check("graphify error prefix dropped", !isSubstantiveQuery("query", false, `graphify error: ${LONG}`));

// --- parseVerdict ------------------------------------------------------------
check("normalized PASS", parseVerdict("[VERDICT: PASS]\nall good") === "PASS");
check(
	"normalized FAIL impl",
	parseVerdict("[VERDICT: FAIL: implementation]\nfindings...") === "FAIL: implementation",
);
check("bare FAIL design first line", parseVerdict("FAIL: design — wrong abstraction") === "FAIL: design");
check("legacy trailing verdict", parseVerdict("Reviewed everything.\nConclusion: PASS") === "PASS");
check("prose without verdict", parseVerdict("This code has some issues to discuss.") === null);
check(
	"last verdict wins in legacy scan",
	parseVerdict("Initially PASS seemed right but final: FAIL: implementation") === "FAIL: implementation",
);

// --- addEvent dedupe + cap ---------------------------------------------------
{
	const buf = [];
	const ev1 = makeEvent("query", { question: "How does X work?", answer: LONG }, [], "s1", "/");
	const ev2 = makeEvent("query", { question: "how does  x work?", answer: LONG }, [], "s1", "/");
	check("first event added", addEvent(buf, ev1));
	check("normalized-dup dropped", !addEvent(buf, ev2));
	const evV = makeEvent("verdict", { verdict: "PASS", findings: "x" }, [], "s1", "/");
	check("different kind added", addEvent(buf, evV));
	for (let i = 0; i < MAX_EVENTS_PER_SESSION + 5; i++) {
		addEvent(buf, makeEvent("explicit", { text: `lesson ${i}` }, ["e"], "s1", "/"));
	}
	check(`cap enforced at ${MAX_EVENTS_PER_SESSION}`, buf.length === MAX_EVENTS_PER_SESSION);
}

// --- serializeEvent size gate ------------------------------------------------
{
	const small = makeEvent("explicit", { text: "ok" }, ["e"], "s", "/");
	check("small event serializes", typeof serializeEvent(small) === "string");
	const big = makeEvent("explicit", { text: "x".repeat(9000) }, ["e"], "s", "/");
	check("oversize event dropped (not truncated)", serializeEvent(big) === undefined);
}

// --- appendEvents round-trip -------------------------------------------------
{
	const dir = mkdtempSync(join(tmpdir(), "learning-tap-check-"));
	try {
		const evs = [
			makeEvent("query", { question: "q1", answer: LONG }, [], "s1", "/"),
			makeEvent("verdict", { verdict: "PASS", findings: "fine" }, [], "s1", "/"),
		];
		const n = appendEvents(dir, evs);
		check("two events written", n === 2);
		const lines = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n");
		check("two JSONL lines on disk", lines.length === 2);
		check("lines parse and carry kinds", JSON.parse(lines[0]).kind === "query" && JSON.parse(lines[1]).kind === "verdict");
		check("lock released", !existsSync(join(dir, ".lock")));
		const n2 = appendEvents(dir, [makeEvent("explicit", { text: "later" }, ["e"], "s2", "/")]);
		check("append (not overwrite) on second flush", n2 === 1 && readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n").length === 3);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// --- extractReturns ----------------------------------------------------------
{
	const single = extractReturns({ agent: "peer", task: "review" }, "[VERDICT: PASS]\nok");
	check("single mode attributes agent", single.length === 1 && single[0].agent === "peer");
	const chainText = "### engineer\nbuilt it\n### peer\n[VERDICT: FAIL: design]\nwrong layering";
	const chain = extractReturns({ chain: [{ agent: "engineer" }, { agent: "peer" }] }, chainText);
	const peer = chain.find((r) => r.agent === "peer");
	check("chain mode isolates peer section", !!peer && parseVerdict(peer.text) === "FAIL: design");
	const flat = extractReturns({}, "unstructured return PASS");
	check("unstructured falls back to one entry", flat.length === 1 && flat[0].agent === "");
}

console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
