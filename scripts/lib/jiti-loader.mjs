/**
 * Shared bootstrap for the runnable check-*.mjs harness + smoke-extensions.mjs.
 *
 * Two things every check needs and used to hand-roll identically:
 *   - loadJiti(): pi's OWN jiti (the one shipped inside the installed pi
 *     package) anchored at extensions/, so a check imports the REAL extension
 *     .ts with loader fidelity — not node's strip-types.
 *   - provisionNodeModules(): symlink the pi package's bare-specifier deps into
 *     <AGENT_DIR>/node_modules so jiti can resolve `@earendil-works/*` / typebox
 *     when a check loads an extension that imports them. Only the 3 checks that
 *     load a pi-importing extension call it; the pure-function checks skip it.
 *
 * Every check still runs standalone via `node scripts/check-X.mjs`: this is a
 * plain relative ESM import, resolved against the check file.
 */

import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <AGENT_DIR>/scripts/lib
export const AGENT_DIR = process.env.PI_AGENT_DIR ?? join(here, "..", "..");
export const PKG = join(process.env.HOME, ".local", "lib", "node_modules", "@earendil-works", "pi-coding-agent");

/**
 * Symlink the pi package's bare-specifier deps into <AGENT_DIR>/node_modules.
 * Idempotent, gitignored, self-heals on a moved/upgraded pi install. Links the
 * SUPERSET every caller needs — an unused link is harmless (link() skips absent
 * targets), so one function serves all three provisioning checks.
 */
export function provisionNodeModules() {
	const nm = join(AGENT_DIR, "node_modules");
	const link = (target, dest) => {
		try {
			rmSync(dest, { recursive: true, force: true });
		} catch {}
		if (existsSync(target)) symlinkSync(target, dest);
	};
	mkdirSync(join(nm, "@earendil-works"), { recursive: true });
	link(join(PKG, "node_modules", "typebox"), join(nm, "typebox"));
	link(join(PKG, "node_modules", "@earendil-works", "pi-ai"), join(nm, "@earendil-works", "pi-ai"));
	link(join(PKG, "node_modules", "@earendil-works", "pi-tui"), join(nm, "@earendil-works", "pi-tui"));
	link(PKG, join(nm, "@earendil-works", "pi-coding-agent"));
}

/** pi's own jiti, anchored at extensions/. Returns { jiti, AGENT_DIR, PKG }. */
export async function loadJiti() {
	const { createJiti } = await import(pathToFileURL(join(PKG, "node_modules", "jiti", "lib", "jiti.mjs")).href);
	const jiti = createJiti(join(AGENT_DIR, "extensions", "_check_.js"), { interopDefault: false });
	return { jiti, AGENT_DIR, PKG };
}
