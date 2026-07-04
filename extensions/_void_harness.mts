import def from "./void-blackhole.ts";

// Capture the component factory by driving the extension's fake registration.
let factory: any = null;
const fakePi: any = {
	on() {},
	registerCommand(_name: string, spec: any) {
		fakePi.__handler = spec.handler;
	},
};
def(fakePi);

const fakeCtx: any = {
	mode: "tui",
	ui: {
		custom(fn: any) {
			factory = fn;
		},
		notify() {},
	},
};
await fakePi.__handler("", fakeCtx);

const tui = { requestRender() {} };
const comp: any = factory(tui, {}, {}, () => {});

const W = Number(process.argv[2] ?? 160);
const ROWS_ENV = Number(process.argv[3] ?? 44);
(process.stdout as any).rows = ROWS_ENV;

// Advance simulation a few seconds so the disk is populated & spun up.
const secs = Number(process.argv[4] ?? 3);
for (let t = 0; t < secs * 20; t++) comp["tick"](0.05);
comp["version"]++;

const lines: string[] = comp.render(W);

const mode = process.argv[5] ?? "plain";
if (mode === "raw") {
	// Emit with ANSI intact so it can be viewed in a real terminal.
	process.stdout.write(lines.join("\n") + "\n");
} else if (mode === "tier") {
	// Map each cell to a tier symbol: ' '=empty . =dim o=normal #=bold  W=black(wordmark)
	let dim = 0, norm = 0, bold = 0, black = 0, filled = 0;
	for (const ln of lines) {
		let out = "";
		let tier = "";
		// re-parse ansi
		let i = 0;
		while (i < ln.length) {
			if (ln[i] === "\x1b") {
				const m = ln.slice(i).match(/^\x1b\[[0-9;]*m/);
				if (m) {
					const code = m[0];
					if (code === "\x1b[2m") tier = "dim";
					else if (code === "\x1b[1m") tier = "bold";
					else if (code === "\x1b[30m") tier = "black";
					else if (code === "\x1b[0m") tier = "";
					i += m[0].length;
					continue;
				}
			}
			const ch = ln[i];
			if (ch === " ") out += " ";
			else {
				filled++;
				if (tier === "dim") { out += "."; dim++; }
				else if (tier === "bold") { out += "#"; bold++; }
				else if (tier === "black") { out += "W"; black++; }
				else { out += "o"; norm++; }
			}
			i++;
		}
		console.log(out);
	}
	console.error(`\nfilled=${filled} dim=${dim} norm=${norm} bold=${bold} black=${black}` +
		`  bold%=${(100*bold/filled).toFixed(1)} dim%=${(100*dim/filled).toFixed(1)} norm%=${(100*norm/filled).toFixed(1)}`);
} else {
	// plain: strip all ANSI
	for (const ln of lines) console.log(ln.replace(/\x1b\[[0-9;]*m/g, ""));
}

comp.dispose();
