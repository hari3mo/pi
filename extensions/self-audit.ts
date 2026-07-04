/**
 * Self-Audit Extension
 *
 * Makes the harness audit itself every session — the config equivalent of a
 * health check the agent can SEE and act on:
 *
 *   1. session_start — runs scripts/validate-config.py (static config: schema
 *      conformance, hygiene, hook/patch integrity) AND scripts/audit-pipelines.py
 *      (pipeline dynamics: did the rebuild hook fire, staleness, autocommit
 *      liveness, graph connectivity ratchet) and caches the merged result.
 *   2. before_agent_start — injects a "Harness self-audit" block ONLY when
 *      errors or warnings exist (zero prompt cost when healthy), instructing
 *      the agent to fix or surface them.
 *   3. /audit — re-runs the validator on demand and shows the full report.
 *   4. "config-repo-advanced" (pi.events) — the single classified cross-shell
 *      change result from lib/change-detection.ts (via concurrency-guard),
 *      carrying { range, foreign, collided, staleResources }. Re-run the
 *      validator automatically so the injected problems track the new HEAD
 *      without a session restart (eventually consistent: the refreshed result
 *      shows on the next before_agent_start).
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
const PIPELINE_AUDIT = join(getAgentDir(), "scripts", "audit-pipelines.py");
const INJECT_CAP = 1600;

interface AuditResult {
	ok: boolean;
	problems: string[]; // ERROR/WARN lines only
	raw: string;
}

let lastAudit: AuditResult | undefined;
let refreshing = false;

function runScript(script: string, args: string[], timeoutMs: number): Promise<AuditResult> {
	return new Promise((resolve) => {
		execFile(
			"python3",
			[script, ...args],
			{ cwd: getAgentDir(), timeout: timeoutMs, maxBuffer: 1024 * 1024 },
			(err, stdout, stderr) => {
				const raw = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
				if (err && !raw) {
					// Audit infra unavailable — never block or spam the session.
					resolve({ ok: true, problems: [], raw: `${script} unavailable: ${err.message}` });
					return;
				}
				const problems = raw.split("\n").filter((l) => l.startsWith("ERROR") || l.startsWith("WARN"));
				// Fail CLOSED: a non-zero exit with output but no ERROR/WARN line (e.g. a
				// Python traceback) would otherwise report ok:true and hide the crash.
				// Synthesize a problem line so the failure gets injected/injectable.
				if (err && problems.length === 0) {
					const code = typeof err.code === "number" ? err.code : (err.signal ?? "?");
					const firstLine = raw.split("\n").find((l) => l.trim());
					const name = script.split("/").pop() ?? script;
					problems.push(`ERROR  audit-infra: ${name} exited ${code}${firstLine ? ` — ${firstLine.trim()}` : ""}`);
				}
				resolve({ ok: problems.length === 0, problems, raw });
			},
		);
	});
}

/** Static config audit + fast pipeline meta-audit, merged into one result. */
async function runValidator(full = false): Promise<AuditResult> {
	const [config, pipelines] = await Promise.all([
		runScript(VALIDATOR, [], 30_000),
		runScript(PIPELINE_AUDIT, full ? ["--full"] : [], full ? 180_000 : 30_000),
	]);
	return {
		ok: config.ok && pipelines.ok,
		problems: [...config.problems, ...pipelines.problems],
		raw: `── config (validate-config.py) ──\n${config.raw}\n── pipelines (audit-pipelines.py${full ? " --full" : ""}) ──\n${pipelines.raw}`,
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async () => {
		lastAudit = await runValidator();
	});

	// Cross-shell staleness: ONE classified RepoAdvance per repo advance, emitted
	// by concurrency-guard from the shared lib/change-detection.ts engine (own
	// autocommit snapshots never emit). Re-run the audit so the injected problems
	// reflect the new HEAD. Fire-and-forget (the handler must be synchronous)
	// with an in-flight guard so bursts collapse into one run; the next
	// before_agent_start injects the refreshed result.
	pi.events.on("config-repo-advanced", () => {
		if (refreshing) return;
		refreshing = true;
		runValidator()
			.then((r) => {
				lastAudit = r;
			})
			.finally(() => {
				refreshing = false;
			});
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
		description: "Run the harness self-audit (config + pipeline meta-audit) and show the report",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Running harness self-audit (config + pipelines --full)...", "info");
			lastAudit = await runValidator(true);
			ctx.ui.notify(lastAudit.raw.split("\n").slice(-40).join("\n"), lastAudit.ok ? "info" : "warning");
		},
	});
}
