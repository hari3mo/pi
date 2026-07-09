// Build the staged patched copy of tui.js from the live dist.
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { patchSource, MARKER } from "../pi-tui-scrollback-patch-lib.mjs";

const pkgRoot = path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const DIST = path.join(pkgRoot, "node_modules/@earendil-works/pi-tui/dist/tui.js");
const OUT = new URL("./tui.patched.js", import.meta.url).pathname;

const src = fs.readFileSync(DIST, "utf8");
const { patched, status } = patchSource(src);
if (status === "no-anchor") {
	console.error(`DIVERGENCE: anchor not found in ${DIST} — doRender() changed shape; STOP.`);
	process.exit(2);
}
fs.writeFileSync(OUT, patched);

// tui.js imports sibling modules (./keys.js, ./utils.js, ...). Symlink the whole
// dist next to the patched copy so PI_TUI_PATH=tui.patched.js resolves them, while
// tui.patched.js itself is the real patched file.
const distDir = path.dirname(DIST);
const stageDir = path.dirname(OUT);
for (const name of fs.readdirSync(distDir)) {
	if (name === "tui.js") continue;
	const link = path.join(stageDir, name);
	if (fs.existsSync(link)) fs.rmSync(link, { recursive: true, force: true });
	fs.symlinkSync(path.join(distDir, name), link);
}
console.log(`build: ${status} | source=${DIST}`);
console.log(`build: wrote ${OUT} | marker present: ${patched.includes(MARKER)}`);
console.log(`build: symlinked sibling modules into ${stageDir}`);
