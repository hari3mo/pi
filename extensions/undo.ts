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
 * it, restores files from that commit, and navigates back to it.
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
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

interface CheckpointData {
	sha: string | null;
	repoRoot: string | null;
}

interface ExecLikeResult {
	stdout: string;
	stderr: string;
	code: number;
}

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
		const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
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

			const snapshotOut = await runGit(["ls-files", "--cached"], repoRoot, env);
			const snapshotFiles = new Set(
				snapshotOut
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean),
			);

			const currentOut = await runGit(["ls-files", "--cached", "--others", "--exclude-standard"], repoRoot);
			const currentFiles = currentOut
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

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
	): { entry: SessionMessageEntry; index: number } | undefined {
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message" && entry.message.role === "user") {
				return { entry, index: i };
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

			const checkpoint = findCheckpointBefore(branch, userMessage.index);
			const promptText = extractPromptText(userMessage.entry.message.content);
			const preview = truncatePreview(promptText);

			const willRestoreFiles = Boolean(checkpoint?.data?.sha && checkpoint?.data?.repoRoot);

			if (ctx.hasUI) {
				const description = willRestoreFiles
					? `Revert files and conversation context to before: "${preview}"`
					: `Revert conversation context to before: "${preview}" (no file snapshot available)`;
				const ok = await ctx.ui.confirm("Undo last prompt?", description);
				if (!ok) return;
			}

			let filesRestored = false;
			if (checkpoint?.data?.sha && checkpoint.data.repoRoot) {
				try {
					await restoreFiles(checkpoint.data.repoRoot, checkpoint.data.sha);
					filesRestored = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					ctx.ui.notify(`File restore failed: ${message}`, "error");
					if (ctx.hasUI) {
						const proceed = await ctx.ui.confirm(
							"Continue with context-only undo?",
							"File restore failed. Revert conversation context anyway?",
						);
						if (!proceed) return;
					} else {
						return;
					}
				}
			}

			const targetId = checkpoint ? checkpoint.id : userMessage.entry.parentId;
			if (!targetId) {
				ctx.ui.notify("Can't rewind context further (no earlier point in this session)", "warning");
				return;
			}

			const result = await ctx.navigateTree(targetId, { summarize: false });
			if (result.cancelled) return;

			if (ctx.hasUI) {
				ctx.ui.setEditorText(promptText);
				if (filesRestored) {
					ctx.ui.notify(`Reverted files + context to before: "${preview}"`, "info");
				} else if (checkpoint && !checkpoint.data?.sha) {
					ctx.ui.notify("Context reverted (no file snapshot \u2014 not a git repo)", "info");
				} else {
					ctx.ui.notify(`Context reverted to before: "${preview}"`, "info");
				}
			}
		},
	});
}
