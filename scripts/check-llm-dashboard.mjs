#!/usr/bin/env node
/**
 * Ad-hoc check for the LLM usage dashboard generator.
 * Generates a local-only dashboard into a temp dir and verifies the embedded
 * data + HTML shell are structurally usable. Remote SSH is deliberately skipped
 * so this stays deterministic in session-start audits.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AGENT_DIR } from "./lib/jiti-loader.mjs";

const dir = mkdtempSync(join(tmpdir(), "llm-usage-dashboard-"));
const out = join(dir, "index.html");
const script = join(AGENT_DIR, "scripts", "llm-usage-dashboard.py");

try {
	const run = spawnSync("python3", [script, "--no-remote", "--out", out], {
		cwd: AGENT_DIR,
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
		timeout: 180_000,
	});
	if (run.status !== 0) {
		throw new Error(`generator exited ${run.status}: ${(run.stdout || "") + (run.stderr || "")}`.slice(0, 1200));
	}
	const dataPath = join(dir, "data.json");
	if (!existsSync(out)) throw new Error(`missing HTML output at ${out}`);
	if (!existsSync(dataPath)) throw new Error(`missing data output at ${dataPath}`);
	const html = readFileSync(out, "utf8");
	if (!html.includes("LLM Usage Atlas")) throw new Error("HTML shell missing title");
	if (!html.includes("usage-data")) throw new Error("HTML shell missing embedded data script");
	const data = JSON.parse(readFileSync(dataPath, "utf8"));
	if (!Array.isArray(data.records) || data.records.length === 0) throw new Error("no usage records collected");
	if (!Array.isArray(data.sources) || data.sources.length < 3) throw new Error("expected pi/claude/hermes source records");
	const apps = new Set(data.sources.map((s) => s.app));
	for (const app of ["pi", "claude", "hermes"]) {
		if (!apps.has(app)) throw new Error(`missing ${app} source`);
	}
	console.log(`ok     llm-dashboard generated ${data.records.length} local records from ${data.sources.length} sources`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
