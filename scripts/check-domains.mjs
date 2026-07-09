#!/usr/bin/env node
/**
 * check-domains.mjs — pure-logic checks for extensions/lib/domains.ts.
 * Loads the real exported functions via the jiti loader (house pattern).
 * Run from ~/.pi/agent: node scripts/check-domains.mjs
 */
import { loadTs } from "./lib/jiti-loader.mjs";

const m = await loadTs("extensions/lib/domains.ts");
const {
	DEFAULT_DOMAIN,
	expandHome,
	parseDomains,
	classifyCwd,
	resolveOracleRepo,
	resolveWikiProfile,
	resolveGraphDir,
} = m;

let fails = 0;
function check(name, cond) {
	if (cond) console.log(`  ok  ${name}`);
	else {
		console.error(`FAIL  ${name}`);
		fails++;
	}
}

const HOME = "/Users/testuser";
const MAP = parseDomains(
	JSON.stringify({
		prism: {
			cwdPrefixes: ["~/prism", "/home/ec2-user/SageMaker/prism-ds-shared-filesystem"],
			oracleRepo: { darwin: "~/prism/prism-oracle", linux: "~/SageMaker/x/prism-oracle" },
			wikiProfile: "~/.obsidian-wiki/config.prism",
			graphDir: "<oracleRepo>/prism-graph",
		},
	}),
);

// --- parseDomains ---------------------------------------------------------
check("parseDomains: valid config parses", Object.keys(MAP).length === 1 && !!MAP.prism);
check("parseDomains: garbage → {}", Object.keys(parseDomains("not json")).length === 0);
check("parseDomains: array → {}", Object.keys(parseDomains("[1,2]")).length === 0);
check(
	"parseDomains: entry missing wikiProfile dropped",
	Object.keys(parseDomains(JSON.stringify({ bad: { cwdPrefixes: ["/x"] } }))).length === 0,
);

// --- expandHome ------------------------------------------------------------
check("expandHome: ~/x", expandHome("~/x", HOME) === `${HOME}/x`);
check("expandHome: absolute untouched", expandHome("/abs/p", HOME) === "/abs/p");
check("expandHome: bare ~", expandHome("~", HOME) === HOME);

// --- classifyCwd -----------------------------------------------------------
check("classify: mac prism cwd", classifyCwd(`${HOME}/prism/data-science-main`, MAP, HOME) === "prism");
check("classify: prism root exact", classifyCwd(`${HOME}/prism`, MAP, HOME) === "prism");
check(
	"classify: ec2 shared-fs cwd",
	classifyCwd("/home/ec2-user/SageMaker/prism-ds-shared-filesystem/prism/code", MAP, HOME) === "prism",
);
check("classify: segment-anchored (no /prismX)", classifyCwd(`${HOME}/prismX`, MAP, HOME) === DEFAULT_DOMAIN);
check("classify: pi agent cwd → pi", classifyCwd(`${HOME}/.pi/agent`, MAP, HOME) === DEFAULT_DOMAIN);
check("classify: empty cwd → pi", classifyCwd("", MAP, HOME) === DEFAULT_DOMAIN);
check("classify: empty map → pi", classifyCwd(`${HOME}/prism`, {}, HOME) === DEFAULT_DOMAIN);

// --- resolvers -------------------------------------------------------------
check(
	"oracleRepo: darwin",
	resolveOracleRepo("prism", MAP, "darwin", HOME) === `${HOME}/prism/prism-oracle`,
);
check(
	"oracleRepo: linux",
	resolveOracleRepo("prism", MAP, "linux", HOME) === `${HOME}/SageMaker/x/prism-oracle`,
);
check("oracleRepo: unknown platform → undefined", resolveOracleRepo("prism", MAP, "win32", HOME) === undefined);
check("oracleRepo: unknown domain → undefined", resolveOracleRepo("nope", MAP, "darwin", HOME) === undefined);
check(
	"wikiProfile: expands",
	resolveWikiProfile("prism", MAP, HOME) === `${HOME}/.obsidian-wiki/config.prism`,
);
check(
	"graphDir: <oracleRepo> substitution",
	resolveGraphDir("prism", MAP, "darwin", HOME) === `${HOME}/prism/prism-oracle/prism-graph`,
);
check("graphDir: unresolvable repo → undefined", resolveGraphDir("prism", MAP, "win32", HOME) === undefined);

// --- live config sanity (this machine) --------------------------------------
const live = m.loadDomains();
check("live domains.json parses with ≥1 domain", Object.keys(live).length >= 1);
check("live: prism domain present", !!live.prism);

if (fails > 0) {
	console.error(`\n${fails} check(s) FAILED`);
	process.exit(1);
}
console.log("\nall domain checks passed");
