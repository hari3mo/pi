#!/usr/bin/env node
/**
 * Unit check for extensions/lib/config-paths.ts isReloadResource().
 * Pure module (node:path only), so it loads under pi's jiti with no package
 * links. Run: node scripts/test-config-paths.mjs
 */
import { join } from "node:path";
import { AGENT_DIR, loadJiti } from "./lib/jiti-loader.mjs";

const { jiti } = await loadJiti();
const { isReloadResource } = await jiti.import(join(AGENT_DIR, "extensions", "lib", "config-paths.ts"));

const cases = [
	// reload-worthy resources
	["extensions/self-audit.ts", true],
	["extensions/lib/config-paths.ts", true],
	["skills/foo/SKILL.md", true],
	["prompts/bar.md", true],
	["themes/dark.json", true],
	["keybindings.json", true],
	["AGENTS.md", true],
	["some/nested/AGENTS.md", true],
	// audit-relevant but NOT reload resources
	// settings.json is machine-churned live UI state, not a tracked reload resource
	["settings.json", false],
	["docs/config-index.md", false],
	["schema/manifest.json", false],
	["scripts/validate-config.py", false],
	["graphify-out/graph.json", false],
	["README.md", false],
];

let fail = 0;
for (const [path, want] of cases) {
	const got = isReloadResource(path);
	if (got !== want) {
		console.log(`FAIL  ${path}: got ${got}, want ${want}`);
		fail++;
	}
}
console.log(fail ? `\n${fail} failure(s) across ${cases.length} cases` : `\nok — ${cases.length} cases pass`);
process.exit(fail ? 1 : 0);
