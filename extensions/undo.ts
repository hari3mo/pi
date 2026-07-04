/**
 * Undo Extension: /undo reverts conversation context AND file changes to
 * the state right before the user's last prompt. Repeated /undo walks back
 * one prompt at a time.
 *
 * On every before_agent_start we snapshot the full working tree (tracked +
 * untracked, respecting .gitignore) into a git commit object via a
 * throwaway temp index, without touching the real index/working tree. The
 * sha (or null if not a git repo) is persisted as a custom session entry
 * ("undo-checkpoint") via pi.appendEntry(), which lands immediately before
 * the user's message since before_agent_start fires before that message is
 * appended. /undo finds the last user message, the checkpoint right before
 * it, navigates back to it, and restores files from that commit.
 *
 * Outside a git repo there is no commit snapshot to restore from, so a
 * tool_call handler backs up any file touched by a write/edit tool call
 * (per prompt) under getAgentDir()/undo-backups before the mutation
 * happens. When /undo runs without a git snapshot, those backups are
 * restored instead. Backups older than BACKUP_TTL_DAYS are garbage
 * collected on session_start.
 *
 * Limitation: outside a git repo, files created or modified by bash (or
 * any tool other than write/edit) are not covered by this fallback.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type {
	CustomEntry,
	ExtensionAPI,
	SessionEntry,
	SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import type { ImageContent, TextContent, UserMessage } from "@earendil-works/pi-ai";

interface CheckpointData {
	sha: string | null;
	repoRoot: string | null;
}

interface ExecLikeResult {
	stdout: string;
	stderr: string;
	code: number;
}

interface FallbackManifestEntry {
	path: string;
	state: "present" | "absent" | "skipped";
	blob?: string;
}

interface DiskManifest {
	version: 1;
	entries: FallbackManifestEntry[];
}

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const BACKUP_TTL_DAYS = 14;

/** Unicode space variants normalized by pi's tool path handling. */
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/** git commit-tree fails without a configured identity; pin a stable synthetic one. */
const GIT_IDENTITY_ENV: NodeJS.ProcessEnv = {
	GIT_AUTHOR_NAME: "pi-undo",
	GIT_AUTHOR_EMAIL: "pi-undo@local",
	GIT_COMMITTER_NAME: "pi-undo",
	GIT_COMMITTER_EMAIL: "pi-undo@local",
};

/** Run execFile with a Promise wrapper that never rejects; mirrors pi.exec's {stdout,stderr,code} shape. */
function execFileWithEnv(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<ExecLikeResult> {
	return new Promise((resolve) => {
		execFile(command, args, { cwd, env, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
			const code = error ? (typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? (error as unknown as { code: number }).code : 1) : 0;
			resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
		});
	});
}

/** Replace any character outside [A-Za-z0-9_-] so ids are safe path segments. */
function sanitizeId(id: string): string {
	return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function backupRoot(): string {
	return join(getAgentDir(), "undo-backups");
}

function sessionDir(sessionId: string): string {
	return join(backupRoot(), sanitizeId(sessionId));
}

function checkpointDir(sessionId: string, checkpointId: string): string {
	return join(sessionDir(sessionId), sanitizeId(checkpointId));
}

/** Read+parse manifest.json; on any error (missing, corrupt, wrong shape) return an empty manifest. */
async function readDiskManifest(dir: string): Promise<DiskManifest> {
	try {
		const raw = await readFile(join(dir, "manifest.json"), "utf8");
		const parsed = JSON.parse(raw) as DiskManifest;
		return Array.isArray(parsed?.entries) ? parsed : { version: 1, entries: [] };
	} catch {
		return { version: 1, entries: [] };
	}
}

/** Write manifest.json atomically: write to a tmp name in the same dir, then rename. */
async function writeDiskManifest(dir: string, manifest: DiskManifest): Promise<void> {
	await mkdir(dir, { recursive: true });
	const tmpPath = join(dir, `manifest.${randomUUID()}.tmp`);
	await writeFile(tmpPath, JSON.stringify(manifest), "utf8");
	await rename(tmpPath, join(dir, "manifest.json"));
}

/**
 * Back up `absPath` for this checkpoint, first-backup-wins: if the file
 * already has an entry for this checkpoint, its state as of the checkpoint
 * is already preserved and we do nothing.
 */
async function backupBeforeMutation(
	sessionId: string,
	checkpointId: string,
	absPath: string,
): Promise<void> {
	const dir = checkpointDir(sessionId, checkpointId);
	const manifest = await readDiskManifest(dir);
	if (manifest.entries.some((entry) => entry.path === absPath)) return;

	let entry: FallbackManifestEntry;
	try {
		const info = await stat(absPath);
		if (info.size > MAX_BACKUP_BYTES) {
			entry = { path: absPath, state: "skipped" };
		} else {
			const blobName = `${randomUUID()}.bin`;
			await mkdir(join(dir, "blobs"), { recursive: true });
			await copyFile(absPath, join(dir, "blobs", blobName));
			entry = { path: absPath, state: "present", blob: blobName };
		}
	} catch {
		entry = { path: absPath, state: "absent" };
	}

	manifest.entries.push(entry);
	await writeDiskManifest(dir, manifest);
}

/** Best-effort restore of a fallback manifest's entries. Keeps going past per-entry failures. */
async function applyFallbackRestore(
	dir: string,
	entries: FallbackManifestEntry[],
): Promise<{ restored: number; failures: string[] }> {
	let restored = 0;
	const failures: string[] = [];

	for (const entry of entries) {
		try {
			if (entry.state === "present") {
				if (!entry.blob) throw new Error("missing blob reference");
				await mkdir(dirname(entry.path), { recursive: true });
				await copyFile(join(dir, "blobs", entry.blob), entry.path);
				restored++;
			} else if (entry.state === "absent") {
				await rm(entry.path, { force: true });
				restored++;
			} else {
				failures.push(entry.path);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failures.push(`${entry.path}: ${message}`);
		}
	}

	return { restored, failures };
}

/** Delete backup directories older than BACKUP_TTL_DAYS. Entirely best-effort and silent. */
async function gcBackups(): Promise<void> {
	try {
		const root = backupRoot();
		const sessionIds = await readdir(root);
		const cutoffMs = BACKUP_TTL_DAYS * 24 * 60 * 60 * 1000;
		for (const sessionId of sessionIds) {
			const path = join(root, sessionId);
			try {
				const info = await stat(path);
				if (Date.now() - info.mtimeMs > cutoffMs) {
					await rm(path, { recursive: true, force: true });
				}
			} catch {
				// best-effort; skip entries we can't stat/remove
			}
		}
	} catch {
		// best-effort; e.g. backupRoot() doesn't exist yet
	}
}

export default function (pi: ExtensionAPI) {
	const repoRootCache = new Map<string, Promise<string | null>>();

	function getRepoRoot(cwd: string): Promise<string | null> {
		let cached = repoRootCache.get(cwd);
		if (!cached) {
			cached = pi
				.exec("git", ["rev-parse", "--show-toplevel"], { cwd })
				.then((result) => (result.code === 0 ? result.stdout.trim() : null))
				.catch(() => null);
			repoRootCache.set(cwd, cached);
		}
		return cached;
	}

	/** Run a git command. Pass `env` to use a temp index; omit it to use pi.exec (real index). */
	async function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
		const result = env ? await execFileWithEnv("git", args, cwd, env) : await pi.exec("git", args, { cwd });
		if (result.code !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
		}
		return result.stdout;
	}

	/** Snapshot the full working tree (tracked + untracked, respecting .gitignore) into a commit object. */
	async function snapshot(cwd: string): Promise<CheckpointData> {
		const repoRoot = await getRepoRoot(cwd);
		if (!repoRoot) return { sha: null, repoRoot: null };

		const tmpIndex = join(tmpdir(), `pi-undo-index-${randomUUID()}`);
		const env = { ...process.env, ...GIT_IDENTITY_ENV, GIT_INDEX_FILE: tmpIndex };
		try {
			await runGit(["add", "-A"], repoRoot, env);
			const treeSha = (await runGit(["write-tree"], repoRoot, env)).trim();

			let headSha: string | null = null;
			try {
				const head = await pi.exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: repoRoot });
				if (head.code === 0) headSha = head.stdout.trim();
			} catch {
				headSha = null;
			}

			const commitArgs = ["commit-tree", treeSha, "-m", "pi-undo checkpoint"];
			if (headSha) commitArgs.push("-p", headSha);
			const commitSha = (await runGit(commitArgs, repoRoot, env)).trim();

			return { sha: commitSha, repoRoot };
		} catch {
			return { sha: null, repoRoot };
		} finally {
			await rm(tmpIndex, { force: true }).catch(() => {});
		}
	}

	/** Restore the working tree to `sha`, deleting files created after the checkpoint. */
	async function restoreFiles(repoRoot: string, sha: string): Promise<void> {
		const tmpIndex = join(tmpdir(), `pi-undo-index-${randomUUID()}`);
		const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
		try {
			await runGit(["read-tree", sha], repoRoot, env);
			await runGit(["checkout-index", "-a", "-f"], repoRoot, env);

			// Use -z / NUL-delimited output and skip trimming: git quotes/escapes
			// non-ASCII or special paths in normal output, which corrupts them.
			const snapshotOut = await runGit(["ls-files", "-z", "--cached"], repoRoot, env);
			const snapshotFiles = new Set(snapshotOut.split("\0").filter((path) => path.length > 0));

			const currentOut = await runGit(
				["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
				repoRoot,
			);
			const currentFiles = currentOut.split("\0").filter((path) => path.length > 0);

			for (const file of currentFiles) {
				if (!snapshotFiles.has(file)) {
					await rm(join(repoRoot, file), { force: true }).catch(() => {});
				}
			}
		} finally {
			await rm(tmpIndex, { force: true }).catch(() => {});
		}
	}

	function findLastUserMessage(
		branch: SessionEntry[],
	): { entry: SessionMessageEntry; message: UserMessage; index: number } | undefined {
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message" && entry.message.role === "user") {
				return { entry, message: entry.message, index: i };
			}
		}
		return undefined;
	}

	function findCheckpointBefore(
		branch: SessionEntry[],
		index: number,
	): CustomEntry<CheckpointData> | undefined {
		for (let i = index - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "custom" && entry.customType === "undo-checkpoint") {
				return entry as CustomEntry<CheckpointData>;
			}
		}
		return undefined;
	}

	/** Walk the branch backwards for the most recent "undo-checkpoint" entry. */
	function lastCheckpointOnBranch(branch: SessionEntry[]): CustomEntry<CheckpointData> | undefined {
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "custom" && entry.customType === "undo-checkpoint") {
				return entry as CustomEntry<CheckpointData>;
			}
		}
		return undefined;
	}

	/**
	 * Mirror pi's own write/edit path resolution (resolveToCwd): normalize
	 * unicode spaces, strip a leading "@", expand "~", handle file:// URLs,
	 * then resolve against cwd. The backed-up path must equal the path the
	 * tool actually mutates.
	 */
	function normalizeToolPath(input: string, stripAt: boolean): string {
		let normalized = input;
		if (stripAt) {
			normalized = normalized.replace(UNICODE_SPACES, " ");
			if (normalized.startsWith("@")) normalized = normalized.slice(1);
		}
		const home = homedir();
		if (normalized === "~") return home;
		if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))) {
			return join(home, normalized.slice(2));
		}
		if (/^file:\/\//.test(normalized)) {
			return fileURLToPath(normalized);
		}
		return normalized;
	}

	function resolveToolPath(input: string, cwd: string): string {
		const normalized = normalizeToolPath(input, true);
		const normalizedBase = normalizeToolPath(cwd, false);
		return isAbsolute(normalized) ? resolve(normalized) : resolve(normalizedBase, normalized);
	}

	function extractPromptText(content: string | (TextContent | ImageContent)[]): string {
		if (typeof content === "string") return content;
		return content
			.filter((part): part is TextContent => part.type === "text")
			.map((part) => part.text)
			.join("\n");
	}

	function truncatePreview(text: string, max = 80): string {
		const singleLine = text.replace(/\s+/g, " ").trim();
		return singleLine.length > max ? `${singleLine.slice(0, max - 1)}\u2026` : singleLine;
	}

	// Snapshot on every prompt, right before the user message is appended.
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const { sha, repoRoot } = await snapshot(ctx.cwd);
			pi.appendEntry<CheckpointData>("undo-checkpoint", { sha, repoRoot });
		} catch {
			pi.appendEntry<CheckpointData>("undo-checkpoint", { sha: null, repoRoot: null });
		}
	});

	// Garbage-collect stale fallback backups. Never allowed to break startup.
	pi.on("session_start", async () => {
		try {
			await gcBackups();
		} catch {
			// best-effort
		}
	});

	// Outside a git repo the per-prompt commit snapshot doesn't cover files,
	// so back up write/edit targets ourselves before the mutation happens.
	pi.on("tool_call", async (event, ctx) => {
		let rawPath: string | undefined;
		if (isToolCallEventType("write", event)) rawPath = event.input.path;
		else if (isToolCallEventType("edit", event)) rawPath = event.input.path;
		else return;

		try {
			const branch = ctx.sessionManager.getBranch();
			const ckpt = lastCheckpointOnBranch(branch);
			if (!ckpt || ckpt.data?.sha) return; // git snapshot covers this prompt
			const sid = ctx.sessionManager.getSessionId();
			if (!sid) return;
			const abs = resolveToolPath(rawPath, ctx.cwd);
			await backupBeforeMutation(sid, ckpt.id, abs);
		} catch {
			// best-effort; never block the tool
		}
	});

	pi.registerCommand("undo", {
		description: "Revert conversation and file changes to just before your last prompt",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const branch = ctx.sessionManager.getBranch();
			const userMessage = findLastUserMessage(branch);
			if (!userMessage) {
				ctx.ui.notify("Nothing to undo", "warning");
				return;
			}

			let checkpoint = findCheckpointBefore(branch, userMessage.index);
			let promptText = extractPromptText(userMessage.message.content);
			let preview = truncatePreview(promptText);

			const sid = ctx.sessionManager.getSessionId();
			let gitMode = Boolean(checkpoint?.data?.sha && checkpoint?.data?.repoRoot);
			let restoreManifest: FallbackManifestEntry[] =
				!gitMode && checkpoint && sid
					? (await readDiskManifest(checkpointDir(sid, checkpoint.id))).entries
					: [];
			const willRestoreFiles = gitMode || restoreManifest.length > 0;

			if (ctx.hasUI) {
				const description = gitMode
					? `Revert files and conversation context to before: "${preview}"`
					: willRestoreFiles
						? `Revert conversation and tracked file writes/edits to before: "${preview}" (bash-created files are not covered)`
						: `Revert conversation context to before: "${preview}" (no file snapshot available)`;
				const ok = await ctx.ui.confirm("Undo last prompt?", description);
				if (!ok) return;
			}

			// Re-check in case the branch moved during the confirm dialog.
			const freshBranch = ctx.sessionManager.getBranch();
			const freshUserMessage = findLastUserMessage(freshBranch);
			if (!freshUserMessage) {
				ctx.ui.notify("Nothing to undo", "warning");
				return;
			}
			checkpoint = findCheckpointBefore(freshBranch, freshUserMessage.index);
			promptText = extractPromptText(freshUserMessage.message.content);
			preview = truncatePreview(promptText);
			gitMode = Boolean(checkpoint?.data?.sha && checkpoint?.data?.repoRoot);
			restoreManifest =
				!gitMode && checkpoint && sid
					? (await readDiskManifest(checkpointDir(sid, checkpoint.id))).entries
					: [];

			const targetId = checkpoint ? checkpoint.id : freshUserMessage.entry.parentId;
			if (!targetId) {
				ctx.ui.notify("Can't rewind context further (no earlier point in this session)", "warning");
				return;
			}

			// Navigate context first: if another extension cancels the tree
			// navigation, files must remain untouched.
			const result = await ctx.navigateTree(targetId, { summarize: false });
			if (result.cancelled) {
				ctx.ui.notify("Undo cancelled", "warning");
				return;
			}

			let filesRestored = false;
			let fallbackRestoredCount = 0;
			let fileRestoreError: string | undefined;
			if (gitMode && checkpoint?.data?.sha && checkpoint.data.repoRoot) {
				try {
					await restoreFiles(checkpoint.data.repoRoot, checkpoint.data.sha);
					filesRestored = true;
				} catch (err) {
					fileRestoreError = err instanceof Error ? err.message : String(err);
				}
			} else if (restoreManifest.length > 0 && checkpoint && sid) {
				const { restored, failures } = await applyFallbackRestore(
					checkpointDir(sid, checkpoint.id),
					restoreManifest,
				);
				fallbackRestoredCount = restored;
				if (failures.length > 0) fileRestoreError = failures.join(", ");
			}

			if (ctx.hasUI) {
				ctx.ui.setEditorText(promptText);
				if (gitMode && fileRestoreError) {
					ctx.ui.notify(
						`Context reverted, but file restore failed: ${fileRestoreError}`,
						"error",
					);
				} else if (gitMode && filesRestored) {
					ctx.ui.notify(`Reverted files + context to before: "${preview}"`, "info");
				} else if (!gitMode && fileRestoreError) {
					ctx.ui.notify(
						`Context reverted, but some files could not be restored: ${fileRestoreError}`,
						"error",
					);
				} else if (!gitMode && fallbackRestoredCount > 0) {
					ctx.ui.notify(
						`Reverted context + ${fallbackRestoredCount} tracked file(s) to before: "${preview}" (bash-created files not covered)`,
						"info",
					);
				} else if (checkpoint && !checkpoint.data?.sha) {
					ctx.ui.notify("Context reverted (no file snapshot \u2014 not a git repo)", "info");
				} else {
					ctx.ui.notify(`Context reverted to before: "${preview}"`, "info");
				}
			}
		},
	});
}
