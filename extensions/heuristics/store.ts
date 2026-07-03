/**
 * Storage: path resolution, JSONL read, locked read-modify-write mutations,
 * and the full capture pipeline. See DESIGN.md §1, §2, §4, §6, §7.
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { lintGenerality, redactSecrets, rewriteGenerality, sanitizeText } from "./sanitize.ts";
import {
	CAP_GLOBAL,
	CAP_PROJECT,
	type Category,
	type Heuristic,
	JACCARD_MERGE,
	JACCARD_NEAR,
	jaccard,
	LOCK_MAX_ATTEMPTS,
	LOCK_RETRY_MS,
	MAX_READ_LINES,
	newId,
	normalize,
	READ_RETRY_MS,
	type Scope,
	type Source,
	STALE_MS,
	scoreOf,
	tokens,
} from "./schema.ts";

const JSONL_NAME = "heuristics.jsonl";
const BAK_NAME = "heuristics.jsonl.bak";
const ARCHIVE_NAME = "archive.jsonl";
const LOCK_NAME = ".lock";

// ---------------------------------------------------------------------------
// Path resolution (DESIGN.md §1)
// ---------------------------------------------------------------------------

/** `${getAgentDir()}/heuristics/` — resolves to `~/.pi/agent/heuristics/`. */
export function globalDir(): string {
	return path.join(getAgentDir(), "heuristics");
}

/** Nearest ancestor of cwd containing .git (dir or file); fallback to cwd. */
export function findGitRoot(cwd: string): string {
	let dir = path.resolve(cwd);
	while (true) {
		if (fs.existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return path.resolve(cwd);
		dir = parent;
	}
}

/** `<project-root>/${CONFIG_DIR_NAME}/heuristics/` — resolves to `<repo>/.pi/heuristics/`. */
export function projectDirFor(cwd: string): string {
	return path.join(findGitRoot(cwd), CONFIG_DIR_NAME, "heuristics");
}

// ---------------------------------------------------------------------------
// Read path (DESIGN.md §1, §2)
// ---------------------------------------------------------------------------

const warnedBadLines = new Set<string>();
const warnedUnreadable = new Set<string>();

export interface ReadStoreResult {
	list: Heuristic[];
	skipped: number;
	unreadable: boolean;
	capped: boolean;
}

function parseJsonl(raw: string): { list: Heuristic[]; skipped: number; capped: boolean } {
	const allLines = raw.split("\n");
	const capped = allLines.length > MAX_READ_LINES;
	const lines = allLines.slice(0, MAX_READ_LINES);
	const map = new Map<string, Heuristic>();
	let skipped = 0;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		try {
			const obj = JSON.parse(trimmed);
			if (obj && typeof obj === "object" && typeof obj.id === "string") {
				map.set(obj.id, obj as Heuristic);
			} else {
				skipped++;
			}
		} catch {
			skipped++;
		}
	}
	return { list: Array.from(map.values()), skipped, capped };
}

/** Lock-free read. Skips bad lines, dedups by id (last wins), caps at 5000 lines. */
export async function readStore(dir: string, notify?: (msg: string) => void): Promise<ReadStoreResult> {
	const filePath = path.join(dir, JSONL_NAME);
	let raw: string;
	try {
		raw = await fsp.readFile(filePath, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { list: [], skipped: 0, unreadable: false, capped: false };
		}
		if (!warnedUnreadable.has(dir)) {
			warnedUnreadable.add(dir);
			notify?.(`Could not read ${filePath}; treating as empty.`);
		}
		return { list: [], skipped: 0, unreadable: true, capped: false };
	}
	const { list, skipped, capped } = parseJsonl(raw);
	if ((skipped > 0 || capped) && !warnedBadLines.has(dir)) {
		warnedBadLines.add(dir);
		if (skipped > 0) notify?.(`Skipped ${skipped} malformed line(s) in ${filePath}.`);
		if (capped) notify?.(`${filePath} exceeds ${MAX_READ_LINES} lines; only the first ${MAX_READ_LINES} were read.`);
	}
	return { list, skipped, unreadable: false, capped };
}

// mtime-cached read path used only for injection (never writes).
const injectionCache = new Map<string, { mtimeMs: number; list: Heuristic[] }>();

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lock-free, cached by mtime. Re-stats before each injection; reloads only on change. */
export async function readStoreForInjection(dir: string): Promise<Heuristic[]> {
	const filePath = path.join(dir, JSONL_NAME);
	let stat: fs.Stats;
	try {
		stat = await fsp.stat(filePath);
	} catch {
		await sleep(READ_RETRY_MS);
		try {
			stat = await fsp.stat(filePath);
		} catch {
			return [];
		}
	}
	const cached = injectionCache.get(dir);
	if (cached && cached.mtimeMs === stat.mtimeMs) return cached.list;
	const { list } = await readStore(dir);
	injectionCache.set(dir, { mtimeMs: stat.mtimeMs, list });
	return list;
}

// ---------------------------------------------------------------------------
// Concurrency: locked read-modify-write (DESIGN.md §2)
// ---------------------------------------------------------------------------

async function acquireLock(dir: string): Promise<string> {
	await fsp.mkdir(dir, { recursive: true });
	const lockPath = path.join(dir, LOCK_NAME);
	let attempts = 0;
	while (attempts < LOCK_MAX_ATTEMPTS) {
		try {
			const handle = await fsp.open(lockPath, "wx");
			await handle.close();
			return lockPath;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			try {
				const st = await fsp.stat(lockPath);
				if (Date.now() - st.mtimeMs > STALE_MS) {
					await fsp.unlink(lockPath).catch(() => {});
					attempts++; // stole a stale lock; still counts toward the retry budget
					continue; // retry immediately after stealing
				}
			} catch {
				attempts++; // lock disappeared mid-check; still counts toward the retry budget
				continue; // retry immediately
			}
			attempts++;
			await sleep(LOCK_RETRY_MS);
		}
	}
	throw new Error(`Could not acquire heuristics store lock at ${lockPath}; another process may be stuck.`);
}

async function releaseLock(lockPath: string): Promise<void> {
	await fsp.unlink(lockPath).catch(() => {});
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
	const dir = path.dirname(filePath);
	const tmp = path.join(dir, `tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`);
	await fsp.writeFile(tmp, content, "utf8");
	await fsp.rename(tmp, filePath);
}

function serializeJsonl(list: Heuristic[]): string {
	return list.length === 0 ? "" : `${list.map((h) => JSON.stringify(h)).join("\n")}\n`;
}

function capFor(scope: Scope): number {
	return scope === "global" ? CAP_GLOBAL : CAP_PROJECT;
}

/** Sort non-pinned entries ascending by score, evict oldest/lowest-scored until at cap. */
function evict(list: Heuristic[], scope: Scope): { list: Heuristic[]; archived: Heuristic[] } {
	const cap = capFor(scope);
	if (list.length <= cap) return { list, archived: [] };
	const now = Date.now();
	const nonPinned = list.filter((h) => !h.pinned).sort((a, b) => scoreOf(a, now) - scoreOf(b, now));
	const toRemove = list.length - cap;
	const removeIds = new Set<string>();
	const archived: Heuristic[] = [];
	for (let i = 0; i < nonPinned.length && removeIds.size < toRemove; i++) {
		removeIds.add(nonPinned[i].id);
		archived.push(nonPinned[i]);
	}
	return { list: list.filter((h) => !removeIds.has(h.id)), archived };
}

async function appendArchive(dir: string, entries: Heuristic[]): Promise<void> {
	if (entries.length === 0) return;
	const archivePath = path.join(dir, ARCHIVE_NAME);
	const lines = `${entries.map((h) => JSON.stringify(h)).join("\n")}\n`;
	try {
		await fsp.appendFile(archivePath, lines, "utf8");
	} catch {
		// best-effort; archive is not the source of truth
	}
}

/**
 * Locked read-modify-write. `fn` receives the current list and returns the
 * mutated list plus a result value. Eviction and archive append happen inside
 * the same lock hold. Never called from the injection (read) path.
 */
export async function mutateStore<T>(
	dir: string,
	scope: Scope,
	fn: (list: Heuristic[]) => { list: Heuristic[]; result: T },
): Promise<T> {
	const lockPath = await acquireLock(dir);
	try {
		const { list } = await readStore(dir);
		const { list: mutated, result } = fn(list);
		const { list: finalList, archived } = evict(mutated, scope);

		const jsonlPath = path.join(dir, JSONL_NAME);
		try {
			await fsp.copyFile(jsonlPath, path.join(dir, BAK_NAME));
		} catch {
			// best-effort backup; fine if source doesn't exist yet
		}

		await appendArchive(dir, archived);
		await atomicWrite(jsonlPath, serializeJsonl(finalList));

		injectionCache.delete(dir);
		return result;
	} finally {
		await releaseLock(lockPath);
	}
}

// ---------------------------------------------------------------------------
// Capture pipeline (DESIGN.md §4, §6)
// ---------------------------------------------------------------------------

export interface SaveResult {
	status: "added" | "reinforced" | "merged";
	id: string;
	warnings: string[];
}

/** sanitize -> secret scrub -> generality rewrite+lint (warn-only) -> dedup -> add/reinforce/merge -> eviction */
export async function saveHeuristic(
	dir: string,
	scope: Scope,
	project: string | null,
	rawText: string,
	category: Category,
	source: Source,
): Promise<SaveResult> {
	if (!rawText || !rawText.trim()) {
		throw new Error("Heuristic text must not be empty.");
	}

	const warnings: string[] = [];
	let text = sanitizeText(rawText);
	const secret = redactSecrets(text);
	text = secret.text;
	if (secret.warning) warnings.push(secret.warning);

	text = rewriteGenerality(text);
	const lintWarning = lintGenerality(text);
	if (lintWarning) warnings.push(lintWarning);

	if (!text.trim()) {
		throw new Error("Heuristic text must not be empty.");
	}

	return mutateStore(dir, scope, (list) => {
		const now = new Date().toISOString();
		const scoped = list.filter((h) => h.scope === scope && (h.project ?? null) === project);
		const norm = normalize(text);

		const exactMatch = scoped.find((h) => normalize(h.text) === norm);
		if (exactMatch) {
			const idx = list.findIndex((h) => h.id === exactMatch.id);
			const updated: Heuristic = { ...list[idx], hits: list[idx].hits + 1, lastReinforced: now };
			const newList = [...list];
			newList[idx] = updated;
			return { list: newList, result: { status: "reinforced" as const, id: updated.id, warnings } };
		}

		const newTokens = tokens(text);
		let best: { h: Heuristic; sim: number } | undefined;
		for (const h of scoped) {
			const sim = jaccard(newTokens, tokens(h.text));
			if (!best || sim > best.sim) best = { h, sim };
		}

		if (best && best.sim >= JACCARD_NEAR) {
			const idx = list.findIndex((h) => h.id === best!.h.id);
			const current = list[idx];
			const shouldReplaceText = best.sim >= JACCARD_MERGE && text.length > current.text.length;
			const status = shouldReplaceText ? ("merged" as const) : ("reinforced" as const);
			const updated: Heuristic = {
				...current,
				text: shouldReplaceText ? text : current.text,
				hits: current.hits + 1,
				lastReinforced: now,
			};
			const newList = [...list];
			newList[idx] = updated;
			return { list: newList, result: { status, id: updated.id, warnings } };
		}

		const entry: Heuristic = {
			id: newId(),
			text,
			scope,
			project,
			category,
			created: now,
			lastReinforced: now,
			hits: 0,
			source,
			pinned: false,
		};
		return { list: [...list, entry], result: { status: "added" as const, id: entry.id, warnings } };
	});
}

// ---------------------------------------------------------------------------
// Direct mutations (DESIGN.md §10)
// ---------------------------------------------------------------------------

export async function deleteById(dir: string, scope: Scope, id: string): Promise<boolean> {
	return mutateStore(dir, scope, (list) => {
		const found = list.some((h) => h.id === id);
		return { list: list.filter((h) => h.id !== id), result: found };
	});
}

export interface EditResult {
	found: boolean;
	warnings: string[];
}

export async function editText(dir: string, scope: Scope, id: string, rawText: string): Promise<EditResult> {
	let text = sanitizeText(rawText);
	const warnings: string[] = [];
	const secret = redactSecrets(text);
	text = secret.text;
	if (secret.warning) warnings.push(secret.warning);
	text = rewriteGenerality(text);

	return mutateStore(dir, scope, (list) => {
		const idx = list.findIndex((h) => h.id === id);
		if (idx === -1) return { list, result: { found: false, warnings } };
		const lintWarning = lintGenerality(text);
		if (lintWarning) warnings.push(lintWarning);
		const newList = [...list];
		newList[idx] = { ...newList[idx], text };
		return { list: newList, result: { found: true, warnings } };
	});
}

export async function setPinned(dir: string, scope: Scope, id: string, pinned: boolean): Promise<boolean> {
	return mutateStore(dir, scope, (list) => {
		const idx = list.findIndex((h) => h.id === id);
		if (idx === -1) return { list, result: false };
		const newList = [...list];
		newList[idx] = { ...newList[idx], pinned };
		return { list: newList, result: true };
	});
}

export async function promoteToGlobal(
	projectDir: string,
	globalStoreDir: string,
	id: string,
): Promise<{ found: boolean }> {
	const removed = await mutateStore(projectDir, "project", (list) => {
		const idx = list.findIndex((h) => h.id === id);
		if (idx === -1) return { list, result: undefined as Heuristic | undefined };
		return { list: list.filter((h) => h.id !== id), result: list[idx] };
	});
	if (!removed) return { found: false };

	await mutateStore(globalStoreDir, "global", (list) => {
		const now = new Date().toISOString();
		const promoted: Heuristic = {
			...removed,
			scope: "global",
			project: null,
			hits: removed.hits + 1,
			lastReinforced: now,
		};
		return { list: [...list, promoted], result: undefined };
	});
	return { found: true };
}

export async function demoteToProject(
	globalStoreDir: string,
	projectDir: string,
	projectPath: string,
	id: string,
): Promise<{ found: boolean }> {
	const removed = await mutateStore(globalStoreDir, "global", (list) => {
		const idx = list.findIndex((h) => h.id === id);
		if (idx === -1) return { list, result: undefined as Heuristic | undefined };
		return { list: list.filter((h) => h.id !== id), result: list[idx] };
	});
	if (!removed) return { found: false };

	await mutateStore(projectDir, "project", (list) => {
		const demoted: Heuristic = { ...removed, scope: "project", project: projectPath };
		return { list: [...list, demoted], result: undefined };
	});
	return { found: true };
}
