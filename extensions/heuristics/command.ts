/**
 * `/heuristics` command. See DESIGN.md §10.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
	deleteById,
	demoteToProject,
	editText,
	globalDir,
	findGitRoot,
	projectDirFor,
	promoteToGlobal,
	readStore,
	saveHeuristic,
	setPinned,
} from "./store.ts";
import type { Category, Heuristic, Scope } from "./schema.ts";
import { scoreOf } from "./schema.ts";

const SUBCOMMANDS = ["list", "add", "rm", "delete", "edit", "promote", "demote", "pin", "unpin", "stats"];
const ID_SUBCOMMANDS = new Set(["rm", "delete", "edit", "promote", "demote", "pin", "unpin"]);

function splitFirst(s: string): [string, string] {
	const trimmed = s.trim();
	const m = trimmed.match(/^(\S+)\s*([\s\S]*)$/);
	if (!m) return ["", ""];
	return [m[1], m[2].trim()];
}

function truncate(text: string, n: number): string {
	return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/**
 * ctx.ui.notify is a no-op when `!ctx.hasUI` (print/json modes use a no-op UI
 * context), so every /heuristics subcommand must also echo to stdout in that
 * case to remain visible in `pi -p`. See DESIGN.md §10 + review fix 1.
 */
function output(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	ctx.ui.notify(message, type);
	if (!ctx.hasUI) {
		console.log(message);
	}
}

function formatEntry(h: Heuristic): string {
	const pin = h.pinned ? " 📌" : "";
	return `[${h.id}] (${h.scope}/${h.category}, hits=${h.hits}${pin}) ${truncate(h.text, 100)}`;
}

async function loadCombined(ctx: ExtensionCommandContext): Promise<{ global: Heuristic[]; project: Heuristic[] }> {
	const g = await readStore(globalDir());
	const trusted = ctx.isProjectTrusted();
	const project = trusted ? (await readStore(projectDirFor(ctx.cwd))).list : [];
	return { global: g.list, project };
}

async function findEntry(
	ctx: ExtensionCommandContext,
	id: string,
): Promise<{ scope: Scope; dir: string; entry: Heuristic } | undefined> {
	const gDir = globalDir();
	const g = await readStore(gDir);
	const foundGlobal = g.list.find((h) => h.id === id);
	if (foundGlobal) return { scope: "global", dir: gDir, entry: foundGlobal };
	if (ctx.isProjectTrusted()) {
		const pDir = projectDirFor(ctx.cwd);
		const p = await readStore(pDir);
		const foundProject = p.list.find((h) => h.id === id);
		if (foundProject) return { scope: "project", dir: pDir, entry: foundProject };
	}
	return undefined;
}

function sortForDisplay(list: Heuristic[]): Heuristic[] {
	const now = Date.now();
	return [...list].sort((a, b) => scoreOf(b, now) - scoreOf(a, now));
}

async function printList(ctx: ExtensionCommandContext, which: "global" | "project" | "all"): Promise<void> {
	const { global, project } = await loadCombined(ctx);
	const lines: string[] = [];
	if (which === "global" || which === "all") {
		lines.push(`Global (${global.length}):`);
		for (const h of sortForDisplay(global)) lines.push(formatEntry(h));
	}
	if (which === "project" || which === "all") {
		if (ctx.isProjectTrusted()) {
			lines.push(`Project (${project.length}):`);
			for (const h of sortForDisplay(project)) lines.push(formatEntry(h));
		} else {
			lines.push("Project: (not shown; project is not trusted)");
		}
	}
	output(ctx, lines.length > 0 ? lines.join("\n") : "No heuristics recorded yet.", "info");
}

async function printStats(ctx: ExtensionCommandContext): Promise<void> {
	const { global, project } = await loadCombined(ctx);
	const byCategory = (list: Heuristic[]) => {
		const counts = new Map<string, number>();
		for (const h of list) counts.set(h.category, (counts.get(h.category) ?? 0) + 1);
		return Array.from(counts.entries())
			.map(([k, v]) => `${k}=${v}`)
			.join(", ");
	};
	const lines = [
		`Global: ${global.length} (${byCategory(global) || "none"}); pinned=${global.filter((h) => h.pinned).length}`,
		ctx.isProjectTrusted()
			? `Project: ${project.length} (${byCategory(project) || "none"}); pinned=${project.filter((h) => h.pinned).length}`
			: "Project: (not shown; project is not trusted)",
	];
	output(ctx, lines.join("\n"), "info");
}

function parseAddArgs(rest: string): { scope: Scope; text: string } {
	const [first, remainder] = splitFirst(rest);
	const lower = first.toLowerCase();
	if (lower === "global" || lower === "project") {
		return { scope: lower as Scope, text: remainder };
	}
	return { scope: "project", text: rest };
}

async function handleAdd(ctx: ExtensionCommandContext, rest: string): Promise<void> {
	const { scope: requestedScope, text } = parseAddArgs(rest);
	if (!text.trim()) {
		output(ctx, "Usage: /heuristics add [global|project] <text>", "error");
		return;
	}
	let scope: Scope = requestedScope;
	let project: string | null = null;
	const warnings: string[] = [];
	if (scope === "project") {
		if (!ctx.isProjectTrusted()) {
			scope = "global";
			warnings.push("project not trusted; saved to global heuristics");
		} else {
			project = findGitRoot(ctx.cwd);
		}
	}
	const dir = scope === "global" ? globalDir() : projectDirFor(ctx.cwd);
	const category: Category = "workflow";
	try {
		const result = await saveHeuristic(dir, scope, project, text, category, "user");
		const allWarnings = [...warnings, ...result.warnings];
		const msg = `Learned (${result.status}) [${result.id}]${allWarnings.length ? `\n${allWarnings.join("\n")}` : ""}`;
		output(ctx, msg, "info");
	} catch (err) {
		output(ctx, `Failed to add heuristic: ${err instanceof Error ? err.message : String(err)}`, "error");
	}
}

async function handleRm(ctx: ExtensionCommandContext, id: string): Promise<void> {
	if (!id) {
		output(ctx, "Usage: /heuristics rm <id>", "error");
		return;
	}
	const found = await findEntry(ctx, id);
	if (!found) {
		output(ctx, `No heuristic found with id ${id}`, "error");
		return;
	}
	await deleteById(found.dir, found.scope, id);
	output(ctx, `Deleted ${id}`, "info");
}

async function handleEdit(ctx: ExtensionCommandContext, id: string): Promise<void> {
	if (ctx.mode !== "tui") {
		output(ctx, "/heuristics edit requires the TUI.", "error");
		return;
	}
	if (!id) {
		output(ctx, "Usage: /heuristics edit <id>", "error");
		return;
	}
	const found = await findEntry(ctx, id);
	if (!found) {
		output(ctx, `No heuristic found with id ${id}`, "error");
		return;
	}
	const newText = await ctx.ui.editor("Edit heuristic:", found.entry.text);
	if (newText === undefined) return;
	const result = await editText(found.dir, found.scope, id, newText);
	if (!result.found) {
		output(ctx, `No heuristic found with id ${id}`, "error");
		return;
	}
	const msg = `Updated ${id}${result.warnings.length ? `\n${result.warnings.join("\n")}` : ""}`;
	output(ctx, msg, "info");
}

async function handlePromote(ctx: ExtensionCommandContext, id: string): Promise<void> {
	if (!id) {
		output(ctx, "Usage: /heuristics promote <id>", "error");
		return;
	}
	if (!ctx.isProjectTrusted()) {
		output(ctx, "project not trusted; cannot promote", "error");
		return;
	}
	const result = await promoteToGlobal(projectDirFor(ctx.cwd), globalDir(), id);
	output(ctx, result.found ? `Promoted ${id} to global` : `No project heuristic found with id ${id}`, result.found ? "info" : "error");
}

async function handleDemote(ctx: ExtensionCommandContext, id: string): Promise<void> {
	if (!id) {
		output(ctx, "Usage: /heuristics demote <id>", "error");
		return;
	}
	if (!ctx.isProjectTrusted()) {
		output(ctx, "project not trusted; cannot demote", "error");
		return;
	}
	const result = await demoteToProject(globalDir(), projectDirFor(ctx.cwd), findGitRoot(ctx.cwd), id);
	output(ctx, result.found ? `Demoted ${id} to project` : `No global heuristic found with id ${id}`, result.found ? "info" : "error");
}

async function handlePin(ctx: ExtensionCommandContext, id: string, pinned: boolean): Promise<void> {
	if (!id) {
		output(ctx, `Usage: /heuristics ${pinned ? "pin" : "unpin"} <id>`, "error");
		return;
	}
	const found = await findEntry(ctx, id);
	if (!found) {
		output(ctx, `No heuristic found with id ${id}`, "error");
		return;
	}
	await setPinned(found.dir, found.scope, id, pinned);
	output(ctx, `${pinned ? "Pinned" : "Unpinned"} ${id}`, "info");
}

async function runAction(ctx: ExtensionCommandContext, action: string, entry: Heuristic, dir: string, scope: Scope): Promise<void> {
	switch (action) {
		case "pin":
			await setPinned(dir, scope, entry.id, true);
			output(ctx, `Pinned ${entry.id}`, "info");
			return;
		case "unpin":
			await setPinned(dir, scope, entry.id, false);
			output(ctx, `Unpinned ${entry.id}`, "info");
			return;
		case "delete":
			await deleteById(dir, scope, entry.id);
			output(ctx, `Deleted ${entry.id}`, "info");
			return;
		case "edit": {
			const newText = await ctx.ui.editor("Edit heuristic:", entry.text);
			if (newText === undefined) return;
			const result = await editText(dir, scope, entry.id, newText);
			output(ctx, `Updated ${entry.id}${result.warnings.length ? `\n${result.warnings.join("\n")}` : ""}`, "info");
			return;
		}
		case "promote":
			if (scope !== "project") return;
			await handlePromote(ctx, entry.id);
			return;
		case "demote":
			if (scope !== "global") return;
			await handleDemote(ctx, entry.id);
			return;
		default:
			return;
	}
}

async function interactiveList(ctx: ExtensionCommandContext): Promise<void> {
	// biome-ignore lint/suspicious/noConstantCondition: interactive loop, exits via return
	while (true) {
		const { global, project } = await loadCombined(ctx);
		const combined: Array<{ entry: Heuristic; dir: string; scope: Scope }> = [
			...sortForDisplay(global).map((entry) => ({ entry, dir: globalDir(), scope: "global" as Scope })),
			...(ctx.isProjectTrusted()
				? sortForDisplay(project).map((entry) => ({ entry, dir: projectDirFor(ctx.cwd), scope: "project" as Scope }))
				: []),
		];
		if (combined.length === 0) {
			output(ctx, "No heuristics recorded yet.", "info");
			return;
		}
		const options = combined.map((c) => formatEntry(c.entry));
		const choice = await ctx.ui.select("Heuristics", options);
		if (choice === undefined) return;
		const idx = options.indexOf(choice);
		const picked = combined[idx];
		if (!picked) return;

		const actions = ["pin", "unpin", "edit", "delete", picked.scope === "project" ? "promote" : "demote", "cancel"];
		const action = await ctx.ui.select(`Action for ${picked.entry.id}`, actions);
		if (!action || action === "cancel") continue;
		await runAction(ctx, action, picked.entry, picked.dir, picked.scope);
	}
}

export function registerHeuristicsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("heuristics", {
		description: "Manage learned heuristics (durable cross-session lessons)",
		getArgumentCompletions: async (argumentPrefix: string): Promise<AutocompleteItem[] | null> => {
			const hasSpace = /\s/.test(argumentPrefix);
			if (!hasSpace) {
				const items = SUBCOMMANDS.map((s) => ({ value: s, label: s }));
				const filtered = items.filter((i) => i.value.startsWith(argumentPrefix));
				return filtered.length > 0 ? filtered : null;
			}
			const [sub, idPrefix] = splitFirst(argumentPrefix);
			if (!ID_SUBCOMMANDS.has(sub.toLowerCase())) return null;
			// No ctx here (getArgumentCompletions has no cwd/trust access), so only the
			// global store — never trust-gated — is safe to read for completions.
			const { list } = await readStore(globalDir());
			const items = list
				.filter((h) => h.id.startsWith(idPrefix))
				.map((h) => ({ value: h.id, label: `${h.id} — ${truncate(h.text, 50)}` }));
			return items.length > 0 ? items : null;
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			if (!trimmed) {
				if (ctx.mode === "tui") {
					await interactiveList(ctx);
				} else {
					await printList(ctx, "all");
				}
				return;
			}

			const [sub, rest] = splitFirst(trimmed);
			const subLower = sub.toLowerCase();

			switch (subLower) {
				case "list": {
					const which = rest.toLowerCase();
					if (which === "global" || which === "project" || which === "all" || which === "") {
						await printList(ctx, (which || "all") as "global" | "project" | "all");
					} else {
						output(ctx, "Usage: /heuristics list [global|project|all]", "error");
					}
					return;
				}
				case "add":
					await handleAdd(ctx, rest);
					return;
				case "rm":
				case "delete":
					await handleRm(ctx, splitFirst(rest)[0]);
					return;
				case "edit":
					await handleEdit(ctx, splitFirst(rest)[0]);
					return;
				case "promote":
					await handlePromote(ctx, splitFirst(rest)[0]);
					return;
				case "demote":
					await handleDemote(ctx, splitFirst(rest)[0]);
					return;
				case "pin":
					await handlePin(ctx, splitFirst(rest)[0], true);
					return;
				case "unpin":
					await handlePin(ctx, splitFirst(rest)[0], false);
					return;
				case "stats":
					await printStats(ctx);
					return;
				default:
					output(ctx, 
						"Usage: /heuristics [list|add|rm|edit|promote|demote|pin|unpin|stats] ...",
						"error",
					);
			}
		},
	});
}
