/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	CONFIG_DIR_NAME,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	getMarkdownTheme,
	type Theme,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, Markdown, matchesKey, Spacer, Text, truncateToWidth, type TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.ts";
import { fmtDuration as formatDuration, SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "../lib/format.ts";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const COLLAPSED_ITEM_COUNT = 10;
const PER_TASK_OUTPUT_CAP = 50 * 1024;

function isSonnetModel(model: { id?: string; name?: string } | undefined): boolean {
	if (!model) return false;
	return /sonnet/i.test(model.id ?? "") || /sonnet/i.test(model.name ?? "");
}

// Override a model string's trailing ":<thinking>" suffix with the harness pin
// for model families where effort is policy, not inherited from the lead.
// Opus and GPT-5.5 run xhigh; Sonnet and Gemini Flash run high. Unknown
// families keep their configured suffix unchanged.
function pinnedThinkingLevel(model: string): string | undefined {
	if (/(?:sonnet|gemini.*flash)/i.test(model)) return "high";
	if (/(?:opus|gpt[- ]5\.5)/i.test(model)) return "xhigh";
	return undefined;
}

function withThinking(model: string): string {
	const thinking = pinnedThinkingLevel(model);
	if (!thinking) return model;
	const sep = model.lastIndexOf(":");
	const base = sep > model.lastIndexOf("/") ? model.slice(0, sep) : model;
	return `${base}:${thinking}`;
}

type QaVerdict = "PASS" | "FAIL: implementation" | "FAIL: design";

// Parse a peer verdict from free text per docs/rework-loop.md. Peers
// often state the verdict FIRST on its own line (e.g. "[VERDICT: FAIL:
// implementation]") while the findings prose below mentions other keywords (a
// later "PASS"). So scan lines TOP-DOWN and take the first LINE-ANCHORED
// verdict: a line that starts (after optional "[" and optional "VERDICT:",
// with flexible whitespace after the colon) with PASS or FAIL:
// implementation/design. Only when no line is anchored do we fall back to
// last-keyword-anywhere (legacy free-form returns where the verdict trails).
function parseQaVerdict(text: string): QaVerdict | null {
	const classify = (m: RegExpMatchArray): QaVerdict =>
		m[1] === "design" ? "FAIL: design" : m[1] === "implementation" ? "FAIL: implementation" : "PASS";
	const anchored = /^\s*\[?\s*(?:VERDICT:\s*)?(?:FAIL:\s*(implementation|design)\b|PASS\b)/;
	for (const line of text.split("\n")) {
		const m = line.match(anchored);
		if (m) return classify(m);
	}
	// Fallback: last keyword anywhere (pre-normalization free-form returns).
	const anywhere = /\bFAIL:\s*(implementation|design)\b|\bPASS\b/g;
	let verdict: QaVerdict | null = null;
	for (const m of text.matchAll(anywhere)) verdict = classify(m);
	return verdict;
}

// Auto-appended to every dispatched agent's task (AGENTS.md Delegation Contracts).
const STANDING_CONTRACT_FOOTER =
	"--- standing contract (auto-appended by orchestrator harness) ---\n" +
	"Never delete, move, or overwrite files you did not create unless the task explicitly asks. " +
	"Logs, notes, and unfamiliar artifacts in the working directory belong to the user or the harness — workspace tidying is out of scope. " +
	"Return exactly what the task asks for (a conclusion, a diff, or file:line findings), never a raw dump. " +
	"If graphify-out/graph.json exists in the project, orient with the `graph` tool (query/explain/path/status) before bulk-reading files — it is ~30x cheaper than reading.";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

// Live runtime for a subagent: counts up from startTime while running,
// freezes at endTime once the process exits.
function getElapsedMs(result: { startTime?: number; endTime?: number }): number | undefined {
	if (!result.startTime) return undefined;
	return (result.endTime ?? Date.now()) - result.startTime;
}

// Wall-clock span covering a whole batch (chain/parallel): earliest start to
// latest end (or now, for whatever is still running).
function wallClockElapsedMs(results: Array<{ startTime?: number; endTime?: number }>): number | undefined {
	const starts = results.map((r) => r.startTime).filter((t): t is number => t !== undefined);
	if (starts.length === 0) return undefined;
	const ends = results.map((r) => r.endTime ?? Date.now());
	return Math.max(...ends) - Math.min(...starts);
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
		reasoning?: number;
	},
	model?: string,
	durationMs?: number,
): string {
	const parts: string[] = [];
	if (durationMs !== undefined) parts.push(formatDuration(durationMs));
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.reasoning) parts.push(`think:${formatTokens(usage.reasoning)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) {
		// Model strings carry the thinking level as a trailing ":level" (e.g.
		// "anthropic/claude-opus-4-8:xhigh"); the provider/model uses "/", so the
		// last ":" cleanly separates the thinking level. Show them as distinct
		// fields, mirroring the status-bar footer's "model · thinking".
		const sep = model.lastIndexOf(":");
		if (sep > 0) {
			parts.push(model.slice(0, sep), model.slice(sep + 1));
		} else {
			parts.push(model);
		}
	}
	return parts.join(" ");
}

// Per-subagent status line, mirroring the chrome's status bar + footer for each
// delegated run: gate mode · thinking · context · tokens · cost. Always returns
// a non-empty string for a dispatched run (a pending placeholder still carries
// its gate + model), so pending/just-spawned subagents surface status too.
function formatRunStatus(r: SingleResult): string {
	const usage = formatUsageStats(r.usage, r.model);
	const gate = r.mode ?? "confirm";
	return usage ? `${gate} \u00b7 ${usage}` : gate;
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "find ") + themeFg("accent", pattern) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	reasoning: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	// Write-gate the child inherited at spawn ("write" only when the parent was
	// in write mode). Captured per-run so a replayed session renders the gate the
	// child actually ran under, not the parent's current gate.
	mode?: "write" | "confirm";
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	// Wall-clock runtime: startTime is set the moment the subagent process is
	// spawned; endTime lands once it exits. While endTime is unset the caller
	// should treat the subagent as still running and compute elapsed live.
	startTime?: number;
	endTime?: number;
}

interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

function isFailedResult(result: SingleResult): boolean {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

// A run is in progress until its subprocess exits (endTime lands). A pending
// parallel placeholder (exitCode -1, never started) also counts as in progress;
// an unknown-agent failure (exitCode 1, never started, no endTime) does NOT.
function runInProgress(result: SingleResult): boolean {
	if (result.endTime !== undefined) return false;
	if (result.startTime !== undefined) return true;
	return result.exitCode === -1;
}

function getResultOutput(result: SingleResult): string {
	if (isFailedResult(result)) {
		return result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
	}
	return getFinalOutput(result.messages) || "(no output)";
}

function truncateParallelOutput(output: string): string {
	const byteLength = Buffer.byteLength(output, "utf8");
	if (byteLength <= PER_TASK_OUTPUT_CAP) return output;

	let truncated = output.slice(0, PER_TASK_OUTPUT_CAP);
	while (Buffer.byteLength(truncated, "utf8") > PER_TASK_OUTPUT_CAP) {
		truncated = truncated.slice(0, -1);
	}
	return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

interface SubagentRunRef {
	entryId?: string;
	mode: SubagentDetails["mode"];
	batchSize: number;
	resultIndex: number;
	result: SingleResult;
}

interface ActiveSubagentMeta {
	mode: SubagentDetails["mode"];
	batchSize: number;
	resultIndex: number;
}

const ACTIVE_SUBAGENT_RUNS = new Map<string, SubagentRunRef>();
const ACTIVE_SUBAGENT_LISTENERS = new Set<() => void>();
// Every currently-open panel. Populated in the constructor, drained in
// dispose(). pi's overlay system exposes no teardown callback when a custom UI
// is dismissed externally (tui.hideOverlay() without resolving the
// ctx.ui.custom() promise), so the session_shutdown handler in the extension
// factory disposes every panel here — that fires on quit/reload/new/resume/fork,
// precisely the external paths that pop the overlay without done(). Residual
// gap: an overlay dismissed by a hypothetical future external path that is
// neither done() nor a session replacement would keep one listener+timer alive
// until session end — accepted, bounded by session lifetime.
const OPEN_SUBAGENT_PANELS = new Set<ActiveSubagentPanel>();
let nextActiveSubagentId = 1;

function notifyActiveSubagentListeners(): void {
	for (const listener of ACTIVE_SUBAGENT_LISTENERS) {
		try {
			listener();
		} catch {
			/* ignore dead UI listeners */
		}
	}
}

function getActiveSubagentRunRefs(): SubagentRunRef[] {
	return Array.from(ACTIVE_SUBAGENT_RUNS.values()).sort((a, b) => (b.result.startTime ?? 0) - (a.result.startTime ?? 0));
}

function scheduleActiveSubagentRemoval(id: string, result: SingleResult): void {
	const timer = setTimeout(() => {
		if (ACTIVE_SUBAGENT_RUNS.get(id)?.result !== result) return;
		ACTIVE_SUBAGENT_RUNS.delete(id);
		notifyActiveSubagentListeners();
	}, 3000);
	(timer as { unref?: () => void }).unref?.();
}

const SHELL_TEXT_CAP = 24 * 1024;

function truncateShellText(text: string, maxBytes = SHELL_TEXT_CAP): string {
	const bytes = Buffer.byteLength(text, "utf8");
	if (bytes <= maxBytes) return text;
	let truncated = text.slice(0, maxBytes);
	while (Buffer.byteLength(truncated, "utf8") > maxBytes) truncated = truncated.slice(0, -1);
	return `${truncated}\n\n[truncated: ${bytes - Buffer.byteLength(truncated, "utf8")} bytes omitted]`;
}

function oneLine(text: string, maxChars = 90): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > maxChars ? `${flat.slice(0, maxChars - 3)}...` : flat;
}

function isSubagentDetails(value: unknown): value is SubagentDetails {
	return Boolean(value && typeof value === "object" && Array.isArray((value as { results?: unknown }).results));
}

function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			const p = part as { type?: string; text?: string; mimeType?: string; data?: string };
			if (p.type === "text") return p.text ?? "";
			if (p.type === "image") return `[image: ${p.mimeType ?? "unknown"}, ${p.data?.length ?? 0} base64 chars]`;
			return "";
		})
		.filter(Boolean)
		.join("\n\n");
}

function fenced(text: string, language = ""): string {
	let fence = "```";
	while (text.includes(fence)) fence += "`";
	return `${fence}${language}\n${text}\n${fence}`;
}

function jsonBlock(value: unknown): string {
	try {
		return fenced(truncateShellText(JSON.stringify(value, null, 2) ?? "null"), "json");
	} catch (error) {
		return fenced(`(unserializable: ${error instanceof Error ? error.message : String(error)})`, "text");
	}
}

function runStatusWord(result: SingleResult): string {
	if (runInProgress(result)) return "running";
	return isFailedResult(result) ? "failed" : "completed";
}

function getSubagentRunRefs(sessionManager: { getBranch(): unknown[] }): SubagentRunRef[] {
	const refs: SubagentRunRef[] = [];
	for (const entry of sessionManager.getBranch()) {
		const e = entry as { type?: string; id?: string; message?: { role?: string; toolName?: string; details?: unknown } };
		if (e.type !== "message" || e.message?.role !== "toolResult" || e.message.toolName !== "subagent") continue;
		if (!isSubagentDetails(e.message.details)) continue;
		const details = e.message.details;
		details.results.forEach((result, resultIndex) => {
			refs.push({ entryId: e.id, mode: details.mode, batchSize: details.results.length, resultIndex, result });
		});
	}
	return refs.reverse();
}

function subagentRunLabel(ref: SubagentRunRef, index: number): string {
	const result = ref.result;
	const elapsed = getElapsedMs(result);
	const modeSuffix = ref.batchSize > 1 ? ` · ${ref.mode} ${ref.resultIndex + 1}/${ref.batchSize}` : "";
	const elapsedSuffix = elapsed === undefined ? "" : ` · ${formatDuration(elapsed)}`;
	return `${index + 1}. ${result.agent} · ${runStatusWord(result)}${modeSuffix}${elapsedSuffix} · ${oneLine(result.task)}`;
}

function findSubagentRun(refs: SubagentRunRef[], query: string): SubagentRunRef | undefined {
	const q = query.trim().toLowerCase();
	if (!q || q === "latest") return refs[0];
	if (/^#?\d+$/.test(q)) return refs[Number.parseInt(q.replace(/^#/, ""), 10) - 1];
	return refs.find((ref, index) => {
		const agent = ref.result.agent.toLowerCase();
		return agent === q || subagentRunLabel(ref, index).toLowerCase().includes(q);
	});
}

function formatSubagentShell(ref: SubagentRunRef): string {
	const result = ref.result;
	let assistantTurns = 0;
	let thinkingBlocks = 0;
	let toolCalls = 0;
	let toolResults = 0;
	for (const msg of result.messages) {
		if (msg.role === "assistant") {
			assistantTurns++;
			for (const part of msg.content) {
				if (part.type === "thinking") thinkingBlocks++;
				else if (part.type === "toolCall") toolCalls++;
			}
		} else if (msg.role === "toolResult") {
			toolResults++;
		}
	}

	const lines: string[] = [];
	lines.push(`# Subagent shell: ${result.agent}`);
	lines.push("");
	lines.push(`- Status: ${runStatusWord(result)}`);
	lines.push(`- Source: ${result.agentSource}`);
	lines.push(`- Batch: ${ref.mode} ${ref.resultIndex + 1}/${ref.batchSize}`);
	lines.push(`- Entry: ${ref.entryId ?? "unknown"}`);
	const elapsedMs = getElapsedMs(result);
	lines.push(`- Runtime: ${elapsedMs === undefined ? "unknown" : formatDuration(elapsedMs)}`);
	lines.push(`- Stats: ${formatRunStatus(result)}`);
	lines.push(`- Transcript: ${result.messages.length} messages · ${assistantTurns} assistant turns · ${thinkingBlocks} thinking blocks · ${toolCalls} tool calls · ${toolResults} tool results`);
	if (result.stopReason) lines.push(`- Stop reason: ${result.stopReason}`);
	if (result.errorMessage) lines.push(`- Error: ${result.errorMessage}`);
	lines.push("");
	lines.push("## Task");
	lines.push("");
	lines.push(result.task || "(no task)");
	lines.push("");
	lines.push("## Transcript");
	if (thinkingBlocks === 0) lines.push("\n> No provider-visible thinking blocks were captured for this run.");
	if (result.messages.length === 0) lines.push("\n(no transcript captured)");

	let assistantIndex = 0;
	for (const msg of result.messages) {
		if (msg.role === "user") {
			lines.push("\n### User");
			lines.push(truncateShellText(contentToText(msg.content) || "(empty)"));
			continue;
		}

		if (msg.role === "assistant") {
			assistantIndex++;
			lines.push(`\n### Assistant turn ${assistantIndex}`);
			for (const part of msg.content) {
				if (part.type === "thinking") {
					const marker = part.redacted ? " (redacted)" : "";
					lines.push(`\n#### Thinking${marker}`);
					lines.push(truncateShellText(part.thinking?.trim() || "(no visible thinking text; signature may be preserved)"));
				} else if (part.type === "text") {
					lines.push("\n#### Text");
					lines.push(truncateShellText(part.text.trim() || "(empty)"));
				} else if (part.type === "toolCall") {
					lines.push(`\n#### Tool call: ${part.name}`);
					lines.push(jsonBlock(part.arguments));
				}
			}
			if (msg.diagnostics?.length) {
				lines.push("\n#### Diagnostics");
				lines.push(jsonBlock(msg.diagnostics));
			}
			const usage = msg.usage
				? formatUsageStats(
						{
							input: msg.usage.input || 0,
							output: msg.usage.output || 0,
							reasoning: msg.usage.reasoning || 0,
							cacheRead: msg.usage.cacheRead || 0,
							cacheWrite: msg.usage.cacheWrite || 0,
							cost: msg.usage.cost?.total || 0,
							contextTokens: msg.usage.totalTokens || 0,
							turns: 1,
						},
						msg.model,
					)
				: "";
			if (usage) lines.push(`\n_Usage: ${usage}_`);
			continue;
		}

		if (msg.role === "toolResult") {
			lines.push(`\n### Tool result: ${msg.toolName}${msg.isError ? " (error)" : ""}`);
			lines.push(truncateShellText(contentToText(msg.content) || "(empty)"));
			if (msg.details !== undefined) {
				lines.push("\n#### Details");
				lines.push(jsonBlock(msg.details));
			}
		}
	}

	if (result.stderr.trim()) {
		lines.push("\n## Stderr");
		lines.push(fenced(truncateShellText(result.stderr.trim()), "text"));
	}
	return lines.join("\n");
}

// Detail-view body height used only when the terminal viewport size is
// unreported. ponytail: constant fallback; the live height derives from
// tui.terminal.rows in ActiveSubagentPanel.bodyHeight().
const DETAIL_FALLBACK_BODY_LINES = 28;

// Extracted from the former inline ctx.ui.custom() literal: the keyboard panel
// for live/recent subagent runs. Owns its own list/detail/scroll state, its
// data-change listener registration, a spinner-animation timer, and a
// formatSubagentShell() line cache. render() is pure (no state persisted); all
// clamping happens in handleInput or as local copies inside render.
class ActiveSubagentPanel {
	private selected = 0;
	private detail = false;
	private scroll = 0;
	private readonly onDataChange: () => void;
	private readonly spinnerTimer: ReturnType<typeof setInterval>;
	private disposed = false;
	// Cache of formatSubagentShell(ref) split into lines, keyed by ref identity
	// plus (messages.length + endTime) — the only inputs that grow a run's
	// transcript. Rebuilt when the selected ref or that key changes; the built
	// string carries no theme colors, so it survives theme invalidate().
	private cacheRef?: SubagentRunRef;
	private cacheKey = "";
	private cacheLines: string[] = [];

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly done: () => void,
	) {
		// Re-render whenever run data changes; the outer function used to juggle
		// this via closure mutation — now the panel registers/unregisters itself.
		// Self-defending: if it fires after disposal it removes itself from the Set
		// and no-ops. A run-set change is also the moment the spinner timer must
		// start/stop (finding 2: no longer driven from render()).
		this.onDataChange = () => {
			if (this.disposed) {
				ACTIVE_SUBAGENT_LISTENERS.delete(this.onDataChange);
				return;
			}
			this.tui.requestRender();
		};
		ACTIVE_SUBAGENT_LISTENERS.add(this.onDataChange);
		// One always-on housekeeping tick for the whole panel lifetime: it just
		// asks for a re-render so the in-progress spinner animates smoothly. No
		// liveness tracking needed — disposal is deterministic (done() or
		// session_shutdown), and the interval is bounded by panel lifetime, so a
		// panel-lifetime interval at SPINNER_INTERVAL_MS is acceptable.
		this.spinnerTimer = setInterval(() => this.tui.requestRender(), SPINNER_INTERVAL_MS);
		(this.spinnerTimer as { unref?: () => void }).unref?.();
		OPEN_SUBAGENT_PANELS.add(this);
	}

	// Detail body height: derive from the terminal viewport (the overlay caps at
	// maxHeight 85%), minus fixed chrome (title, separator, detail header) and the
	// margin. Falls back to a constant if the terminal reports no usable size.
	private bodyHeight(): number {
		const rows = this.tui.terminal?.rows ?? 0;
		if (rows < 12) return DETAIL_FALLBACK_BODY_LINES;
		return Math.max(8, Math.floor(rows * 0.85) - 5);
	}

	private detailLines(ref: SubagentRunRef): string[] {
		const key = `${ref.result.messages.length}:${ref.result.endTime ?? ""}`;
		if (this.cacheRef !== ref || this.cacheKey !== key) {
			this.cacheRef = ref;
			this.cacheKey = key;
			this.cacheLines = formatSubagentShell(ref).split("\n");
		}
		return this.cacheLines;
	}

	render(width: number): string[] {
		const theme = this.theme;
		const refs = getActiveSubagentRunRefs();
		// Local clamped copy — render never persists state.
		const selected = Math.min(this.selected, Math.max(0, refs.length - 1));
		const lines: string[] = [];
		const controls = this.detail
			? "↑↓/Pg scroll • enter list • esc close"
			: "↑↓ select • enter details • esc close";
		lines.push(theme.fg("toolTitle", theme.bold("Active subagents")) + theme.fg("dim", `  ${controls}`));
		lines.push(theme.fg("dim", "─".repeat(Math.max(1, Math.min(width, 120)))));

		if (refs.length === 0) {
			lines.push(theme.fg("muted", "No active subagents."));
			return lines.map((line) => truncateToWidth(line, width));
		}

		if (!this.detail) {
			refs.forEach((ref, index) => {
				const r = ref.result;
				const marker = index === selected ? theme.fg("accent", "›") : " ";
				const icon = runInProgress(r)
					? theme.fg("accent", SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length])
					: isFailedResult(r)
						? theme.fg("error", "✗")
						: theme.fg("success", "✓");
				const elapsed = getElapsedMs(r);
				const stats = formatRunStatus(r);
				lines.push(
					`${marker} ${icon} ${theme.fg("accent", r.agent)} ${theme.fg("muted", `${ref.mode} ${ref.resultIndex + 1}/${ref.batchSize}`)} ${theme.fg("dim", elapsed === undefined ? "" : formatDuration(elapsed))}`,
				);
				lines.push(theme.fg("dim", `  ${oneLine(r.task, 110)}`));
				if (stats) lines.push(theme.fg("dim", `  ${stats}`));
			});
			return lines.map((line) => truncateToWidth(line, width));
		}

		const ref = refs[selected];
		if (!ref) return lines.map((line) => truncateToWidth(line, width));
		const raw = this.detailLines(ref);
		const bodyLines = this.bodyHeight();
		const scroll = Math.max(0, Math.min(this.scroll, Math.max(0, raw.length - bodyLines)));
		lines.push(theme.fg("accent", `${ref.result.agent} · ${runStatusWord(ref.result)} · ${scroll + 1}-${Math.min(raw.length, scroll + bodyLines)}/${raw.length}`));
		for (const line of raw.slice(scroll, scroll + bodyLines)) lines.push(line || " ");
		return lines.map((line) => truncateToWidth(line, width));
	}

	invalidate(): void {
		// No pre-baked theme colors are cached (formatSubagentShell emits none), so
		// there is nothing to rebuild on theme change.
	}

	handleInput(data: string): void {
		const refs = getActiveSubagentRunRefs();
		// Clamp on each keypress so a run removed while the panel is open can't leave
		// selected past the end (formerly clamped in render()).
		this.selected = Math.min(this.selected, Math.max(0, refs.length - 1));
		if (matchesKey(data, Key.escape) || data === "q") {
			this.done();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.detail = !this.detail;
			this.scroll = 0;
		} else if (this.detail) {
			const ref = refs[this.selected];
			const maxScroll = ref ? Math.max(0, this.detailLines(ref).length - this.bodyHeight()) : 0;
			if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
			else if (matchesKey(data, Key.down)) this.scroll = Math.min(maxScroll, this.scroll + 1);
			else if (matchesKey(data, Key.pageUp)) this.scroll = Math.max(0, this.scroll - 10);
			else if (matchesKey(data, Key.pageDown)) this.scroll = Math.min(maxScroll, this.scroll + 10);
			else if (matchesKey(data, Key.left)) this.detail = false;
		} else {
			if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
			else if (matchesKey(data, Key.down)) this.selected = Math.min(Math.max(0, refs.length - 1), this.selected + 1);
		}
		this.tui.requestRender();
	}

	// Idempotent teardown: called by the ctx.ui.custom() finally on the normal
	// Esc/q path and by the session_shutdown handler on external teardown.
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		ACTIVE_SUBAGENT_LISTENERS.delete(this.onDataChange);
		clearInterval(this.spinnerTimer);
		OPEN_SUBAGENT_PANELS.delete(this);
	}
}

async function showActiveSubagentPanel(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Active subagent panel is only available in the TUI.", "warning");
		return;
	}

	let panel: ActiveSubagentPanel | undefined;
	try {
		await ctx.ui.custom<void>(
			(tui, theme, _keybindings, done) => {
				panel = new ActiveSubagentPanel(tui, theme, done);
				return panel;
			},
			{ overlay: true, overlayOptions: { anchor: "right-center", width: "80%", maxHeight: "85%", margin: 1 } },
		);
	} finally {
		// Normal path (Esc/q → done()): pi resolves the custom promise and this
		// finally disposes; dispose() is idempotent. External teardown
		// (resetExtensionUI → tui.hideOverlay()) never resolves this promise nor
		// calls dispose(), so the finally never runs there — that gap is covered
		// deterministically by the session_shutdown handler, which disposes every
		// panel in OPEN_SUBAGENT_PANELS. See the extension factory below.
		panel?.dispose();
	}
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	activeMeta?: ActiveSubagentMeta,
): Promise<SingleResult> {
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step,
		};
	}

	// Inherit the parent's write gate (published by extensions/read-only-default.ts).
	// Only a parent in write mode grants children --write; otherwise children
	// start headless in confirm mode, where writes are blocked. Even with --write,
	// the child gate auto-approves mutations only under ~/.pi.
	const childGate: "write" | "confirm" =
		(globalThis as { __piWriteGateMode?: string }).__piWriteGateMode === "write" ? "write" : "confirm";
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (childGate === "write") {
		args.push("--write");
	}
	const childModel = agent.model ? withThinking(agent.model) : undefined;
	if (childModel) args.push("--model", childModel);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	if (agent.noContextFiles) args.push("--no-context-files");

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: childModel,
		mode: childGate,
		step,
	};

	const activeId = activeMeta ? `active-${nextActiveSubagentId++}` : undefined;
	const syncActive = () => {
		if (!activeId || !activeMeta) return;
		ACTIVE_SUBAGENT_RUNS.set(activeId, { entryId: activeId, ...activeMeta, result: currentResult });
		notifyActiveSubagentListeners();
	};

	const emitUpdate = () => {
		syncActive();
		if (onUpdate) {
			onUpdate({
				content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
				details: makeDetails([currentResult]),
			});
		}
	};

	// Tick once a second so the runtime timer keeps counting up in the UI
	// even while the subagent is quiet (e.g. mid tool-call, no new messages).
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}\n\n${STANDING_CONTRACT_FOOTER}`);
		let wasAborted = false;

		currentResult.startTime = Date.now();
		tickTimer = setInterval(emitUpdate, 1000);
		emitUpdate();

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				// Mark children so sibling extensions can exempt them (e.g. the fable
				// edit-blocker in read-only-default.ts): fable-engineer children run
				// claude-fable-5 and MUST write.
				env: { ...process.env, PI_SUBAGENT: "1" },
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.reasoning += usage.reasoning || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		currentResult.endTime = Date.now();
		// On interrupt, return the partial transcript instead of throwing it away —
		// isFailedResult keys off stopReason, so the lead sees everything the subagent
		// did (files written/committed, reasoning) before the kill and can resume.
		if (wasAborted) {
			currentResult.stopReason = "aborted";
			if (!currentResult.errorMessage) currentResult.errorMessage = "Interrupted by user (partial work preserved below)";
		}
		return currentResult;
	} finally {
		if (tickTimer) clearInterval(tickTimer);
		if (!currentResult.endTime) currentResult.endTime = Date.now();
		syncActive();
		if (activeId) scheduleActiveSubagentRemoval(activeId, currentResult);
		if (tmpPromptPath)
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				/* ignore */
			}
		if (tmpPromptDir)
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				/* ignore */
			}
	}
}

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
});

export default function (pi: ExtensionAPI) {
	// Consecutive peer FAIL verdicts this session (AGENTS.md Rework Loop
	// budget). Persisted via the custom-entry pattern and replayed on
	// session_start, exactly like the write-gate mode in read-only-default.ts.
	// ponytail: session-level consecutive counter, not per-work-item; if
	// concurrent work items ever need independent budgets, key this by work-item
	// id (Map<string, number>) instead of a single scalar.
	let reworkFailCount = 0;

	function persistReworkCount(): void {
		try {
			pi.appendEntry<{ count: number }>("rework-loop-count", { count: reworkFailCount });
		} catch {
			/* fail open: never let persistence crash the return path */
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			reworkFailCount = 0;
			const last = ctx.sessionManager
				.getEntries()
				.filter(
					(e): e is typeof e & { customType: string; data?: { count?: number } } =>
						e.type === "custom" && (e as { customType?: string }).customType === "rework-loop-count",
				)
				.pop();
			if (typeof last?.data?.count === "number") reworkFailCount = last.data.count;
		} catch {
			/* fail open */
		}
	});

	// Deterministic external-teardown cleanup for the active-subagents panel.
	// session_shutdown fires on quit, /reload, /new, /resume, and /fork — the
	// external paths that tear down custom UI (tui.hideOverlay()) without
	// resolving the ctx.ui.custom() promise, so the finally-based dispose() never
	// runs there. dispose() is idempotent, so double-firing with the finally is
	// harmless.
	pi.on("session_shutdown", async () => {
		for (const panel of Array.from(OPEN_SUBAGENT_PANELS)) panel.dispose();
	});

	// Normalize a peer return: prepend a [VERDICT: ...] first line parsed
	// from the peer's text (docs/rework-loop.md), maintain the session FAIL
	// budget, and flag exhaustion at 3. No-op for every other agent. Fails open.
	function finalizeQaOutput(agentName: string, text: string): string {
		if (agentName !== "peer") return text;
		try {
			const verdict = parseQaVerdict(text);
			let header: string;
			if (verdict === null) {
				header =
					"[VERDICT: MISSING — malformed peer return; a structured verdict (PASS / FAIL: implementation / FAIL: design) is required. Re-dispatch the review.]";
			} else if (verdict === "PASS") {
				reworkFailCount = 0;
				persistReworkCount();
				header = "[VERDICT: PASS]";
			} else {
				reworkFailCount++;
				persistReworkCount();
				header = `[VERDICT: ${verdict}]`;
				if (reworkFailCount >= 3) {
					header +=
						"\n[LOOP BUDGET EXHAUSTED: 3 consecutive FAIL verdicts this session — stop looping; re-frame the problem or escalate to the user per AGENTS.md Rework Loop.]";
				}
			}
			return `${header}\n\n${text}`;
		} catch {
			return text; // fail open: never let verdict handling crash the return
		}
	}

	pi.registerCommand("subagent-shell", {
		description: "Inspect a subagent run: transcript, thinking blocks, tool results, and stats",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const refs = getSubagentRunRefs(ctx.sessionManager);
			if (refs.length === 0) {
				if (ctx.hasUI) ctx.ui.notify("No subagent runs in this branch.", "warning");
				else console.error("No subagent runs in this branch.");
				return;
			}

			let ref: SubagentRunRef | undefined;
			if (!args.trim() && refs.length > 1 && ctx.hasUI) {
				const labels = refs.map(subagentRunLabel);
				const choice = await ctx.ui.select("Enter subagent shell:", labels);
				if (!choice) return;
				ref = refs[labels.indexOf(choice)];
			} else {
				ref = findSubagentRun(refs, args);
			}

			if (!ref) {
				const hint = refs.map((r, i) => subagentRunLabel(r, i)).join("\n");
				if (ctx.hasUI) ctx.ui.notify(`No subagent run matches "${args}". Try /subagent-shell latest or a number.`, "warning");
				else console.error(`No subagent run matches "${args}".\n${hint}`);
				return;
			}

			const transcript = formatSubagentShell(ref);
			if (ctx.hasUI) await ctx.ui.editor(`Subagent shell: ${ref.result.agent}`, transcript);
			else console.log(transcript);
		},
	});

	pi.registerCommand("subagents", {
		description: "Open the active subagents keyboard panel",
		handler: async (_args, ctx) => showActiveSubagentPanel(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("s"), {
		description: "Open active subagents panel",
		handler: async (ctx) => showActiveSubagentPanel(ctx),
	});

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to specialized subagents with isolated context.",
			"Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
			`Default agent scope is "user" (from ${path.join(getAgentDir(), "agents")}).`,
			`To enable project-local agents in ${CONFIG_DIR_NAME}/agents, set agentScope: "both" (or "project").`,
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (isSonnetModel(ctx.model)) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: "Subagent delegation is disabled while the current model is Sonnet — Sonnet is already the mechanical/worker tier, so further delegation is redundant. Switch to a higher-tier model (e.g. claude-opus-4-8 or claude-fable-5) to use the subagent tool.",
						},
					],
					details: { mode: "single", agentScope: params.agentScope ?? "user", projectAgentsDir: null, results: [] },
				};
			}
			const agentScope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? true;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): SubagentDetails => ({
					mode,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
					results,
				});

			if (modeCount !== 1) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}`,
						},
					],
					details: makeDetails("single")([]),
				};
			}

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const requestedAgentNames = new Set<string>();
				if (params.chain) for (const step of params.chain) requestedAgentNames.add(step.agent);
				if (params.tasks) for (const t of params.tasks) requestedAgentNames.add(t.agent);
				if (params.agent) requestedAgentNames.add(params.agent);

				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
					const names = projectAgentsRequested.map((a) => a.name).join(", ");
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return {
							content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
							details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([]),
						};
				}
			}

			if (params.chain && params.chain.length > 0) {
				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);

					// Create update callback that includes all previous results
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								// Combine completed results with current streaming result
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									const allResults = [...results, currentResult];
									onUpdate({
										content: partial.content,
										details: makeDetails("chain")(allResults),
									});
								}
							}
						: undefined;

					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						step.agent,
						taskWithContext,
						step.cwd,
						i + 1,
						signal,
						chainUpdate,
						makeDetails("chain"),
						{ mode: "chain", batchSize: params.chain.length, resultIndex: i },
					);
					results.push(result);

					const isError = isFailedResult(result);
					if (isError) {
						const errorMsg = getResultOutput(result);
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
							details: makeDetails("chain")(results),
							isError: true,
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}
				const lastResult = results[results.length - 1];
				return {
					content: [
						{ type: "text", text: finalizeQaOutput(lastResult.agent, getFinalOutput(lastResult.messages) || "(no output)") },
					],
					details: makeDetails("chain")(results),
				};
			}

			if (params.tasks && params.tasks.length > 0) {
				const tasks = params.tasks;
				if (tasks.length > MAX_PARALLEL_TASKS)
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
							},
						],
						details: makeDetails("parallel")([]),
					};

				// Track all results for streaming updates
				const allResults: SingleResult[] = new Array(tasks.length);

				// Initialize placeholder results. Seed each with the resolved model and
				// write gate so a PENDING subagent still renders its status-bar data
				// (mode · thinking) before its subprocess emits any usage.
				const pendingGate: "write" | "confirm" =
					(globalThis as { __piWriteGateMode?: string }).__piWriteGateMode === "write" ? "write" : "confirm";
				for (let i = 0; i < tasks.length; i++) {
					const task = tasks[i];
					allResults[i] = {
						agent: task.agent,
						agentSource: "unknown",
						task: task.task,
						exitCode: -1, // -1 = still running
						messages: [],
						stderr: "",
						usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
						model: withThinking(agents.find((a) => a.name === task.agent)?.model ?? "") || undefined,
						mode: pendingGate,
					};
				}

				const emitParallelUpdate = () => {
					if (onUpdate) {
						const running = allResults.filter((r) => r.exitCode === -1).length;
						const done = allResults.filter((r) => r.exitCode !== -1).length;
						onUpdate({
							content: [
								{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` },
							],
							details: makeDetails("parallel")([...allResults]),
						});
					}
				};

				const results = await mapWithConcurrencyLimit(tasks, MAX_CONCURRENCY, async (t, index) => {
					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						t.agent,
						t.task,
						t.cwd,
						undefined,
						signal,
						// Per-task update callback
						(partial) => {
							if (partial.details?.results[0]) {
								allResults[index] = partial.details.results[0];
								emitParallelUpdate();
							}
						},
						makeDetails("parallel"),
						{ mode: "parallel", batchSize: tasks.length, resultIndex: index },
					);
					allResults[index] = result;
					emitParallelUpdate();
					return result;
				});

				const successCount = results.filter((r) => !isFailedResult(r)).length;
				const summaries = results.map((r) => {
					const rawOutput = getResultOutput(r);
					const output = truncateParallelOutput(isFailedResult(r) ? rawOutput : finalizeQaOutput(r.agent, rawOutput));
					const status = isFailedResult(r)
						? `failed${r.stopReason && r.stopReason !== "end" ? ` (${r.stopReason})` : ""}`
						: "completed";
					return `### [${r.agent}] ${status}\n\n${output}`;
				});
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n---\n\n")}`,
						},
					],
					details: makeDetails("parallel")(results),
				};
			}

			if (params.agent && params.task) {
				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					params.agent,
					params.task,
					params.cwd,
					undefined,
					signal,
					onUpdate,
					makeDetails("single"),
					{ mode: "single", batchSize: 1, resultIndex: 0 },
				);
				const isError = isFailedResult(result);
				if (isError) {
					const errorMsg = getResultOutput(result);
					return {
						content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
						details: makeDetails("single")([result]),
						isError: true,
					};
				}
				return {
					content: [
						{ type: "text", text: finalizeQaOutput(result.agent, getFinalOutput(result.messages) || "(no output)") },
					],
					details: makeDetails("single")([result]),
				};
			}

			const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
			return {
				content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "user";
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`) +
					theme.fg("muted", ` [${scope}]`);
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					// Clean up {previous} placeholder for display
					const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
					const preview = cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
					text +=
						"\n  " +
						theme.fg("muted", `${i + 1}.`) +
						" " +
						theme.fg("accent", step.agent) +
						theme.fg("dim", ` ${preview}`);
				}
				if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `parallel (${args.tasks.length} tasks)`) +
					theme.fg("muted", ` [${scope}]`);
				for (const t of args.tasks.slice(0, 3)) {
					const preview = t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
					text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview}`)}`;
				}
				if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			const agentName = args.agent || "...";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as SubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();

			// Animate the "working" glyph for any in-progress run; freeze to ✓/✗ once
			// done. Drive the animation by re-invalidating this tool row on an interval
			// (pi-tui's Loader animates the same way via requestRender). The timer lives
			// in the persistent per-row render state and is cleared the instant nothing
			// is running — including the final done-render — so it never leaks.
			const spinner = () =>
				theme.fg("accent", SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length]);
			const spinnerState = _context.state as { spinnerTimer?: ReturnType<typeof setInterval> };
			if (details.results.some(runInProgress)) {
				if (!spinnerState.spinnerTimer) {
					const invalidate = _context.invalidate;
					spinnerState.spinnerTimer = setInterval(invalidate, SPINNER_INTERVAL_MS);
				}
			} else if (spinnerState.spinnerTimer) {
				clearInterval(spinnerState.spinnerTimer);
				spinnerState.spinnerTimer = undefined;
			}

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (details.mode === "single" && details.results.length === 1) {
				const r = details.results[0];
				const isError = isFailedResult(r);
				const icon = runInProgress(r)
					? spinner()
					: isError
						? theme.fg("error", "✗")
						: theme.fg("success", "✓");
				const displayItems = getDisplayItems(r.messages);
				const finalOutput = getFinalOutput(r.messages);
				const elapsedMs = getElapsedMs(r);
				const elapsedSuffix = elapsedMs !== undefined ? theme.fg("dim", ` · ${formatDuration(elapsedMs)}`) : "";

				if (expanded) {
					const container = new Container();
					let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}${elapsedSuffix}`;
					if (isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && r.errorMessage)
						container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall")
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
					}
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", formatRunStatus(r)), 0, 0));
					return container;
				}

				let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}${elapsedSuffix}`;
				if (isError && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				if (isError && r.errorMessage) text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
				else if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
				else {
					text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
					if (displayItems.length > COLLAPSED_ITEM_COUNT) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
				text += `\n${theme.fg("dim", formatRunStatus(r))}`;
				return new Text(text, 0, 0);
			}

			const aggregateUsage = (results: SingleResult[]) => {
				const total = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
				for (const r of results) {
					total.input += r.usage.input || 0;
					total.output += r.usage.output || 0;
					total.reasoning += r.usage.reasoning || 0;
					total.cacheRead += r.usage.cacheRead || 0;
					total.cacheWrite += r.usage.cacheWrite || 0;
					total.cost += r.usage.cost || 0;
					total.turns += r.usage.turns || 0;
				}
				return total;
			};

			if (details.mode === "chain") {
				const successCount = details.results.filter((r) => r.exitCode === 0).length;
				const icon = details.results.some(runInProgress)
					? spinner()
					: successCount === details.results.length
						? theme.fg("success", "✓")
						: theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							icon +
								" " +
								theme.fg("toolTitle", theme.bold("chain ")) +
								theme.fg("accent", `${successCount}/${details.results.length} steps`),
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon = runInProgress(r)
							? spinner()
							: r.exitCode === 0
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);
						const rElapsed = getElapsedMs(r);
						const rElapsedSuffix = rElapsed !== undefined ? theme.fg("dim", ` · ${formatDuration(rElapsed)}`) : "";

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								`${theme.fg("muted", `─── Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rIcon}${rElapsedSuffix}`,
								0,
								0,
							),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						container.addChild(new Text(theme.fg("dim", formatRunStatus(r)), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results), undefined, wallClockElapsedMs(details.results));
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
					}
					return container;
				}

				// Collapsed view
				let text =
					icon +
					" " +
					theme.fg("toolTitle", theme.bold("chain ")) +
					theme.fg("accent", `${successCount}/${details.results.length} steps`);
				for (const r of details.results) {
					const rIcon = runInProgress(r)
						? spinner()
						: r.exitCode === 0
							? theme.fg("success", "✓")
							: theme.fg("error", "✗");
					const displayItems = getDisplayItems(r.messages);
					const rElapsed = getElapsedMs(r);
					const rElapsedSuffix = rElapsed !== undefined ? theme.fg("dim", ` · ${formatDuration(rElapsed)}`) : "";
					text += `\n\n${theme.fg("muted", `─── Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}${rElapsedSuffix}`;
					if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
					text += `\n${theme.fg("dim", formatRunStatus(r))}`;
				}
				const usageStr = formatUsageStats(aggregateUsage(details.results), undefined, wallClockElapsedMs(details.results));
				if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter(runInProgress).length;
				const successCount = details.results.filter((r) => !runInProgress(r) && !isFailedResult(r)).length;
				const failCount = details.results.filter((r) => !runInProgress(r) && isFailedResult(r)).length;
				const isRunning = running > 0;
				const icon = isRunning
					? spinner()
					: failCount > 0
						? theme.fg("warning", "◐")
						: theme.fg("success", "✓");
				const batchElapsed = wallClockElapsedMs(details.results);
				const batchElapsedSuffix = batchElapsed !== undefined ? ` · ${formatDuration(batchElapsed)}` : "";
				const status = isRunning
					? `${successCount + failCount}/${details.results.length} done, ${running} running${batchElapsedSuffix}`
					: `${successCount}/${details.results.length} tasks${batchElapsedSuffix}`;

				if (expanded && !isRunning) {
					const container = new Container();
					container.addChild(
						new Text(
							`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`,
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon = isFailedResult(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);
						const rElapsed = getElapsedMs(r);
						const rElapsedSuffix = rElapsed !== undefined ? theme.fg("dim", ` · ${formatDuration(rElapsed)}`) : "";

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(`${theme.fg("muted", "─── ") + theme.fg("accent", r.agent)} ${rIcon}${rElapsedSuffix}`, 0, 0),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						container.addChild(new Text(theme.fg("dim", formatRunStatus(r)), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results), undefined, batchElapsed);
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
					}
					return container;
				}

				// Collapsed view (or still running)
				let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
				for (const r of details.results) {
					const rIcon = runInProgress(r)
						? spinner()
						: isFailedResult(r)
							? theme.fg("error", "✗")
							: theme.fg("success", "✓");
					const displayItems = getDisplayItems(r.messages);
					const rElapsed = getElapsedMs(r);
					const rElapsedSuffix = rElapsed !== undefined ? theme.fg("dim", ` · ${formatDuration(rElapsed)}`) : "";
					text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}${rElapsedSuffix}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", runInProgress(r) ? "(running...)" : "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
					text += `\n${theme.fg("dim", formatRunStatus(r))}`;
				}
				if (!isRunning) {
					const usageStr = formatUsageStats(aggregateUsage(details.results), undefined, batchElapsed);
					if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});
}
