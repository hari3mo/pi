/**
 * Lead-Config Extension — model-aware lead profiles.
 *
 * The Delegation Gate in AGENTS.md branches on which model is the lead
 * (fable orchestrates; opus may edit at small scale / must orchestrate at
 * large scale; any other model works directly). That branch used to live only
 * as prose the agent had to remember. This extension MECHANIZES it: every
 * prompt it reads the active model id (ctx.model.id — the same field
 * read-only-default.ts and model-awareness.ts use), first-matches it against
 * config/lead-profiles.json, and appends the matched profile's doctrine block
 * to the system prompt under a clear header. The model can switch mid-session
 * (shift+tab via model-cycle.ts), so this re-evaluates on before_agent_start
 * every turn.
 *
 * Enforcement (read-only-default.ts's fable edit-block) is NOT touched — this
 * only injects doctrine. Fail-open throughout: an unknown/garbage model id, a
 * missing/malformed profiles file, or any error injects NOTHING (the static
 * AGENTS.md doctrine stands). The parsed profiles file is cached by mtime.
 *
 * Self-improving closure: per-session {model ids seen, profile applied,
 * fallback count} are appended to <agentDir>/graphify-out/.lead_config_stats.json
 * (atomic temp+rename, ~50-record ring — the graph-first stats pattern) at
 * agent_end; audit-pipelines.py:check_lead_profile_coverage() WARNs when a
 * model id repeatedly resolves to the fallback profile across sessions (roster
 * drift). Applies to PI_SUBAGENT children too — a child may itself be an
 * opus/sonnet lead of its own sub-work, which is correct.
 *
 * Pure matching/injection functions (parseProfiles, matchProfile,
 * buildLeadBlock) have no bare value imports, so scripts/check-lead-config.mjs
 * jiti-imports them directly without provisioning node_modules (the
 * graph-first.ts check pattern).
 */

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Pure profile matching + block building (unit-tested: check-lead-config.mjs)
// ---------------------------------------------------------------------------

export interface LeadProfile {
	name: string;
	match: string;
	doctrine: string;
	writePolicy?: string;
	fallback?: boolean;
}

/** Parse the profiles-file text into a validated list. [] on any error (fail open). */
export function parseProfiles(text: string): LeadProfile[] {
	try {
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(p): p is LeadProfile =>
				!!p &&
				typeof p === "object" &&
				typeof p.name === "string" &&
				typeof p.match === "string" &&
				typeof p.doctrine === "string",
		);
	} catch {
		return [];
	}
}

/** A usable model id: a string that, trimmed, is non-empty AND has a word char. */
export function isUsableId(id: unknown): id is string {
	return typeof id === "string" && /\w/.test(id);
}

/** Regex test (substring fallback if the pattern will not compile). */
function patternMatches(pattern: string, id: string): boolean {
	try {
		return new RegExp(pattern).test(id);
	} catch {
		return id.includes(pattern);
	}
}

/**
 * First non-fallback profile whose `match` hits the id; else the fallback
 * profile; else null. Returns null for an unusable id (empty/garbage) so
 * nothing is injected — fail open. Pure (no I/O).
 */
export function matchProfile(profiles: LeadProfile[], id: unknown): LeadProfile | null {
	if (!isUsableId(id) || !Array.isArray(profiles) || profiles.length === 0) return null;
	for (const p of profiles) {
		if (p.fallback) continue;
		if (patternMatches(p.match, id)) return p;
	}
	return profiles.find((p) => p.fallback) ?? null;
}

/**
 * System-prompt block for a resolved profile, or "" when nothing should be
 * injected (no profile, or empty doctrine). `modelDesc` is provider/id for the
 * header. Pure (no I/O).
 */
export function buildLeadBlock(profile: LeadProfile | null, modelDesc: string): string {
	if (!profile || !profile.doctrine || !profile.doctrine.trim()) return "";
	return `## Lead profile (auto-detected: ${modelDesc} → ${profile.name})\n\n${profile.doctrine.trim()}`;
}

// ---------------------------------------------------------------------------
// Session wiring (impure)
// ---------------------------------------------------------------------------

const OUT = "graphify-out";
const STATS_FILE = ".lead_config_stats.json";
const MAX_RECORDS = 50;

/** Fixed agent dir (matches smoke-extensions.mjs / audit-pipelines.py), so stats
 *  land in the config repo's graphify-out where the audit reads them — regardless
 *  of the session cwd. Avoids a bare getAgentDir import so the check needs no pi pkg. */
function agentDir(): string {
	return process.env.PI_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function describeModel(model: { provider?: string; id?: string; name?: string } | undefined): string {
	if (!model) return "unknown";
	return `${model.provider ?? "?"}/${model.id ?? model.name ?? "?"}`;
}

interface StatsRecord {
	id: string;
	ts: number;
	models: string[];
	profiles: string[];
	fallbacks: number;
	fallbackModels: string[];
}

/**
 * ponytail: atomic replace, last-writer-wins (mirrors graph-first.ts /
 * audit-pipelines.py _write_baseline). Parallel subagents may race this file; a
 * lost record is acceptable for advisory stats — upgrade to a lock only if the
 * coverage audit proves lossy.
 */
function persistStats(dir: string, record: StatsRecord): void {
	try {
		const outDir = join(dir, OUT);
		if (!existsSync(outDir)) return; // no graphify-out here — nothing to close the loop with
		const path = join(outDir, STATS_FILE);
		let arr: StatsRecord[] = [];
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8"));
			if (Array.isArray(parsed)) arr = parsed;
		} catch {
			// absent/corrupt → start fresh
		}
		const i = arr.findIndex((r) => r && r.id === record.id);
		if (i >= 0) arr[i] = record;
		else arr.push(record);
		if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS);
		const tmp = `${path}.${process.pid}.tmp`;
		writeFileSync(tmp, JSON.stringify(arr, null, 2));
		renameSync(tmp, path);
	} catch {
		// fail open: stats are never worth wedging a session
	}
}

export default function (pi: ExtensionAPI) {
	let profilesPath = join(agentDir(), "config", "lead-profiles.json");
	let sessionId = "";
	const seen = {
		models: new Set<string>(),
		profiles: new Set<string>(),
		fallbackModels: new Set<string>(),
		fallbacks: 0,
	};
	let lastPersistedTotal = -1;
	let cache: { mtimeMs: number; profiles: LeadProfile[] } | undefined;

	/** mtime-cached parse of the profiles file. [] on any error (fail open). */
	function loadProfiles(): LeadProfile[] {
		try {
			const mtimeMs = statSync(profilesPath).mtimeMs;
			if (cache && cache.mtimeMs === mtimeMs) return cache.profiles;
			const profiles = parseProfiles(readFileSync(profilesPath, "utf8"));
			cache = { mtimeMs, profiles };
			return profiles;
		} catch {
			return [];
		}
	}

	pi.on("session_start", async () => {
		profilesPath = join(agentDir(), "config", "lead-profiles.json");
		sessionId = `${new Date().toISOString()}-${process.pid}`;
		seen.models.clear();
		seen.profiles.clear();
		seen.fallbackModels.clear();
		seen.fallbacks = 0;
		lastPersistedTotal = -1;
		cache = undefined;
	});

	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const id = (ctx.model as { id?: string } | undefined)?.id;
			const profiles = loadProfiles();
			const profile = matchProfile(profiles, id);
			if (!profile) return undefined; // unknown/garbage id, or no profiles → inject nothing
			const block = buildLeadBlock(profile, describeModel(ctx.model));
			if (!block) return undefined;

			// record (usable id guaranteed by matchProfile returning non-null)
			if (isUsableId(id)) seen.models.add(id);
			seen.profiles.add(profile.name);
			if (profile.fallback) {
				seen.fallbacks++;
				if (isUsableId(id)) seen.fallbackModels.add(id);
			}

			return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
		} catch {
			return undefined; // fail open: static AGENTS.md doctrine stands
		}
	});

	pi.on("agent_end", async () => {
		try {
			const total = seen.models.size + seen.profiles.size + seen.fallbacks;
			if (total === 0 || total === lastPersistedTotal) return;
			persistStats(agentDir(), {
				id: sessionId,
				ts: Date.now(),
				models: [...seen.models],
				profiles: [...seen.profiles],
				fallbacks: seen.fallbacks,
				fallbackModels: [...seen.fallbackModels],
			});
			lastPersistedTotal = total;
		} catch {
			// never block a turn
		}
	});
}
