/**
 * Session Time Footer Extension
 *
 * Replaces the built-in footer with an equivalent one that adds a "session time"
 * stat (elapsed wall-clock time since the current session started) on the stats
 * line, positioned to the left of the context-usage ("ctx used") indicator.
 *
 * Everything else (pwd/branch/session name line, token/cost stats, context %,
 * right-aligned model name, extension status line) mirrors the built-in footer
 * as closely as the extension API allows. Two built-in details are not
 * reproducible from the extension API and are intentionally omitted:
 *   - the "(auto)" auto-compaction suffix on the context stat
 *   - the experimental-features "xp" badge
 * The thinking-level suffix on the model name is tracked via the
 * `thinking_level_select` event, so it may briefly be missing until the first
 * such event fires in a session.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" || (relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));
	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h > 0) return `⏱${h}h${String(m).padStart(2, "0")}m`;
	if (m > 0) return `⏱${m}m${String(s).padStart(2, "0")}s`;
	return `⏱${s}s`;
}

export default function (pi: ExtensionAPI) {
	let sessionStartedAt = Date.now();
	let thinkingLevel: ThinkingLevel | undefined;

	pi.on("thinking_level_select", async (event) => {
		thinkingLevel = event.level;
	});

	pi.on("session_start", async (_event, ctx) => {
		sessionStartedAt = Date.now();
		thinkingLevel = undefined;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			const interval = setInterval(() => tui.requestRender(), 1000);

			return {
				dispose() {
					unsub();
					clearInterval(interval);
				},
				invalidate() {},
				render(width: number): string[] {
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;
					let latestCacheHitRate: number | undefined;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const usage = entry.message.usage;
							totalInput += usage.input;
							totalOutput += usage.output;
							totalCacheRead += usage.cacheRead;
							totalCacheWrite += usage.cacheWrite;
							totalCost += usage.cost.total;
							const latestPromptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
							latestCacheHitRate = latestPromptTokens > 0 ? (usage.cacheRead / latestPromptTokens) * 100 : undefined;
						}
					}

					const contextUsage = ctx.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent = contextUsage?.percent !== null && contextUsage?.percent !== undefined ? contextPercentValue.toFixed(1) : "?";

					let pwd = formatCwdForFooter(ctx.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
					const branch = footerData.getGitBranch();
					if (branch) pwd = `${pwd} (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) pwd = `${pwd} • ${sessionName}`;

					const statsParts: string[] = [];
					if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
					if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
					if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
					if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
					if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
						statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
					}

					const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					if (totalCost || usingSubscription) {
						statsParts.push(`$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
					}

					// Session time: inserted just before the context-usage stat.
					statsParts.push(formatDuration(Date.now() - sessionStartedAt));

					const contextPercentDisplay =
						contextPercent === "?" ? `?/${formatTokens(contextWindow)}` : `${contextPercent}%/${formatTokens(contextWindow)}`;
					let contextPercentStr: string;
					if (contextPercentValue > 90) {
						contextPercentStr = theme.fg("error", contextPercentDisplay);
					} else if (contextPercentValue > 70) {
						contextPercentStr = theme.fg("warning", contextPercentDisplay);
					} else {
						contextPercentStr = contextPercentDisplay;
					}
					statsParts.push(contextPercentStr);

					let statsLeft = statsParts.join(" ");
					const modelName = ctx.model?.id || "no-model";
					let statsLeftWidth = visibleWidth(statsLeft);
					if (statsLeftWidth > width) {
						statsLeft = truncateToWidth(statsLeft, width, "...");
						statsLeftWidth = visibleWidth(statsLeft);
					}

					const minPadding = 2;
					let rightSideWithoutProvider = modelName;
					if (ctx.model?.reasoning) {
						rightSideWithoutProvider = thinkingLevel && thinkingLevel !== "off" ? `${modelName} • ${thinkingLevel}` : `${modelName} • thinking off`;
					}

					let rightSide = rightSideWithoutProvider;
					if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
						rightSide = `(${ctx.model.provider}) ${rightSideWithoutProvider}`;
						if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {
							rightSide = rightSideWithoutProvider;
						}
					}

					const rightSideWidth = visibleWidth(rightSide);
					const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;
					let statsLine: string;
					if (totalNeeded <= width) {
						const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
						statsLine = statsLeft + padding + rightSide;
					} else {
						const availableForRight = width - statsLeftWidth - minPadding;
						if (availableForRight > 0) {
							const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
							const truncatedRightWidth = visibleWidth(truncatedRight);
							const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
							statsLine = statsLeft + padding + truncatedRight;
						} else {
							statsLine = statsLeft;
						}
					}

					const dimStatsLeft = theme.fg("dim", statsLeft);
					const remainder = statsLine.slice(statsLeft.length);
					const dimRemainder = theme.fg("dim", remainder);
					const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
					const lines = [pwdLine, dimStatsLeft + dimRemainder];

					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const sortedStatuses = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim());
						lines.push(truncateToWidth(sortedStatuses.join(" "), width, theme.fg("dim", "...")));
					}

					return lines;
				},
			};
		});
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setFooter(undefined);
	});
}
