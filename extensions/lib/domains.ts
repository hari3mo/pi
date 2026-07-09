/**
 * Domain classification — routes learning capture and knowledge lookup by
 * work domain ("pi" = pi-internal harness work, "prism" = Prism data-science
 * work, extensible via config/domains.json).
 *
 * Contract: learning/SCHEMA.md (event `domain` field) + docs/sync.md
 * ("prism-oracle repo" section). Consumers: learning-tap (stamps events),
 * wiki-first / graph-first (domain-aware store routing), the nightly
 * distiller (routes promotions to the matching stores).
 *
 * Config: ~/.pi/agent/config/domains.json — one entry per non-default domain:
 *   {
 *     "<id>": {
 *       "cwdPrefixes":  ["~/prism", "/abs/path"],          // ~ expands to $HOME
 *       "oracleRepo":   { "darwin": "~/...", "linux": "~/..." },
 *       "wikiProfile":  "~/.obsidian-wiki/config.<id>",
 *       "graphDir":     "<oracleRepo>/prism-graph"          // graph.json lives HERE (no graphify-out nesting)
 *     }
 *   }
 *
 * DEFAULT_DOMAIN ("pi") is implicit: any cwd matching no prefix. Absent
 * `domain` on an event means "pi" (SCHEMA.md v2 back-compat).
 *
 * Fail-open everywhere: unreadable/malformed config, unknown platform, or a
 * missing per-platform path → classify as "pi" / return undefined. A broken
 * domains.json must never crash a session.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_DOMAIN = "pi";

export interface DomainSpec {
	cwdPrefixes: string[];
	oracleRepo: Partial<Record<string, string>>; // keyed by process.platform
	wikiProfile: string;
	graphDir: string; // may contain the literal token <oracleRepo>
}

export type DomainMap = Record<string, DomainSpec>;

const HOME = process.env.HOME ?? "";

export function expandHome(p: string, home = HOME): string {
	if (!p) return p;
	if (p === "~") return home;
	if (p.startsWith("~/")) return join(home, p.slice(2));
	return p;
}

/** Parse a domains.json body. Returns {} on any shape problem (fail-open). */
export function parseDomains(body: string): DomainMap {
	try {
		const raw = JSON.parse(body) as Record<string, unknown>;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		const out: DomainMap = {};
		for (const [id, v] of Object.entries(raw)) {
			const d = v as Partial<DomainSpec>;
			if (!d || !Array.isArray(d.cwdPrefixes) || typeof d.wikiProfile !== "string") continue;
			out[id] = {
				cwdPrefixes: d.cwdPrefixes.filter((s): s is string => typeof s === "string"),
				oracleRepo: (d.oracleRepo && typeof d.oracleRepo === "object" ? d.oracleRepo : {}) as Partial<
					Record<string, string>
				>,
				wikiProfile: d.wikiProfile,
				graphDir: typeof d.graphDir === "string" ? d.graphDir : "",
			};
		}
		return out;
	} catch {
		return {};
	}
}

let cached: DomainMap | undefined;

/** Load (and cache) the domain map from config/domains.json. Fail-open → {}. */
export function loadDomains(agentDir = join(HOME, ".pi", "agent")): DomainMap {
	if (cached) return cached;
	try {
		cached = parseDomains(readFileSync(join(agentDir, "config", "domains.json"), "utf8"));
	} catch {
		cached = {};
	}
	return cached;
}

/** Test hook: clear the module-level config cache. */
export function resetDomainCache(): void {
	cached = undefined;
}

/**
 * Classify a cwd into a domain id. Prefix match against each domain's
 * expanded cwdPrefixes (path-segment anchored: "/a/b" matches "/a/b" and
 * "/a/b/c", not "/a/bc"). No match → DEFAULT_DOMAIN.
 */
export function classifyCwd(cwd: string, domains?: DomainMap, home = HOME): string {
	if (!cwd) return DEFAULT_DOMAIN;
	const map = domains ?? loadDomains();
	for (const [id, spec] of Object.entries(map)) {
		for (const rawPrefix of spec.cwdPrefixes) {
			const prefix = expandHome(rawPrefix, home).replace(/\/+$/, "");
			if (!prefix) continue;
			if (cwd === prefix || cwd.startsWith(`${prefix}/`)) return id;
		}
	}
	return DEFAULT_DOMAIN;
}

/** Absolute oracle-repo root for a domain on THIS platform, or undefined. */
export function resolveOracleRepo(domain: string, domains?: DomainMap, platform = process.platform, home = HOME): string | undefined {
	const spec = (domains ?? loadDomains())[domain];
	const p = spec?.oracleRepo?.[platform];
	return p ? expandHome(p, home) : undefined;
}

/** Absolute wiki profile path for a domain, or undefined (pi has its own). */
export function resolveWikiProfile(domain: string, domains?: DomainMap, home = HOME): string | undefined {
	const spec = (domains ?? loadDomains())[domain];
	return spec?.wikiProfile ? expandHome(spec.wikiProfile, home) : undefined;
}

/** Absolute graph dir (contains graph.json DIRECTLY) for a domain, or undefined. */
export function resolveGraphDir(domain: string, domains?: DomainMap, platform = process.platform, home = HOME): string | undefined {
	const spec = (domains ?? loadDomains())[domain];
	if (!spec?.graphDir) return undefined;
	let g = spec.graphDir;
	if (g.includes("<oracleRepo>")) {
		const repo = resolveOracleRepo(domain, domains, platform, home);
		if (!repo) return undefined;
		g = g.replace("<oracleRepo>", repo);
	}
	return expandHome(g, home);
}
