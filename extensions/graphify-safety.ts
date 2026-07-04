/**
 * Guard the ~/.pi/agent graphify graph against the two easy-to-repeat footguns:
 * bare `graphify --update` without a Gemini key (semantic layer wipe) and
 * deleting graphify-out/ (semantic cache lives inside it).
 */

import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const GRAPHIFY_UPDATE_RE = /(?:^|[;&|]\s*)(?:(?:\S*python\S*\s+-m\s+)?graphify\b[^;&|]*(?:--update|\bupdate\b))/i;
const DELETE_GRAPHIFY_OUT_RE = /\brm\s+(?:-[A-Za-z]+\s+)*(?:['"]?(?:\.\/)?graphify-out\/?['"]?)(?:\s|$|[;&|])/i;

function under(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function expanded(command: string): string {
	return command.replace(/(^|\s)~(?=\/)/g, `$1${homedir()}`);
}

function agentContext(cwd: string, command: string): boolean {
	const agent = resolve(getAgentDir());
	if (under(agent, resolve(cwd))) return true;
	const cmd = expanded(command);
	return cmd.includes(agent) || /\bcd\s+(?:~\/\.pi\/agent|\$HOME\/\.pi\/agent)/.test(command);
}

export default function graphifySafety(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const command = (event.input as { command?: string }).command ?? "";
		if (!command || !agentContext(ctx.cwd, command)) return;

		if (DELETE_GRAPHIFY_OUT_RE.test(command)) {
			return {
				block: true,
				reason:
					"Blocked: ~/.pi/agent/graphify-out contains the semantic cache. Restore from git/backup instead of deleting it, or set PI_ALLOW_GRAPHIFY_OUT_DELETE=1 outside pi if you really mean it.",
			};
		}

		if (GRAPHIFY_UPDATE_RE.test(command) && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
			return {
				block: true,
				reason:
					"Blocked: bare graphify --update in ~/.pi/agent without GEMINI_API_KEY/GOOGLE_API_KEY can wipe doc semantics. Run audit-pipelines.py --full first and refresh via the graphify skill's LLM path, or set a Gemini key.",
			};
		}
	});
}
