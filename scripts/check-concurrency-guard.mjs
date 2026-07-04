#!/usr/bin/env node
/**
 * Runnable check for extensions/concurrency-guard.ts.
 *
 * Drives the SHIPPED extension against a fake-pi Proxy (capturing pi.on
 * handlers, pi.sendMessage, pi.events.emit — same technique as
 * scripts/smoke-extensions.mjs) and a scratch git repo in /tmp. AGENT_DIR is
 * redirected by setting PI_CODING_AGENT_DIR before the extension module loads
 * (getAgentDir() reads it at import time), so every git call the guard makes
 * runs inside the scratch repo.
 *
 * Asserts the two collision-detection fixes:
 *   (a) foreign commit to an UNTOUCHED file        -> plain foreign notice
 *   (b) own-snapshot commit of a TOUCHED file       -> silence (hash matches)
 *   (c) foreign commit to a TOUCHED file (differs)   -> same-file collision notice
 *   (d) a FAILED edit does not mark the path touched -> later foreign commit
 *                                                       is still a plain notice
 *   (e) >=2 same-file collisions -> exactly one serialize nudge at agent_end
 *
 * Run: node scripts/check-concurrency-guard.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { AGENT_DIR, loadJiti, provisionNodeModules } from "./lib/jiti-loader.mjs";

// Self-provision module resolution for the extension's `getAgentDir` import.
provisionNodeModules();

// Scratch git repo standing in for ~/.pi/agent.
const REPO = mkdtempSync(join(tmpdir(), "cg-check-"));
const g = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();
g("init", "-q");
g("config", "user.email", "t@t");
g("config", "user.name", "t");
const put = (name, body) => writeFileSync(join(REPO, name), body);
for (const f of ["untouched.txt", "own.txt", "collide.txt", "failed.txt", "collide2.txt"]) put(f, "v1\n");
g("add", "-A");
g("commit", "-qm", "init");

// Redirect the extension's AGENT_DIR to the scratch repo, then load it with
// pi's own jiti (bare @earendil-works import resolves via the links above).
process.env.PI_CODING_AGENT_DIR = REPO;
const { jiti } = await loadJiti();

// Fake pi: capture handlers + outbound messages/events; no-op everything else.
const handlers = {};
const sent = [];
const emitted = [];
const noop = () => noop;
const pi = new Proxy(function () {}, {
	get(_t, prop) {
		if (prop === "on") return (evt, h) => { (handlers[evt] ??= []).push(h); };
		if (prop === "sendMessage") return (msg) => { sent.push(msg); };
		if (prop === "events") return { emit: (n, p) => emitted.push({ n, p }), on: () => {} };
		return noop;
	},
	apply: () => noop,
});

const mod = await jiti.import(join(AGENT_DIR, "extensions", "concurrency-guard.ts"));
mod.default(pi);

const fire = async (evt, ...args) => {
	let last;
	for (const h of handlers[evt] ?? []) last = await h(...args);
	return last;
};
const ctx = { cwd: REPO };
const abs = (name) => join(REPO, name);
const foreignCommit = (name, body, msg) => { put(name, body); g("add", "-A"); g("commit", "-qm", msg); };
const startPrompt = { systemPrompt: "BASE" };

await fire("session_start");

let failed = 0;
const check = (label, cond) => {
	if (!cond) { failed++; console.log(`FAIL  ${label}`); } else { console.log(`ok    ${label}`); }
};

// (a) foreign commit to an untouched file -> plain foreign notice.
foreignCommit("untouched.txt", "foreign-a\n", "foreign a");
let r = await fire("before_agent_start", startPrompt);
check("(a) foreign untouched file emits a notice", !!r?.systemPrompt && r.systemPrompt !== "BASE");
check("(a) names the file as not-edited (plain foreign)", /untouched\.txt/.test(r.systemPrompt) && /did not edit/.test(r.systemPrompt));
check("(a) NOT flagged as a same-file collision", !/HIGHEST RISK/.test(r.systemPrompt));
check("(a) keeps the Concurrent-session notice header", /## Concurrent-session notice/.test(r.systemPrompt));

// (b) own edit + own-snapshot commit (identical content) -> silence.
put("own.txt", "our-edit\n"); // the edit tool wrote this to disk
await fire("tool_result", { toolName: "edit", isError: false, input: { path: abs("own.txt") } }, ctx);
foreignCommit("own.txt", "our-edit\n", "autocommit own snapshot"); // daemon commits OUR content
r = await fire("before_agent_start", startPrompt);
check("(b) own-snapshot commit (hash matches) stays silent", r === undefined || r.systemPrompt === "BASE");

// (c) own edit, then FOREIGN commit of DIFFERENT content -> same-file collision.
put("collide.txt", "ours\n");
await fire("tool_result", { toolName: "edit", isError: false, input: { path: abs("collide.txt") } }, ctx);
foreignCommit("collide.txt", "theirs-different\n", "foreign clobber");
r = await fire("before_agent_start", startPrompt);
check("(c) foreign commit over an edited file fires a collision notice", !!r?.systemPrompt && /HIGHEST RISK/.test(r.systemPrompt));
check("(c) collision notice names the file", r?.systemPrompt && /collide\.txt/.test(r.systemPrompt));
check("(c) collision notice suggests the re-read path (git log / graph)", r?.systemPrompt && /git log/.test(r.systemPrompt) && /graph/.test(r.systemPrompt));

// (d) a FAILED edit must NOT mark the path touched.
await fire("tool_result", { toolName: "edit", isError: true, input: { path: abs("failed.txt") } }, ctx);
foreignCommit("failed.txt", "foreign-d\n", "foreign after failed edit");
r = await fire("before_agent_start", startPrompt);
check("(d) failed edit -> later foreign commit is a PLAIN notice", !!r?.systemPrompt && /failed\.txt/.test(r.systemPrompt) && /did not edit/.test(r.systemPrompt));
check("(d) failed-edit path is NOT treated as a collision", r?.systemPrompt && !/HIGHEST RISK/.test(r.systemPrompt));

// (e) second same-file collision -> exactly one serialize nudge at agent_end.
const nudgesBefore = sent.filter((m) => /serializing the two sessions/.test(m.content)).length;
put("collide2.txt", "ours2\n");
await fire("tool_result", { toolName: "edit", isError: false, input: { path: abs("collide2.txt") } }, ctx);
foreignCommit("collide2.txt", "theirs2-different\n", "foreign clobber 2");
await fire("before_agent_start", startPrompt); // collisionCount now 2
await fire("agent_end", { messages: [] });
await fire("agent_end", { messages: [] }); // must not nudge twice
const nudges = sent.filter((m) => /serializing the two sessions/.test(m.content)).length;
check("(e) >=2 collisions sends exactly one serialize nudge", nudgesBefore === 0 && nudges === 1);

rmSync(REPO, { recursive: true, force: true });
assert.equal(failed, 0, `${failed} concurrency-guard check(s) failed`);
console.log(`\nconcurrency-guard: all checks passed`);
