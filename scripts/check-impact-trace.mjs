#!/usr/bin/env node
/**
 * Runnable check for impact-trace's inbound-reference extraction and per-session
 * debounce (extensions/lib/graph-lookup.ts). Imports the REAL exported pure
 * functions with pi's own jiti loader (graph-lookup.ts imports only node
 * builtins, so no node_modules provisioning is needed).
 *
 * Asserts against a tiny inline graph fixture:
 *   - inbound cross-file refs are collected with file:line + relation
 *   - intra-file `contains` and purely semantic edges are excluded
 *   - duplicate edges are deduped
 *   - the SAME result is produced whether the graph uses `links` or `edges`
 *   - markSeen() debounce: first sight true, subsequent false
 *
 * Run: node scripts/check-impact-trace.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = join(here, "..");
const PKG = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
const jiti = createJiti(join(AGENT_DIR, "extensions", "_check_.js"), { interopDefault: false });
const { inboundRefs, markSeen } = await jiti.import(join(AGENT_DIR, "extensions", "lib", "graph-lookup.ts"));
const { pendingDependents } = await jiti.import(join(AGENT_DIR, "extensions", "impact-trace.ts"));

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

const nodes = [
	{ id: "a", source_file: "a.ts", source_location: "L1" },
	{ id: "a_fn", source_file: "a.ts", source_location: "L5" },
	{ id: "b", source_file: "b.ts", source_location: "L1" },
	{ id: "b_ref", source_file: "b.ts", source_location: "L10" },
	{ id: "c_doc", source_file: "c.md" },
];
const links = [
	{ source: "b_ref", target: "a_fn", relation: "references", source_file: "b.ts", source_location: "L10" },
	{ source: "b", target: "a", relation: "imports", source_file: "b.ts", source_location: "L2" },
	{ source: "a", target: "a_fn", relation: "contains", source_file: "a.ts", source_location: "L1" }, // intra-file → excluded
	{ source: "c_doc", target: "a", relation: "references" }, // doc ref, no location → line undefined
	{ source: "b_ref", target: "a_fn", relation: "references", source_file: "b.ts", source_location: "L10" }, // dup → deduped
	{ source: "b", target: "a", relation: "conceptually_related_to" }, // semantic → excluded
];

const expectKeys = new Set(["b.ts|L10|references", "b.ts|L2|imports", "c.md||references"]);
const toKeys = (refs) => new Set(refs.map((r) => `${r.file}|${r.line ?? ""}|${r.relation}`));

// `links` variant
const viaLinks = inboundRefs({ nodes, links }, "a.ts");
check("links: exactly 3 inbound refs (contains/semantic/dup filtered)", viaLinks.length === 3);
check("links: correct file:line:relation set", eqSet(toKeys(viaLinks), expectKeys));
check("links: doc ref has no line", viaLinks.some((r) => r.file === "c.md" && r.line === undefined));

// `edges` variant — same graph, different key
const viaEdges = inboundRefs({ nodes, edges: links }, "a.ts");
check("edges: same 3 inbound refs as links variant", eqSet(toKeys(viaEdges), expectKeys));

// file with no nodes / no inbound refs
check("unknown file → no refs", inboundRefs({ nodes, links }, "zzz.ts").length === 0);
check("file with only outbound → no inbound", inboundRefs({ nodes, links }, "b.ts").length === 0);

// debounce
const seen = new Set();
check("markSeen: first sight → true", markSeen(seen, "a.ts") === true);
check("markSeen: repeat → false", markSeen(seen, "a.ts") === false);
check("markSeen: new key → true", markSeen(seen, "b.ts") === true);

// order-aware follow-through: suppress a reminder only if the dep was edited AFTER its flag
const flaggedAt = new Map([["dep.ts", 3]]);
check("dep edited BEFORE flag (seq 1 < 3) → still reminded", pendingDependents(flaggedAt, new Map([["dep.ts", 1]])).includes("dep.ts"));
check("dep edited AFTER flag (seq 5 > 3) → suppressed", !pendingDependents(flaggedAt, new Map([["dep.ts", 5]])).includes("dep.ts"));
check("dep never edited → still reminded", pendingDependents(flaggedAt, new Map()).includes("dep.ts"));
check("dep edited AT flag-time (seq 3 == 3) → still reminded (not strictly after)", pendingDependents(flaggedAt, new Map([["dep.ts", 3]])).includes("dep.ts"));

function eqSet(a, b) {
	if (a.size !== b.size) return false;
	for (const x of a) if (!b.has(x)) return false;
	return true;
}

assert.equal(failed, 0, `${failed} impact-trace check(s) failed`);
console.log("\nimpact-trace: all assertions passed");
