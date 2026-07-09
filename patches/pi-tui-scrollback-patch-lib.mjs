// Shared patch logic for the pi-tui scrollback-wipe fix.
// Both the staging build and the apply script use this so the staged proof and the
// live application are byte-identical transforms of whatever tui.js is on disk.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const MARKER = "viewport reflow repaint";

// Anchors on the ORIGINAL destructive fallback block, whitespace-tolerant so it
// survives trivial reformatting drift across pi upgrades. Matches exactly:
//     if (firstChanged < prevViewportTop) {
//         logRedraw(`firstChanged < viewportTop (${firstChanged} < ${prevViewportTop})`);
//         fullRender(true);
//         return;
//     }
export const ANCHOR =
	/if \(firstChanged < prevViewportTop\) \{\s*logRedraw\(`firstChanged < viewportTop \(\$\{firstChanged\} < \$\{prevViewportTop\}\)`\);\s*fullRender\(true\);\s*return;\s*\}/;

export function loadReplacementBlock() {
	return fs.readFileSync(path.join(HERE, "pi-tui-scrollback-reflow-block.txt"), "utf8").replace(/\n$/, "");
}

// Returns { patched, status } where status is "already" | "applied" | "no-anchor".
export function patchSource(src) {
	if (src.includes(MARKER)) {
		return { patched: src, status: "already" };
	}
	if (!ANCHOR.test(src)) {
		return { patched: src, status: "no-anchor" };
	}
	const block = loadReplacementBlock();
	return { patched: src.replace(ANCHOR, block), status: "applied" };
}
