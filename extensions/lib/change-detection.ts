/**
 * Cross-shell change detection engine for ~/.pi/agent.
 *
 * THE single detection + classification point for cross-shell repo changes.
 * All state and git logic live here; extensions are thin consumers:
 *
 *   - detectAdvance() is the one detection pass: HEAD moved since this session
 *     last looked → classify each committed file (own autocommit snapshot =
 *     silent / foreign = plain / collided = another session committed DIFFERENT
 *     content over a file we edited) and register any changed loaded resource
 *     (per isReloadResource) as STALE with its concrete git delta.
 *   - checkEdit() is the one per-edit classification: stale loaded resource not
 *     re-read → block EVERY attempt until the live file is re-read (the read
 *     tool cures it); target dirty from another shell → warn once.
 *   - recordWrite()/recordRead() feed the session's own activity back in.
 *   - staleResources() is the persistent staleness registry consumers render
 *     (prompt block, widget); it only empties on reset() — i.e. on /reload,
 *     which is exactly when the in-memory copies stop being stale.
 *
 * concurrency-guard.ts drives this and re-broadcasts each RepoAdvance verbatim
 * as the "config-repo-advanced" bus event — the interface any other consumer
 * (self-audit refresh, future subscribers) uses for the classified result.
 *
 * Pure module (node builtins + ./config-paths.ts only) so it loads under jiti
 * standalone and is testable in isolation (scripts/check-concurrency-guard.mjs).
 * Fail-open: every git call degrades to "" and every classification degrades
 * to silence, never to blocking a session.
 */

import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { isReloadResource } from "./config-paths.ts";

/** A pi-loaded resource whose in-memory copy went stale via a cross-shell change. */
export interface StaleResource {
	rel: string;
	/** short commit range that made it stale (first detection). */
	range: string;
	/** one-line git log summary of what changed (may be ""). */
	delta: string;
	/** this session had edited the file and another session committed over it. */
	collided: boolean;
	/** session has re-read (or successfully re-edited) the live file since it went stale. */
	readSince: boolean;
}

/** One classified repo advance — the payload of the "config-repo-advanced" bus event. */
export interface RepoAdvance {
	range: string;
	/** committed files this session never edited. */
	foreign: string[];
	/** committed with DIFFERENT content over this session's edit (highest risk). */
	collided: string[];
	/** subset of foreign+collided that are loaded resources (now stale until /reload). */
	staleResources: string[];
}

export type EditVerdict =
	| { kind: "stale-block"; rel: string; reason: string }
	| { kind: "dirty-foreign"; rel: string; reason: string };

type StaleEntry = StaleResource;

export function createChangeTracker(agentDir: string) {
	function git(...args: string[]): string {
		try {
			return execFileSync("git", ["-C", agentDir, ...args], {
				encoding: "utf8",
				timeout: 5_000,
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
		} catch {
			return "";
		}
	}

	let lastKnownHead = "";
	/** Repo-relative paths this session has edited (so its own snapshots stay silent). */
	const touched = new Set<string>();
	/** rel -> git blob hash of the content THIS session last wrote (post-edit). */
	const touchedHashes = new Map<string, string>();
	const warnedDirty = new Set<string>();
	/** Persistent staleness registry: rel -> entry. Empties only on reset() (= reload). */
	const stale = new Map<string, StaleEntry>();
	/** Same-file collisions seen this session (foreign commit over a file we edited). */
	let collisionCount = 0;

	return {
		/** session_start: baseline HEAD and clear all per-session state. */
		reset(): void {
			lastKnownHead = git("rev-parse", "HEAD");
			touched.clear();
			touchedHashes.clear();
			warnedDirty.clear();
			stale.clear();
			collisionCount = 0;
		},

		/** Repo-relative path if inside the agent dir, else undefined. */
		rel(path: string, cwd: string): string | undefined {
			const abs = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
			return abs.startsWith(agentDir + "/") ? abs.slice(agentDir.length + 1) : undefined;
		},

		collisions: () => collisionCount,

		/**
		 * THE detection + classification pass (call once per before_agent_start).
		 * Advances the baseline, so each range classifies at most once. Returns
		 * undefined when HEAD did not move or every commit was our own snapshot.
		 * A file we edited that another shell DELETED (gone from head's tree) is a
		 * collision; a genuinely empty hash from a transient git error (file still
		 * in the tree) falls through to silent, honoring fail-open.
		 */
		detectAdvance(): RepoAdvance | undefined {
			if (!lastKnownHead) return undefined;
			const head = git("rev-parse", "HEAD");
			if (!head || head === lastKnownHead) return undefined;
			const fullRange = `${lastKnownHead}..${head}`;
			const range = `${lastKnownHead.slice(0, 7)}..${head.slice(0, 7)}`;
			const changed = git("diff", "--name-only", fullRange).split("\n").filter(Boolean);
			lastKnownHead = head;

			const foreign: string[] = [];
			const collided: string[] = [];
			for (const f of changed) {
				if (!touched.has(f)) {
					foreign.push(f);
					continue;
				}
				const committed = git("rev-parse", `${head}:${f}`);
				const ours = touchedHashes.get(f);
				if (committed && ours && committed !== ours) {
					collided.push(f); // another session committed DIFFERENT content over our edit
				} else if (!committed && ours && !git("ls-tree", head, "--", f)) {
					// Gone from head's tree (not a transient rev-parse error) → another
					// shell DELETED a file we edited: highest-risk, same as a clobber.
					collided.push(f);
				}
			}
			if (foreign.length === 0 && collided.length === 0) return undefined; // own snapshot(s)
			collisionCount += collided.length;

			// Register changed loaded resources as stale, with the concrete delta.
			const staleNow: string[] = [];
			for (const f of [...collided, ...foreign]) {
				if (!isReloadResource(f)) continue;
				staleNow.push(f);
				const prev = stale.get(f);
				// ponytail: -2 commits of context is enough for a one-line delta hint.
				const delta = git("log", "--oneline", "--no-decorate", "-2", fullRange, "--", f)
					.split("\n")
					.filter(Boolean)
					.join("; ");
				stale.set(f, {
					rel: f,
					range: prev?.range ?? range,
					delta: delta || prev?.delta || "",
					collided: collided.includes(f) || (prev?.collided ?? false),
					readSince: false, // new foreign content on disk → any earlier re-read is void
				});
			}
			return { range, foreign, collided, staleResources: staleNow };
		},

		/** tool_result (edit/write, non-error): this session owns the file's content now. */
		recordWrite(rel: string): void {
			touched.add(rel);
			const hash = git("hash-object", rel);
			if (hash) touchedHashes.set(rel, hash);
			// A successful edit worked against the LIVE file (edit's oldText matched
			// disk), so the session-memory staleness is cured. Runtime staleness
			// (the loaded copy) persists until /reload — the entry stays registered.
			const s = stale.get(rel);
			if (s) s.readSince = true;
		},

		/** tool_result (read, non-error): the session now knows the live content. */
		recordRead(rel: string): void {
			const s = stale.get(rel);
			if (s) s.readSince = true;
		},

		/**
		 * THE per-edit classification (call from tool_call for edit/write).
		 * Stale-not-re-read resource → HALT every attempt (return stale-block)
		 * until the live file is re-read; recordRead()/recordWrite() set readSince
		 * and cure the gate. A re-read done only via bash is unobservable here, so
		 * that path stays blocked — re-read with the read tool to proceed.
		 */
		checkEdit(rel: string): EditVerdict | undefined {
			const s = stale.get(rel);
			if (s && !s.readSince) {
				const what = `${rel} is a loaded resource another shell changed (${s.range}${s.delta ? ` — ${s.delta}` : ""}); its in-memory copy is stale`;
				return {
					kind: "stale-block",
					rel,
					reason:
						`[concurrency-guard] BLOCKED: ${what}. Read the live file (read tool) before editing, ` +
						`then retry. Tell the user to run /refresh to reload resources.`,
				};
			}
			if (!touched.has(rel) && !warnedDirty.has(rel)) {
				const dirty = git("status", "--porcelain", "--", rel);
				if (dirty) {
					warnedDirty.add(rel);
					return {
						kind: "dirty-foreign",
						rel,
						reason:
							`[concurrency-guard] ${rel} has UNCOMMITTED changes this session did not make ` +
							`(another shell is editing it). Re-read the live file before this edit lands, or ` +
							`you may clobber concurrent work.`,
					};
				}
			}
			return undefined;
		},

		/** Snapshot of the persistent staleness registry (cloned — safe to hold). */
		staleResources(): StaleResource[] {
			return [...stale.values()].map(({ rel, range, delta, collided, readSince }) => ({
				rel,
				range,
				delta,
				collided,
				readSince,
			}));
		},

		/** Non-mutating HEAD-vs-baseline delta, for /refresh's report. */
		pendingDelta(): { head: string; range?: string; changed?: string[] } | undefined {
			const head = git("rev-parse", "HEAD");
			if (!head) return undefined;
			if (!lastKnownHead || head === lastKnownHead) return { head };
			return {
				head,
				range: `${lastKnownHead.slice(0, 7)}..${head.slice(0, 7)}`,
				changed: git("diff", "--name-only", `${lastKnownHead}..${head}`).split("\n").filter(Boolean),
			};
		},
	};
}

export type ChangeTracker = ReturnType<typeof createChangeTracker>;
