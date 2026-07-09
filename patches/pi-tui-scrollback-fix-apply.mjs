#!/usr/bin/env node
// Idempotently apply the pi-tui scrollback-wipe fix to the live installed dist.
// Writes OUTSIDE ~/.pi (the pi install tree), so the lead runs this with user approval.
//
//   node ~/.pi/agent/patches/pi-tui-scrollback-fix-apply.mjs
//
// After applying, verify with:
//   PI_TUI_PATH=<dist>/tui.js node ~/.pi/agent/patches/pi-tui-scrollback-fix-harness.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { patchSource, MARKER } from "./pi-tui-scrollback-patch-lib.mjs";

function findDist() {
	if (process.env.PI_PKG) {
		const p = path.join(process.env.PI_PKG, "node_modules/@earendil-works/pi-tui/dist/tui.js");
		if (fs.existsSync(p)) return p;
	}
	// npm root -g covers fnm/nvm/brew layouts.
	try {
		const root = execSync("npm root -g", { encoding: "utf8" }).trim();
		const p = path.join(root, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js");
		if (fs.existsSync(p)) return p;
	} catch {}
	// Walk from `which pi` -> real cli.js -> package root.
	try {
		const bin = execSync("readlink -f \"$(which pi)\"", { encoding: "utf8", shell: "/bin/bash" }).trim();
		// bin = .../@earendil-works/pi-coding-agent/dist/cli.js
		const pkg = bin.replace(/\/dist\/cli\.js$/, "");
		const p = path.join(pkg, "node_modules/@earendil-works/pi-tui/dist/tui.js");
		if (fs.existsSync(p)) return p;
	} catch {}
	// Legacy ~/.local layout.
	const legacy = path.join(process.env.HOME, ".local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js");
	if (fs.existsSync(legacy)) return legacy;
	return null;
}

const dist = findDist();
if (!dist) {
	console.error("FAIL: could not locate the installed pi-tui dist/tui.js (set PI_PKG or check `which pi`).");
	process.exit(1);
}
console.log(`target: ${dist}`);

const src = fs.readFileSync(dist, "utf8");
const { patched, status } = patchSource(src);

if (status === "already") {
	console.log(`no-op: marker "${MARKER}" already present — dist is already patched.`);
	process.exit(0);
}
if (status === "no-anchor") {
	console.error(`DIVERGENCE: the original fallback block was not found in ${dist}.`);
	console.error("doRender() has changed shape; do NOT improvise — re-derive the patch from");
	console.error("patches/pi-tui-scrollback-fix.md against the new code.");
	process.exit(2);
}

const bak = `${dist}.bak`;
if (!fs.existsSync(bak)) {
	fs.copyFileSync(dist, bak);
	console.log(`backup: wrote ${bak}`);
} else {
	console.log(`backup: ${bak} already exists — left untouched`);
}

fs.writeFileSync(dist, patched);
console.log(`applied: both edits (clamp + off-screen early-return + viewport reflow repaint)`);
console.log(`verify: marker present: ${patched.includes(MARKER)}`);
console.log(`next:   PI_TUI_PATH=${dist} node ~/.pi/agent/patches/pi-tui-scrollback-fix-harness.mjs`);
