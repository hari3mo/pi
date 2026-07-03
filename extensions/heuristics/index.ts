/**
 * Continuous-Learning Extension — entry point. See DESIGN.md (authoritative, v2).
 *
 * Wires together:
 *  - `learn_heuristic` tool (capture, DESIGN.md §3)
 *  - `before_agent_start` injection (DESIGN.md §8)
 *  - `agent_end` generic reflection nudge (DESIGN.md §9)
 *  - `tool_result` / `tool_call` orchestration nudge signals S1-S4 (DESIGN.md §9)
 *  - `/heuristics` command (DESIGN.md §10)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { registerHeuristicsCommand } from "./command.ts";
import { buildInjectionBlock } from "./inject.ts";
import {
	BUILDER_WATCH_CALLS,
	CategorySchema,
	CHURN_CAP,
	CHURN_WINDOW,
	type Category,
	ScopeSchema,
	type Scope,
	matchesBuilderRole,
} from "./schema.ts";
import { findGitRoot, globalDir, projectDirFor, readStoreForInjection, saveHeuristic } from "./store.ts";

// ---------------------------------------------------------------------------
// Module state (per process; cleared on session_start). See DESIGN.md §9.
// ---------------------------------------------------------------------------

/** Decided nudge text for the *next* turn's injection; consumed+cleared in before_agent_start. */
let pendingNudgeText: string | null = null;

/** Orchestration-signal reason accumulated during the current run; first signal wins. */
let pendingOrchNudgeReason: string | null = null;

/** Armed after a successful builder-role subagent call; watches the next N lead tool calls for edit/write. */
let builderWatch: { remaining: number } | null = null;

/** session key -> recent subagent agent names (most recent last), capped at CHURN_CAP. */
const churnMap = new Map<string, string[]>();

/** Rate limit for the generic (non-orchestration) nudge: once per 3 prompts. */
let promptIndex = 0;
let lastGenericFirePromptIndex = -Infinity;

const GENERIC_RATE_LIMIT_PROMPTS = 3;

const CORRECTION_RE = /\b(no,? actually|don'?t (do|use)|you should('?ve| have)|always |never |stop )/i;

interface SubagentResultLike {
	agent: string;
	agentSource: string;
	exitCode: number;
	stopReason?: string;
}

function isFailedResult(r: SubagentResultLike): boolean {
	return r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
}

function extractUserText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((c): c is { type: "text"; text: string } => c && typeof c === "object" && c.type === "text")
			.map((c) => c.text)
			.join(" ");
	}
	return "";
}

export default function heuristicsExtension(pi: ExtensionAPI) {
	// -------------------------------------------------------------------
	// session_start: clear all per-session nudge/signal state.
	// -------------------------------------------------------------------
	pi.on("session_start", async () => {
		churnMap.clear();
		builderWatch = null;
		pendingOrchNudgeReason = null;
		pendingNudgeText = null;
		promptIndex = 0;
		lastGenericFirePromptIndex = -Infinity;
	});

	// -------------------------------------------------------------------
	// learn_heuristic tool (DESIGN.md §3)
	// -------------------------------------------------------------------
	pi.registerTool({
		name: "learn_heuristic",
		label: "Learn Heuristic",
		description:
			"Record a durable, generalizable, cross-session lesson: a user correction, a non-obvious " +
			"gotcha, an environment/tooling quirk, a workflow/convention preference, or a delegation lesson.",
		promptSnippet:
			"Record a durable cross-session lesson: a user correction, gotcha, env quirk, " +
			"workflow/convention preference, or delegation lesson",
		promptGuidelines: [
			"Call learn_heuristic when you discover a durable lesson worth remembering across sessions: a user correction of your behavior, a non-obvious gotcha, an environment/tooling quirk, or a workflow/convention preference.",
			"Use learn_heuristic scope 'project' for lessons specific to the current repository; use scope 'global' only for lessons that apply to every project.",
			"Do not call learn_heuristic for one-off facts, transient state, secrets, or anything already stated in AGENTS.md or the current task.",
			"Phrase learn_heuristic text as a GENERALIZABLE lesson that will help future sessions: 'When X, do Y because Z' — never session-specific details like line numbers, temporary paths, ticket IDs, or one-off values.",
			"Keep learn_heuristic text to one short imperative sentence.",
			"After a delegated/subagent task fails, is misrouted to the wrong role or tier, needs rework, or reveals a better way to frame the hand-off, call learn_heuristic with category 'orchestration' capturing the durable delegation lesson — which role fits this kind of task, what context/files the task text must include, how to frame the contract, and what verification the return needed.",
		],
		parameters: Type.Object({
			text: Type.String({ description: "One imperative, self-contained, generalizable sentence." }),
			category: CategorySchema,
			scope: Type.Optional(ScopeSchema),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!params.text || !params.text.trim()) {
				throw new Error("learn_heuristic: text must not be empty.");
			}

			let scope: Scope = (params.scope as Scope | undefined) ?? "project";
			let project: string | null = null;
			const warnings: string[] = [];

			if (scope === "project") {
				if (!ctx.isProjectTrusted()) {
					scope = "global";
					warnings.push("project not trusted; saved to global heuristics");
				} else {
					project = findGitRoot(ctx.cwd);
				}
			}

			const dir = scope === "global" ? globalDir() : projectDirFor(ctx.cwd);
			const category = params.category as Category;

			const result = await saveHeuristic(dir, scope, project, params.text, category, "agent");
			const allWarnings = [...warnings, ...result.warnings];
			const text = `Learned (${result.status}) [${result.id}]${allWarnings.length ? `\n${allWarnings.join("\n")}` : ""}`;

			return {
				content: [{ type: "text" as const, text }],
				details: { status: result.status, id: result.id, scope, warnings: allWarnings },
			};
		},
	});

	// -------------------------------------------------------------------
	// before_agent_start: injection (DESIGN.md §8). Never blocks the turn.
	// -------------------------------------------------------------------
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const isSubagent = process.argv.includes("--no-session");
			const projectTrusted = ctx.isProjectTrusted();

			const global = await readStoreForInjection(globalDir());
			const project = projectTrusted ? await readStoreForInjection(projectDirFor(ctx.cwd)) : [];

			const nudgeLine = pendingNudgeText;
			pendingNudgeText = null;

			const block = buildInjectionBlock(global, project, projectTrusted, isSubagent, nudgeLine);
			if (!block) return undefined;

			return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
		} catch {
			return undefined;
		}
	});

	// -------------------------------------------------------------------
	// agent_end: generic reflection nudge + fold in any orchestration signal
	// accumulated during the run (DESIGN.md §9). Never blocks.
	// -------------------------------------------------------------------
	pi.on("agent_end", async (event) => {
		try {
			promptIndex++;

			if (pendingOrchNudgeReason) {
				pendingNudgeText = `A recent delegation had trouble (${pendingOrchNudgeReason}); if there is a durable delegation lesson, call learn_heuristic (category: orchestration).`;
				pendingOrchNudgeReason = null;
				return;
			}

			let correctionSeen = false;
			let learnCalled = false;
			for (const msg of event.messages as Array<Record<string, unknown>>) {
				if (msg.role === "user") {
					if (CORRECTION_RE.test(extractUserText(msg.content))) correctionSeen = true;
				} else if (msg.role === "assistant" && Array.isArray(msg.content)) {
					for (const part of msg.content as Array<Record<string, unknown>>) {
						if (part.type === "toolCall" && part.name === "learn_heuristic") learnCalled = true;
					}
				} else if (msg.role === "toolResult" && msg.toolName === "learn_heuristic") {
					learnCalled = true;
				}
			}

			if (correctionSeen && !learnCalled && promptIndex - lastGenericFirePromptIndex >= GENERIC_RATE_LIMIT_PROMPTS) {
				pendingNudgeText = "Note: the user corrected you recently — if that was a durable lesson, call learn_heuristic.";
				lastGenericFirePromptIndex = promptIndex;
			}
		} catch {
			// never block
		}
	});

	// -------------------------------------------------------------------
	// tool_result: orchestration signals S1-S3 + arm S4 (DESIGN.md §9).
	// Only acts on the subagent tool's result; never throws.
	// -------------------------------------------------------------------
	pi.on("tool_result", async (event, ctx) => {
		try {
			if (event.toolName !== "subagent") return;
			const details = event.details as { results?: SubagentResultLike[] } | undefined;
			const results = details?.results;
			if (!Array.isArray(results)) return;

			const sessionKey = ctx.sessionManager.getSessionFile() ?? "ephemeral";
			let history = churnMap.get(sessionKey);
			if (!history) {
				history = [];
				churnMap.set(sessionKey, history);
			}

			const s1 = event.isError || results.some(isFailedResult);
			const s2 = results.some((r) => r.agentSource === "unknown");

			let s3 = false;
			const recentWindow = history.slice(-CHURN_WINDOW);
			for (const r of results) {
				if (recentWindow.includes(r.agent)) s3 = true;
			}
			for (const r of results) history.push(r.agent);
			if (history.length > CHURN_CAP) history.splice(0, history.length - CHURN_CAP);

			if (!pendingOrchNudgeReason) {
				if (s1) pendingOrchNudgeReason = "the task failed";
				else if (s2) pendingOrchNudgeReason = "an unknown/misrouted role";
				else if (s3) pendingOrchNudgeReason = "the same role was re-delegated";
			}

			for (const r of results) {
				if (!isFailedResult(r) && matchesBuilderRole(r.agent)) {
					builderWatch = { remaining: BUILDER_WATCH_CALLS };
				}
			}
		} catch {
			// never throw from a signal handler
		}
	});

	// -------------------------------------------------------------------
	// tool_call: read-only S4 firing (DESIGN.md §9). Never mutates event.input.
	// -------------------------------------------------------------------
	pi.on("tool_call", async (event) => {
		try {
			if (!builderWatch) return;
			if (builderWatch.remaining > 0 && (event.toolName === "edit" || event.toolName === "write")) {
				if (!pendingOrchNudgeReason) pendingOrchNudgeReason = "you edited files right after a builder run";
				builderWatch = null;
				return;
			}
			builderWatch.remaining -= 1;
			if (builderWatch.remaining <= 0) builderWatch = null;
		} catch {
			// read-only signal handler; never throw
		}
	});

	// -------------------------------------------------------------------
	// /heuristics command (DESIGN.md §10)
	// -------------------------------------------------------------------
	registerHeuristicsCommand(pi);
}
