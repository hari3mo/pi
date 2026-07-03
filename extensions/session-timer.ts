/**
 * Session Timer — shows total elapsed session time in the terminal window/tab title.
 * Title looks like:  [1:23:45] π my-session - my-project
 *
 * Elapsed time counts wall-clock time since this pi instance started; resuming a
 * session restarts the clock from zero.
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function (pi: ExtensionAPI) {
	let startTime = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	function baseTitle(): string {
		const cwd = path.basename(process.cwd());
		const session = pi.getSessionName();
		return session ? `π ${session} - ${cwd}` : `π ${cwd}`;
	}

	function updateTitle(ctx: ExtensionContext) {
		ctx.ui.setTitle(`[${formatElapsed(Date.now() - startTime)}] ${baseTitle()}`);
	}

	pi.on("session_start", async (_event, ctx) => {
		startTime = Date.now();
		if (!ctx.ui.isInteractive) return; // skip print/json modes where setTitle is a no-op
		updateTitle(ctx);
		if (timer) clearInterval(timer);
		timer = setInterval(() => updateTitle(ctx), 1000);
	});

	pi.on("session_shutdown", async () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	});
}
