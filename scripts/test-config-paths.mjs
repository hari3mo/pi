#!/usr/bin/env node
/**
 * Unit check for extensions/lib/config-paths.ts isReloadResource().
 * Pure module (node:path only), so it loads under pi's jiti with no package
 * links. Run: node scripts/test-config-paths.mjs
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HOME = process.env.HOME;
const AGENT_DIR = process.env.PI_AGENT_DIR ?? join(HOME, ".pi", "agent");
const PKG = join(HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
const jiti = createJiti(join(AGENT_DIR, "scripts", "_test_.js"));
const { isReloadResource } = await jiti.import(join(AGENT_DIR, "extensions", "lib", "config-paths.ts"));

const cases = [
	// reload-worthy resources
	["extensions/self-audit.ts", true],
	["extensions/lib/config-paths.ts", true],
	["skills/foo/SKILL.md", true],
	["prompts/bar.md", true],
	["themes/dark.json", true],
	["keybindings.json", true],
	["settings.json", true],
	["AGENTS.md", true],
	["some/nested/AGENTS.md", true],
	// audit-relevant but NOT reload resources
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
