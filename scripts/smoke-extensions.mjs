#!/usr/bin/env node
/**
 * Extension load smoke test — does every extension still load against the
 * installed pi? The failure mode this catches: `pi update` changes the
 * ExtensionAPI / package layout and extensions start crashing at session
 * start. Run via /audit (audit-pipelines.py --full) or directly:
 *
 *   node scripts/smoke-extensions.mjs
 *
 * Loads each auto-loaded extension (extensions/*.ts and extensions/[star]/index.ts)
 * with pi's OWN TypeScript loader (the jiti shipped inside the installed pi
 * package — loader fidelity, and no strip-types node_modules restriction),
 * then calls its default export with a Proxy-based fake pi that no-ops every
 * method — maximally tolerant of API growth, so the only failures reported
 * are real ones: broken imports, syntax errors, load-time throws.
 * Output format matches validate-config.py (ERROR lines) for merging.
 */

import { existsSync, mkdirSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AGENT_DIR = process.env.PI_AGENT_DIR ?? join(process.env.HOME, ".pi", "agent");
const PKG = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

// Self-provision module resolution: extensions import typebox / @earendil-works/*
// as bare specifiers; link them from the installed pi package (gitignored dir).
// Re-created every run so a moved/upgraded pi install heals automatically.
const nm = join(AGENT_DIR, "node_modules");
function link(target, dest) {
	try { rmSync(dest, { recursive: true, force: true }); } catch {}
	if (existsSync(target)) symlinkSync(target, dest);
}
if (!existsSync(PKG)) {
	console.log(`ERROR  smoke-extensions: pi package not found at ${PKG} — install layout changed; update this script`);
	console.log("\n1 error(s)");
	process.exit(1);
}
mkdirSync(join(nm, "@earendil-works"), { recursive: true });
link(join(PKG, "node_modules", "typebox"), join(nm, "typebox"));
link(join(PKG, "node_modules", "@earendil-works", "pi-ai"), join(nm, "@earendil-works", "pi-ai"));
link(join(PKG, "node_modules", "@earendil-works", "pi-tui"), join(nm, "@earendil-works", "pi-tui"));
link(PKG, join(nm, "@earendil-works", "pi-coding-agent"));

// Maximally tolerant fake pi: every property is a callable no-op that also
// proxies further property access (handles pi.ui.foo(), chained shapes, etc.).
function noopProxy() {
	const fn = () => noopProxy();
	return new Proxy(fn, {
		get: (_t, prop) => (prop === Symbol.toPrimitive ? () => "" : noopProxy()),
		apply: () => noopProxy(),
	});
}

const extDir = join(AGENT_DIR, "extensions");
const candidates = [];
for (const entry of readdirSync(extDir, { withFileTypes: true })) {
	if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.startsWith("_")) {
		candidates.push(join(extDir, entry.name));
	} else if (entry.isDirectory()) {
		const idx = join(extDir, entry.name, "index.ts");
		if (existsSync(idx)) candidates.push(idx);
	}
}

// pi's own loader: jiti from inside the installed package.
const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
const jiti = createJiti(join(AGENT_DIR, "extensions", "_smoke_.js"), { interopDefault: false });

let failures = 0;
for (const file of candidates.sort()) {
	const rel = file.slice(AGENT_DIR.length + 1);
	try {
		const mod = await jiti.import(file);
		if (typeof mod.default !== "function") throw new Error("no default export function");
		mod.default(noopProxy());
		console.log(`ok     ${rel}`);
	} catch (e) {
		failures++;
		console.log(`ERROR  smoke-extensions: ${rel} failed to load — ${String(e?.message ?? e).split("\n")[0]}`);
	}
}
console.log(`\n${failures} error(s) across ${candidates.length} extension(s)`);
process.exit(failures ? 1 : 0);
