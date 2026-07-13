/**
 * LLM Dashboard Extension
 *
 * /llm-dashboard generates a Pi Atlas-style browser dashboard across Pi,
 * Hermes, and Claude Code usage on this machine plus the EC2 peer. The heavy
 * lifting lives in scripts/llm-usage-dashboard.py so the command stays thin and
 * fail-open inside an interactive Pi session.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const SCRIPT = join(getAgentDir(), "scripts", "llm-usage-dashboard.py");
const ARGUMENTS = ["open", "local", "remote", "path", "help"];

function runDashboard(args: string[]): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
		execFile(
			"python3",
			[SCRIPT, ...args],
			{ cwd: getAgentDir(), timeout: 180_000, maxBuffer: 2 * 1024 * 1024 },
			(err, stdout, stderr) => {
				const output = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
				resolve({ ok: !err, output: output || (err ? err.message : "") });
			},
		);
	});
}

function notifyText(output: string): string {
	const lines = output.split("\n").filter(Boolean);
	const important = lines.filter(
		(line) =>
			line.startsWith("html=") ||
			line.startsWith("records=") ||
			line.startsWith("sessions=") ||
			line.startsWith("known_cost_usd=") ||
			line.startsWith("unpriced_tokens=") ||
			line.includes("status=error"),
	);
	return (important.length ? important : lines).slice(0, 12).join("\n");
}

function argsFor(raw: string): string[] | "help" | undefined {
	const words = raw.split(/\s+/).filter(Boolean);
	if (words.includes("help") || words.includes("--help") || words.includes("-h")) return "help";
	const args: string[] = [];
	if (words.includes("local")) args.push("--no-remote");
	if (words.includes("open") || (!words.includes("path") && process.platform === "darwin")) {
		args.push("--open");
	}
	if (words.includes("remote")) {
		// remote is already the default; keep the word accepted for discoverability.
	}
	return args;
}

export default function (pi: ExtensionAPI) {
	async function handler(args: string | undefined, ctx: any) {
		if (!ctx.hasUI) return;
		const parsed = argsFor((args ?? "").trim().toLowerCase());
		if (parsed === undefined) return;
		if (parsed === "help") {
			ctx.ui.notify(
				"/llm-dashboard [open|path|local|remote]\n" +
					"default: collect local + EC2 and open the generated browser dashboard on macOS\n" +
					"local: skip EC2 over SSH; path: generate without opening browser",
				"info",
			);
			return;
		}
		ctx.ui.setStatus("llm-dashboard", ctx.ui.theme.fg("dim", "llm dashboard: collecting…"));
		try {
			const result = await runDashboard(parsed);
			ctx.ui.notify(notifyText(result.output), result.ok ? "info" : "error");
		} finally {
			ctx.ui.setStatus("llm-dashboard", undefined);
		}
	}

	pi.registerCommand("llm-dashboard", {
		description: "Generate the local+EC2 Pi/Hermes/Claude usage dashboard",
		getArgumentCompletions(prefix: string) {
			const items = ARGUMENTS.filter((arg) => arg.startsWith(prefix.toLowerCase())).map((arg) => ({ value: arg, label: arg }));
			return items.length > 0 ? items : null;
		},
		handler,
	});

	pi.registerCommand("llm-usage", {
		description: "Alias for /llm-dashboard",
		getArgumentCompletions(prefix: string) {
			const items = ARGUMENTS.filter((arg) => arg.startsWith(prefix.toLowerCase())).map((arg) => ({ value: arg, label: arg }));
			return items.length > 0 ? items : null;
		},
		handler,
	});
}
