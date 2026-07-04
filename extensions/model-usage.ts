/**
 * Model Usage Extension
 *
 * /usage opens a small menu and renders a per-model token/cost breakdown.
 * Scopes: current branch, current project, today, or every stored pi session.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fmtTokens } from "./lib/format.ts";

type Scope = "current" | "project" | "today" | "all";

interface UsageBucket {
	provider: string;
	model: string;
	turns: number;
	runs: number;
	input: number;
	output: number;
	reasoning: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
	firstMs?: number;
	lastMs?: number;
	sessions: Set<string>;
	subagentRuns: number;
}

interface Snapshot {
	scope: Scope;
	scannedFiles: number;
	matchedSessions: number;
	entries: number;
	parseErrors: number;
	buckets: UsageBucket[];
}

const WIDGET_ID = "model-usage";
const ARGUMENTS = ["current", "project", "today", "all", "clear"];

function numberOf(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fmtCost(n: number): string {
	if (n <= 0) return "$0.00";
	return n >= 0.1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

function displayModel(provider: string, model: string): string {
	return provider && provider !== "?" ? `${provider}/${model}` : model;
}

function normalizeModel(provider?: unknown, model?: unknown): { provider: string; model: string } {
	if (typeof provider === "string" && typeof model === "string") {
		return { provider: provider || "?", model: model || "unknown" };
	}

	const raw = typeof model === "string" && model.length > 0 ? model : typeof provider === "string" ? provider : "unknown";
	const slash = raw.indexOf("/");
	const colon = raw.lastIndexOf(":");
	const withoutThinking = colon > slash ? raw.slice(0, colon) : raw;
	if (slash >= 0) {
		const [p, ...rest] = withoutThinking.split("/");
		return { provider: p || "?", model: rest.join("/") || "unknown" };
	}
	return { provider: "?", model: withoutThinking || "unknown" };
}

function messageMs(entry: { timestamp?: unknown }, message?: { timestamp?: unknown }): number | undefined {
	if (typeof message?.timestamp === "number") return message.timestamp;
	if (typeof entry.timestamp === "string") {
		const parsed = Date.parse(entry.timestamp);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return undefined;
}

function includeTime(ms: number | undefined, sinceMs?: number): boolean {
	return sinceMs === undefined || (ms !== undefined && ms >= sinceMs);
}

function usageParts(usage: unknown) {
	const u = usage as {
		input?: unknown;
		output?: unknown;
		reasoning?: unknown;
		cacheRead?: unknown;
		cacheWrite?: unknown;
		totalTokens?: unknown;
		cost?: unknown;
		turns?: unknown;
	};
	const input = numberOf(u?.input);
	const output = numberOf(u?.output);
	const reasoning = numberOf(u?.reasoning);
	const cacheRead = numberOf(u?.cacheRead);
	const cacheWrite = numberOf(u?.cacheWrite);
	const totalTokens = numberOf(u?.totalTokens) || input + output + reasoning + cacheRead + cacheWrite;
	const rawCost = u?.cost as { total?: unknown } | number | undefined;
	const cost = typeof rawCost === "number" ? numberOf(rawCost) : numberOf(rawCost?.total);
	const turns = numberOf(u?.turns) || 1;
	return { input, output, reasoning, cacheRead, cacheWrite, totalTokens, cost, turns };
}

function hasUsage(usage: ReturnType<typeof usageParts>): boolean {
	return usage.totalTokens > 0 || usage.cost > 0;
}

function addUsage(
	buckets: Map<string, UsageBucket>,
	modelInfo: { provider: string; model: string },
	usageLike: unknown,
	whenMs: number | undefined,
	sessionFile: string,
	kind: "direct" | "subagent",
) {
	const usage = usageParts(usageLike);
	if (!hasUsage(usage)) return;

	const key = displayModel(modelInfo.provider, modelInfo.model);
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = {
			provider: modelInfo.provider,
			model: modelInfo.model,
			turns: 0,
			runs: 0,
			input: 0,
			output: 0,
			reasoning: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: 0,
			sessions: new Set<string>(),
			subagentRuns: 0,
		};
		buckets.set(key, bucket);
	}

	bucket.turns += usage.turns;
	bucket.runs += 1;
	bucket.input += usage.input;
	bucket.output += usage.output;
	bucket.reasoning += usage.reasoning;
	bucket.cacheRead += usage.cacheRead;
	bucket.cacheWrite += usage.cacheWrite;
	bucket.totalTokens += usage.totalTokens;
	bucket.cost += usage.cost;
	bucket.sessions.add(sessionFile);
	if (kind === "subagent") bucket.subagentRuns += 1;
	if (whenMs !== undefined) {
		bucket.firstMs = bucket.firstMs === undefined ? whenMs : Math.min(bucket.firstMs, whenMs);
		bucket.lastMs = bucket.lastMs === undefined ? whenMs : Math.max(bucket.lastMs, whenMs);
	}
}

function addSubagentUsage(
	buckets: Map<string, UsageBucket>,
	details: unknown,
	fallbackMs: number | undefined,
	sessionFile: string,
	sinceMs?: number,
) {
	const results = (details as { results?: unknown[] } | undefined)?.results;
	if (!Array.isArray(results)) return;

	for (const result of results) {
		const r = result as { usage?: unknown; model?: unknown; startTime?: unknown; endTime?: unknown };
		const whenMs = numberOf(r.endTime) || numberOf(r.startTime) || fallbackMs;
		if (!includeTime(whenMs, sinceMs)) continue;
		addUsage(buckets, normalizeModel(r.model), r.usage, whenMs, sessionFile, "subagent");
	}
}

function sortedBuckets(buckets: Map<string, UsageBucket>): UsageBucket[] {
	return [...buckets.values()].sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens || b.turns - a.turns);
}

function walkJsonlFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			const stat = statSync(path);
			if (stat.isDirectory()) stack.push(path);
			else if (name.endsWith(".jsonl")) out.push(path);
		}
	}
	return out;
}

function scanSessionFile(
	file: string,
	buckets: Map<string, UsageBucket>,
	scope: Scope,
	cwd: string,
	sinceMs?: number,
): { matched: boolean; entries: number; parseErrors: number } {
	let matched = scope !== "project";
	let entries = 0;
	let parseErrors = 0;
	const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		let entry: any;
		try {
			entry = JSON.parse(lines[i]);
		} catch {
			parseErrors += 1;
			continue;
		}

		if (i === 0 && entry?.type === "session") {
			matched = scope !== "project" || entry.cwd === cwd;
			if (!matched) return { matched: false, entries: 0, parseErrors };
			continue;
		}

		entries += 1;
		if (entry?.type !== "message") continue;
		const message = entry.message;
		const whenMs = messageMs(entry, message);

		if (message?.role === "assistant") {
			if (!includeTime(whenMs, sinceMs)) continue;
			const assistant = message as AssistantMessage;
			addUsage(buckets, normalizeModel(assistant.provider, assistant.model), assistant.usage, whenMs, file, "direct");
			continue;
		}

		if (message?.role === "toolResult" && message.toolName === "subagent") {
			addSubagentUsage(buckets, message.details, whenMs, file, sinceMs);
		}
	}

	return { matched, entries, parseErrors };
}

function snapshotCurrent(ctx: { sessionManager: { getBranch(): any[]; getSessionFile?(): string | undefined } }): Snapshot {
	const buckets = new Map<string, UsageBucket>();
	const file = ctx.sessionManager.getSessionFile?.() ?? "<current>";
	let entries = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		entries += 1;
		if (entry?.type !== "message") continue;
		const message = entry.message;
		const whenMs = messageMs(entry, message);
		if (message?.role === "assistant") {
			const assistant = message as AssistantMessage;
			addUsage(buckets, normalizeModel(assistant.provider, assistant.model), assistant.usage, whenMs, file, "direct");
		} else if (message?.role === "toolResult" && message.toolName === "subagent") {
			addSubagentUsage(buckets, message.details, whenMs, file);
		}
	}
	return { scope: "current", scannedFiles: file === "<current>" ? 0 : 1, matchedSessions: 1, entries, parseErrors: 0, buckets: sortedBuckets(buckets) };
}

function snapshotStored(scope: Scope, cwd: string): Snapshot {
	const buckets = new Map<string, UsageBucket>();
	const sinceMs = scope === "today" ? new Date().setHours(0, 0, 0, 0) : undefined;
	const files = walkJsonlFiles(join(getAgentDir(), "sessions"));
	let matchedSessions = 0;
	let entries = 0;
	let parseErrors = 0;

	for (const file of files) {
		try {
			const result = scanSessionFile(file, buckets, scope, cwd, sinceMs);
			if (result.matched) matchedSessions += 1;
			entries += result.entries;
			parseErrors += result.parseErrors;
		} catch {
			parseErrors += 1;
		}
	}

	return { scope, scannedFiles: files.length, matchedSessions, entries, parseErrors, buckets: sortedBuckets(buckets) };
}

function totals(buckets: UsageBucket[]): Omit<UsageBucket, "provider" | "model" | "sessions"> & { sessions: number } {
	const total = {
		turns: 0,
		runs: 0,
		input: 0,
		output: 0,
		reasoning: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
		firstMs: undefined as number | undefined,
		lastMs: undefined as number | undefined,
		sessions: new Set<string>(),
		subagentRuns: 0,
	};
	for (const b of buckets) {
		total.turns += b.turns;
		total.runs += b.runs;
		total.input += b.input;
		total.output += b.output;
		total.reasoning += b.reasoning;
		total.cacheRead += b.cacheRead;
		total.cacheWrite += b.cacheWrite;
		total.totalTokens += b.totalTokens;
		total.cost += b.cost;
		total.subagentRuns += b.subagentRuns;
		for (const session of b.sessions) total.sessions.add(session);
		if (b.firstMs !== undefined) total.firstMs = total.firstMs === undefined ? b.firstMs : Math.min(total.firstMs, b.firstMs);
		if (b.lastMs !== undefined) total.lastMs = total.lastMs === undefined ? b.lastMs : Math.max(total.lastMs, b.lastMs);
	}
	return { ...total, sessions: total.sessions.size };
}

function fmtDate(ms?: number): string {
	if (ms === undefined) return "-";
	const d = new Date(ms);
	const now = new Date();
	const sameDay = d.toDateString() === now.toDateString();
	if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	return d.toISOString().slice(0, 10);
}

function right(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "…");
	return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
}

function left(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function scopeTitle(scope: Scope): string {
	switch (scope) {
		case "current":
			return "current branch";
		case "project":
			return "current project";
		case "today":
			return "today";
		case "all":
			return "all sessions";
	}
}

function buildLines(snapshot: Snapshot, width: number, theme: { fg(color: string, text: string): string; bold(text: string): string }) {
	const total = totals(snapshot.buckets);
	const lines: string[] = [];
	lines.push(theme.fg("accent", theme.bold(`Model usage — ${scopeTitle(snapshot.scope)}`)));
	lines.push(
		theme.fg(
			"dim",
			`${snapshot.matchedSessions}/${snapshot.scannedFiles || snapshot.matchedSessions} sessions · ${snapshot.entries} entries · ${fmtTokens(total.totalTokens)} tokens · ${fmtCost(total.cost)}${snapshot.parseErrors ? ` · ${snapshot.parseErrors} parse errors` : ""}`,
		),
	);

	if (snapshot.buckets.length === 0) {
		lines.push(theme.fg("muted", "No usage found for this scope yet."));
		lines.push(theme.fg("dim", "Try /usage all after a few assistant turns."));
		return lines.map((line) => truncateToWidth(line, width));
	}

	const compact = width < 100;
	const modelWidth = compact ? Math.max(20, width - 42) : Math.max(24, width - 72);
	lines.push("");
	lines.push(
		compact
			? theme.fg("muted", `${left("model", modelWidth)} ${right("turns", 5)} ${right("tokens", 8)} ${right("cost", 8)} ${right("last", 10)}`)
			: theme.fg(
					"muted",
					`${left("model", modelWidth)} ${right("turns", 5)} ${right("input", 8)} ${right("output", 8)} ${right("cache", 9)} ${right("cost", 8)} ${right("share", 6)} ${right("last", 10)}`,
				),
	);
	lines.push(theme.fg("dim", "─".repeat(Math.min(width, compact ? modelWidth + 36 : modelWidth + 60))));

	for (const bucket of snapshot.buckets) {
		const model = displayModel(bucket.provider, bucket.model);
		const modelText = bucket.subagentRuns > 0 ? `${model} ${theme.fg("dim", `(+${bucket.subagentRuns} agent${bucket.subagentRuns === 1 ? "" : "s"})`)}` : model;
		if (compact) {
			lines.push(
				`${left(modelText, modelWidth)} ${right(String(bucket.turns), 5)} ${right(fmtTokens(bucket.totalTokens), 8)} ${right(fmtCost(bucket.cost), 8)} ${right(fmtDate(bucket.lastMs), 10)}`,
			);
		} else {
			const cache = bucket.cacheRead || bucket.cacheWrite ? `${fmtTokens(bucket.cacheRead)}/${fmtTokens(bucket.cacheWrite)}` : "-";
			const share = total.cost > 0 ? `${((bucket.cost / total.cost) * 100).toFixed(0)}%` : `${((bucket.totalTokens / total.totalTokens) * 100).toFixed(0)}%`;
			lines.push(
				`${left(modelText, modelWidth)} ${right(String(bucket.turns), 5)} ${right(fmtTokens(bucket.input), 8)} ${right(fmtTokens(bucket.output), 8)} ${right(cache, 9)} ${right(fmtCost(bucket.cost), 8)} ${right(share, 6)} ${right(fmtDate(bucket.lastMs), 10)}`,
			);
		}
	}

	lines.push(theme.fg("dim", "─".repeat(Math.min(width, compact ? modelWidth + 36 : modelWidth + 60))));
	lines.push(
		compact
			? `${left("TOTAL", modelWidth)} ${right(String(total.turns), 5)} ${right(fmtTokens(total.totalTokens), 8)} ${right(fmtCost(total.cost), 8)} ${right(fmtDate(total.lastMs), 10)}`
			: `${left("TOTAL", modelWidth)} ${right(String(total.turns), 5)} ${right(fmtTokens(total.input), 8)} ${right(fmtTokens(total.output), 8)} ${right(`${fmtTokens(total.cacheRead)}/${fmtTokens(total.cacheWrite)}`, 9)} ${right(fmtCost(total.cost), 8)} ${right("100%", 6)} ${right(fmtDate(total.lastMs), 10)}`,
	);
	lines.push(theme.fg("dim", "Scopes: /usage current · /usage project · /usage today · /usage all · /usage clear"));
	return lines.map((line) => truncateToWidth(line, width));
}

async function chooseScope(ctx: { ui: { select(title: string, choices: string[]): Promise<string | undefined> } }): Promise<Scope | "clear" | undefined> {
	const choices = [
		"current — active branch only",
		"project — sessions for this cwd",
		"today — all sessions since midnight",
		"all — every stored pi session",
		"clear — hide usage widget",
	];
	const choice = await ctx.ui.select("Model usage breakdown", choices);
	if (!choice) return undefined;
	return choice.split(" ", 1)[0] as Scope | "clear";
}

export default function (pi: ExtensionAPI) {
	async function show(scope: Scope, ctx: any) {
		ctx.ui.setStatus("usage", ctx.ui.theme.fg("dim", "usage: scanning…"));
		try {
			const snapshot = scope === "current" ? snapshotCurrent(ctx) : snapshotStored(scope, ctx.cwd);
			ctx.ui.setWidget(WIDGET_ID, (_tui: unknown, theme: any) => ({
				render(width: number) {
					return buildLines(snapshot, width, theme);
				},
				invalidate() {},
			}));
			ctx.ui.notify(`Usage: ${scopeTitle(scope)}`, "info");
		} finally {
			ctx.ui.setStatus("usage", undefined);
		}
	}

	async function handler(args: string | undefined, ctx: any) {
		if (!ctx.hasUI) return;
		const raw = (args ?? "").trim().toLowerCase();
		let scope: Scope | "clear" | undefined;

		if (!raw || raw === "menu") scope = await chooseScope(ctx);
		else if (raw === "hide" || raw === "clear" || raw === "off") scope = "clear";
		else if (["current", "project", "today", "all"].includes(raw)) scope = raw as Scope;
		else {
			ctx.ui.notify(`Usage scope must be one of: ${ARGUMENTS.join(", ")}`, "error");
			return;
		}

		if (!scope) return;
		if (scope === "clear") {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			ctx.ui.notify("Usage widget hidden", "info");
			return;
		}
		await show(scope, ctx);
	}

	pi.registerCommand("usage", {
		description: "Show model usage breakdown by model",
		getArgumentCompletions(prefix: string) {
			const items = ARGUMENTS.filter((arg) => arg.startsWith(prefix.toLowerCase())).map((arg) => ({ value: arg, label: arg }));
			return items.length > 0 ? items : null;
		},
		handler,
	});

	pi.registerCommand("model-usage", {
		description: "Show model usage breakdown by model",
		getArgumentCompletions(prefix: string) {
			const items = ARGUMENTS.filter((arg) => arg.startsWith(prefix.toLowerCase())).map((arg) => ({ value: arg, label: arg }));
			return items.length > 0 ? items : null;
		},
		handler,
	});
}
