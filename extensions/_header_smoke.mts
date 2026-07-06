import def from "./custom-header.ts";

let headerFactory: any = null;
const pi: any = { on(_e: string, cb: any) { pi.__cb = cb; }, registerCommand() {} };
def(pi);
const ctx: any = { cwd: process.cwd(), mode: "tui", ui: { setHeader(f: any) { headerFactory = f; } } };
await pi.__cb({}, ctx);

const theme: any = { fg: (_n: string, s: string) => s }; // identity theme
const tui: any = { requestRender() {} };
const h = headerFactory(tui, theme);

const mid = h.render(80);
console.log("mid-reveal lines:", mid.length);
console.log("banner row (mid):", JSON.stringify(mid[2]));
