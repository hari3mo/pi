/**
 * Undo Extension: /undo reverts conversation context AND file changes to
 * the state right before the user's last prompt. Repeated /undo walks back
 * one prompt at a time. /redo reverses the most recent /undo.
 *
 * On every before_agent_start we snapshot the full working tree (tracked +
 * untracked, respecting .gitignore) into a git commit object via a
 * throwaway temp index, without touching the real index/working tree. The
 * sha (or null if not a git repo) is persisted as a custom session entry
 * ("undo-checkpoint") via pi.appendEntry(), which lands immediately before
 * the user's message since before_agent_start fires before that message is
 * appended. /undo finds the last user message, the checkpoint right before
 * it, navigates back to it, restores files from that commit, and records an
 * "undo-redo" entry (with a snapshot of the pre-undo state and the leaf we
 * came from) so /redo can reverse the operation.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

interface RedoData {
	sha: string | null;
	repoRoot: string | null;
	oldLeafId: string | null;
}

interface ExecLikeResult {
	stdout: string;
	stderr: string;
	code: number;
}

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

	/** Walk the branch backwards for the most recent "undo-redo" entry, stopping at the first user message. */
	function findRedoEntry(branch: SessionEntry[]): CustomEntry<RedoData> | undefined {
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "custom" && entry.customType === "undo-redo") {
				return entry as CustomEntry<RedoData>;
			}
			if (entry.type === "message" && entry.message.role === "user") {
				return undefined;
			}
		}
		return undefined;
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

			const willRestoreFiles = Boolean(checkpoint?.data?.sha && checkpoint?.data?.repoRoot);

			if (ctx.hasUI) {
				const description = willRestoreFiles
					? `Revert files and conversation context to before: "${preview}"`
					: `Revert conversation context to before: "${preview}" (no file snapshot available)`;
				const ok = await ctx.ui.confirm("Undo last prompt?", description);
				if (!ok) return;
			}

			// Snapshot the current (pre-undo) tree so /redo can restore it later.
			const redoSnapshot = await snapshot(ctx.cwd);
			const oldLeafId = ctx.sessionManager.getLeafId();

			// Re-check in case the branch moved during the confirm dialog / snapshot.
			const freshBranch = ctx.sessionManager.getBranch();
			const freshUserMessage = findLastUserMessage(freshBranch);
			if (!freshUserMessage) {
				ctx.ui.notify("Nothing to undo", "warning");
				return;
			}
			checkpoint = findCheckpointBefore(freshBranch, freshUserMessage.index);
			promptText = extractPromptText(freshUserMessage.message.content);
			preview = truncatePreview(promptText);
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

			pi.appendEntry<RedoData>("undo-redo", {
				sha: redoSnapshot.sha,
				repoRoot: redoSnapshot.repoRoot,
				oldLeafId,
			});

			let filesRestored = false;
			let fileRestoreError: string | undefined;
			if (checkpoint?.data?.sha && checkpoint.data.repoRoot) {
				try {
					await restoreFiles(checkpoint.data.repoRoot, checkpoint.data.sha);
					filesRestored = true;
				} catch (err) {
					fileRestoreError = err instanceof Error ? err.message : String(err);
				}
			}

			if (ctx.hasUI) {
				ctx.ui.setEditorText(promptText);
				if (fileRestoreError) {
					ctx.ui.notify(
						`Context reverted, but file restore failed: ${fileRestoreError}`,
						"error",
					);
				} else if (filesRestored) {
					ctx.ui.notify(`Reverted files + context to before: "${preview}"`, "info");
				} else if (checkpoint && !checkpoint.data?.sha) {
					ctx.ui.notify("Context reverted (no file snapshot \u2014 not a git repo)", "info");
				} else {
					ctx.ui.notify(`Context reverted to before: "${preview}"`, "info");
				}
			}
		},
	});

	pi.registerCommand("redo", {
		description: "Go forward again after /undo (restores context and files)",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const branch = ctx.sessionManager.getBranch();
			const redoEntry = findRedoEntry(branch);
			if (!redoEntry?.data) {
				ctx.ui.notify("Nothing to redo", "warning");
				return;
			}

			const { sha, repoRoot, oldLeafId } = redoEntry.data;

			if (ctx.hasUI) {
				const description =
					sha && repoRoot
						? "Go forward again? Files will be restored."
						: "Go forward again? (no file snapshot available)";
				const ok = await ctx.ui.confirm("Redo?", description);
				if (!ok) return;
			}

			let navigated = false;
			if (oldLeafId) {
				// Forked/cloned sessions copy only the root->leaf path, so the
				// pre-undo leaf may not exist in this session file.
				const targetExists = Boolean(ctx.sessionManager.getEntry(oldLeafId));
				if (!targetExists) {
					ctx.ui.notify("Cannot restore context (that point isn't in this session)", "warning");
				} else {
					try {
						const result = await ctx.navigateTree(oldLeafId, { summarize: false });
						if (result.cancelled) {
							ctx.ui.notify("Redo cancelled", "warning");
							return;
						}
						navigated = true;
					} catch {
						ctx.ui.notify("Cannot restore context (that point isn't in this session)", "warning");
					}
				}
			}

			let filesRestored = false;
			if (sha && repoRoot) {
				try {
					await restoreFiles(repoRoot, sha);
					filesRestored = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					ctx.ui.notify(
						navigated
							? `Context moved forward, but file restore failed: ${message}`
							: `File restore failed: ${message}`,
						"error",
					);
					return;
				}
			}

			if (ctx.hasUI) {
				if (navigated && filesRestored) {
					ctx.ui.notify("Redone: context and files restored", "info");
				} else if (navigated) {
					ctx.ui.notify("Redone: context restored (no file snapshot)", "info");
				} else if (filesRestored) {
					ctx.ui.notify("Redone: files restored", "info");
				} else {
					ctx.ui.notify("Nothing to redo (empty redo entry)", "warning");
				}
			}
		},
	});

}
