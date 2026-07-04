/**
 * Self-Audit Extension
 *
 * Makes the harness audit itself every session — the config equivalent of a
 * health check the agent can SEE and act on:
 *
 *   1. session_start — runs scripts/validate-config.py (schema conformance,
 *      heuristics hygiene, credential leakage, layout, hook/patch integrity)
 *      and caches the result.
 *   2. before_agent_start — injects a "Harness self-audit" block ONLY when
 *      errors or warnings exist (zero prompt cost when healthy), instructing
 *      the agent to fix or surface them.
 *   3. /audit — re-runs the validator on demand and shows the full report.
 *
 * Together with the pre-commit hook (same validator, gates snapshots) and the
 * graphify bridge (structural staleness), this closes the self-audit loop:
 * every session begins by checking the harness, and problems become prompts.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const VALIDATOR = join(getAgentDir(), "scripts", "validate-config.py");
const INJECT_CAP = 1600;

interface AuditResult {
	ok: boolean;
	problems: string[]; // ERROR/WARN lines only
	raw: string;
}

let lastAudit: AuditResult | undefined;

function runValidator(): Promise<AuditResult> {
	return new Promise((resolve) => {
		execFile(
			"python3",
			[VALIDATOR],
			{ cwd: getAgentDir(), timeout: 30_000, maxBuffer: 1024 * 1024 },
			(err, stdout, stderr) => {
				const raw = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
				if (err && !raw) {
					// Validator infra unavailable — never block or spam the session.
					resolve({ ok: true, problems: [], raw: `validator unavailable: ${err.message}` });
					return;
				}
				const problems = raw.split("\n").filter((l) => l.startsWith("ERROR") || l.startsWith("WARN"));
				resolve({ ok: problems.length === 0, problems, raw });
			},
		);
	});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async () => {
		lastAudit = await runValidator();
	});

	pi.on("before_agent_start", async (event) => {
		if (!lastAudit || lastAudit.ok) return;
		let lines = lastAudit.problems.join("\n");
		if (lines.length > INJECT_CAP) lines = `${lines.slice(0, INJECT_CAP)}\n... (truncated — run /audit)`;
		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Harness self-audit (validate-config.py at session start)\n\n` +
				`The pi config failed its self-audit:\n${lines}\n` +
				`Fix these in ~/.pi/agent when the current task allows (or surface them to the user). ` +
				`The pre-commit hook blocks config snapshots while ERRORs remain. Re-check with /audit.`,
		};
	});

	pi.registerCommand("audit", {
		description: "Run the harness self-audit (validate-config.py) and show the report",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Running harness self-audit...", "info");
			lastAudit = await runValidator();
			ctx.ui.notify(lastAudit.raw.split("\n").slice(-40).join("\n"), lastAudit.ok ? "info" : "warning");
		},
	});
}
