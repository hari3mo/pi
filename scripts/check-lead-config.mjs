#!/usr/bin/env node
/**
 * Runnable check for the model-aware lead profiles (extensions/lead-config.ts).
 * Imports the REAL exported pure functions with pi's own jiti loader
 * (lead-config.ts has only type-only + node: builtin imports, so no
 * node_modules provisioning is needed — the graph-first.ts check pattern), and
 * exercises them against the SHIPPED config/lead-profiles.json.
 *
 * Asserts the Delegation-Gate mechanization contract:
 *   - 'anthropic/claude-fable-5'        → fable
 *   - 'claude-opus-4-8'                 → opus-lead
 *   - 'anthropic/claude-opus-4-8:xhigh' → opus-lead
 *   - 'claude-sonnet-5'                 → direct   (universal catch-all match)
 *   - 'openai/gpt-5.5'                  → direct   (universal catch-all match)
 *   - empty / whitespace / no-word-char garbage id → no injection (fail open)
 *   - mid-session switch fable→opus swaps the injected block
 *   - malformed profiles JSON → no profiles → no injection (fail open)
 *
 * Run: node scripts/check-lead-config.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_DIR, loadJiti } from "./lib/jiti-loader.mjs";

const { jiti } = await loadJiti();
const { parseProfiles, matchProfile, buildLeadBlock, isUsableId } = await jiti.import(
	join(AGENT_DIR, "extensions", "lead-config.ts"),
);

let failed = 0;
const check = (label, cond) => {
	if (!cond) failed++;
	console.log(`${cond ? "ok  " : "FAIL"}  ${label}`);
};

// --- the shipped profiles ---
const profiles = parseProfiles(readFileSync(join(AGENT_DIR, "config", "lead-profiles.json"), "utf8"));
check("shipped config parses to ≥3 profiles", Array.isArray(profiles) && profiles.length >= 3);
check("shipped config has a universal catch-all profile", profiles.some((p) => p.match === ".*"));

const nameFor = (id) => matchProfile(profiles, id)?.name ?? null;

// --- matching contract ---
const cases = [
	["anthropic/claude-fable-5", "fable"],
	["claude-fable-5", "fable"],
	["claude-opus-4-8", "opus-lead"],
	["anthropic/claude-opus-4-8:xhigh", "opus-lead"],
	["claude-sonnet-5", "direct"],
	["openai/gpt-5.5", "direct"],
	["google/gemini-3.5-flash:xhigh", "direct"],
];
for (const [id, want] of cases) {
	check(`${id} → ${want}`, nameFor(id) === want);
}

// --- fail-open: unusable ids inject nothing ---
for (const bad of ["", "   ", "\n\t", "!!!", "@#$%", null, undefined]) {
	check(`garbage id ${JSON.stringify(bad)} → no profile`, matchProfile(profiles, bad) === null);
	check(`garbage id ${JSON.stringify(bad)} → no injection`, buildLeadBlock(matchProfile(profiles, bad), "x/y") === "");
}
check("isUsableId rejects empty", !isUsableId(""));
check("isUsableId rejects punctuation-only", !isUsableId("!!!"));
check("isUsableId accepts a real id", isUsableId("claude-opus-4-8"));

// --- injected block: header + doctrine, complements AGENTS.md ---
const fableBlock = buildLeadBlock(matchProfile(profiles, "anthropic/claude-fable-5"), "anthropic/claude-fable-5");
const opusBlock = buildLeadBlock(matchProfile(profiles, "claude-opus-4-8"), "anthropic/claude-opus-4-8");
check("fable block names the profile", fableBlock.includes("→ fable") && fableBlock.startsWith("## Lead profile"));
check("opus block names the profile", opusBlock.includes("→ opus-lead"));
check("opus block states it complements AGENTS.md", /COMPLEMENTS AGENTS\.md/i.test(opusBlock));
check("opus block keeps verdict vocabulary", opusBlock.includes("PASS / FAIL: implementation / FAIL: design"));
check("opus block keeps graph-first mandate", /GRAPH-FIRST/i.test(opusBlock));
check("opus doctrine ≤ 2KB", Buffer.byteLength(opusBlock, "utf8") <= 2048);

// --- mid-session switch fable → opus swaps the block ---
check("mid-session switch swaps the injected block", fableBlock !== opusBlock && !fableBlock.includes("opus-lead"));

// --- fail-open: malformed profiles JSON → no profiles → no injection ---
for (const junk of ["{not json", "", "null", "42", '"a string"', "{}", "[{}]"]) {
	const parsed = parseProfiles(junk);
	check(`malformed profiles ${JSON.stringify(junk)} → [] `, Array.isArray(parsed) && parsed.length === 0);
	check(`malformed profiles ${JSON.stringify(junk)} → no injection`, matchProfile(parsed, "claude-opus-4-8") === null);
}

assert.equal(failed, 0, `${failed} lead-config check(s) failed`);
console.log(`\nlead-config: all assertions passed`);
