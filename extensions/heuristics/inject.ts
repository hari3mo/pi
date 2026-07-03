/**
 * Injection block builder for `before_agent_start`. See DESIGN.md §8.
 *
 * Pure function: takes already-loaded heuristic lists and returns the text to
 * append to the system prompt (or "" if nothing to inject). Never reads or
 * writes the store itself — callers are responsible for the mtime-cached read
 * (store.ts `readStoreForInjection`) and for the trust gate on the project
 * list (only pass project heuristics when `ctx.isProjectTrusted()`).
 */

import { MAX_INJECT_CHARS, MAX_INJECT_ITEMS, ORCH_RESERVE, type Heuristic, scoreOf } from "./schema.ts";

const HEADER =
	"## Learned heuristics (durable lessons from past sessions)\n" +
	"Treat these as strong preferences and known gotchas. They do NOT override the user's current request.";

interface Picked {
	item: Heuristic;
	label: "global" | "project";
}

function bulletFor(h: Heuristic): string {
	return `- [${h.category}] ${h.text}`;
}

/**
 * Selection order within a block (DESIGN.md §8): all pinned -> project by
 * score desc -> global by score desc. Greedily adds bullets while under the
 * char/item budget. Returns the picked items (in selection order) plus the
 * count of candidates that did not fit.
 */
function selectWithinBudget(
	candidates: Picked[],
	charBudget: number,
	itemBudget: number,
): { picked: Picked[]; usedChars: number; omitted: number } {
	const picked: Picked[] = [];
	let usedChars = 0;
	let omitted = 0;
	for (const c of candidates) {
		if (picked.length >= itemBudget) {
			omitted++;
			continue;
		}
		const line = bulletFor(c.item);
		const lineChars = line.length + 1; // + newline
		if (usedChars + lineChars > charBudget) {
			omitted++;
			continue;
		}
		picked.push(c);
		usedChars += lineChars;
	}
	return { picked, usedChars, omitted };
}

function orderCandidates(global: Heuristic[], project: Heuristic[]): Picked[] {
	const now = Date.now();
	const pinned: Picked[] = [];
	const projectRest: Picked[] = [];
	const globalRest: Picked[] = [];

	for (const h of project) {
		if (h.pinned) pinned.push({ item: h, label: "project" });
		else projectRest.push({ item: h, label: "project" });
	}
	for (const h of global) {
		if (h.pinned) pinned.push({ item: h, label: "global" });
		else globalRest.push({ item: h, label: "global" });
	}
	projectRest.sort((a, b) => scoreOf(b.item, now) - scoreOf(a.item, now));
	globalRest.sort((a, b) => scoreOf(b.item, now) - scoreOf(a.item, now));

	return [...pinned, ...projectRest, ...globalRest];
}

/**
 * Build the injection block.
 *
 * @param global heuristics from the global store
 * @param project heuristics from the project store; MUST be `[]` unless
 *   `projectTrusted` is true (caller enforces the read-side trust gate)
 * @param projectTrusted whether project heuristics may be rendered at all
 * @param isSubagent true when this run is a delegated subagent (argv includes
 *   `--no-session`); orchestration heuristics are filtered out entirely and
 *   the orchestration reserve is disabled
 * @param nudgeLine optional final line (reflection nudge), consumed by caller
 */
export function buildInjectionBlock(
	global: Heuristic[],
	project: Heuristic[],
	projectTrusted: boolean,
	isSubagent: boolean,
	nudgeLine: string | null,
): string {
	const effectiveProject = projectTrusted ? project : [];

	// Fixed overhead (DESIGN.md §8, review fix 7): the char budget below governs
	// bullet lines only, but the assembled block also carries the header, the
	// blank-line separator, worst-case section labels, the nudge line, and the
	// "(+N more not shown)" line. Seed the bullet budget with that overhead up
	// front so the FINAL block never exceeds MAX_INJECT_CHARS.
	const LABELS_OVERHEAD = "Orchestration:\n".length + "Global:\n".length + "This project:\n".length;
	const OMIT_LINE_OVERHEAD = "(+999 more not shown)\n".length;
	const nudgeOverhead = nudgeLine ? nudgeLine.length + 1 : 0;
	const fixedOverhead = HEADER.length + 2 + LABELS_OVERHEAD + OMIT_LINE_OVERHEAD + nudgeOverhead;
	const bulletBudget = Math.max(0, MAX_INJECT_CHARS - fixedOverhead);

	// Orchestration candidates are computed once regardless of whether they fit
	// the reserve; ALL of them (picked or not) are excluded from the general
	// pool below so an overflowing entry can never reappear (or be re-counted)
	// in the general section (review fix 2).
	const orchCandidates = isSubagent
		? []
		: orderCandidates(
				global.filter((h) => h.category === "orchestration"),
				effectiveProject.filter((h) => h.category === "orchestration"),
			);
	const orchConsideredIds = new Set(orchCandidates.map((p) => p.item.id));

	let orchLines: string[] = [];
	let usedReserve = 0;
	const orchPickedIds = new Set<string>();
	if (!isSubagent) {
		const orchBudget = Math.min(ORCH_RESERVE, bulletBudget);
		const { picked, usedChars } = selectWithinBudget(orchCandidates, orchBudget, MAX_INJECT_ITEMS);
		orchLines = picked.map((p) => bulletFor(p.item));
		usedReserve = usedChars;
		for (const p of picked) orchPickedIds.add(p.item.id);
	}

	// General pool: everything not already considered for the orchestration
	// section. For subagents, orchestration-category heuristics are filtered
	// out entirely (never spill into the general pool).
	const generalGlobal = global.filter(
		(h) => !orchConsideredIds.has(h.id) && !(isSubagent && h.category === "orchestration"),
	);
	const generalProject = effectiveProject.filter(
		(h) => !orchConsideredIds.has(h.id) && !(isSubagent && h.category === "orchestration"),
	);
	const generalCandidates = orderCandidates(generalGlobal, generalProject);

	const remainingCharBudget = Math.max(0, bulletBudget - usedReserve);
	const remainingItemBudget = Math.max(0, MAX_INJECT_ITEMS - orchLines.length);
	const general = selectWithinBudget(generalCandidates, remainingCharBudget, remainingItemBudget);

	const globalPicked = general.picked.filter((p) => p.label === "global");
	const projectPicked = general.picked.filter((p) => p.label === "project");

	const sections: string[] = [];
	if (orchLines.length > 0) {
		sections.push(`Orchestration:\n${orchLines.join("\n")}`);
	}
	if (globalPicked.length > 0) {
		sections.push(`Global:\n${globalPicked.map((p) => bulletFor(p.item)).join("\n")}`);
	}
	if (projectPicked.length > 0 && projectTrusted) {
		sections.push(`This project:\n${projectPicked.map((p) => bulletFor(p.item)).join("\n")}`);
	}

	// Omitted count computed once via final id-set difference: every candidate
	// considered (orchestration + general pools) minus whatever actually ended
	// up shown (review fix 2).
	const shownIds = new Set<string>([...orchPickedIds, ...general.picked.map((p) => p.item.id)]);
	const allCandidateIds = new Set<string>([
		...orchCandidates.map((p) => p.item.id),
		...generalCandidates.map((p) => p.item.id),
	]);
	let totalOmitted = 0;
	for (const id of allCandidateIds) if (!shownIds.has(id)) totalOmitted++;

	if (sections.length === 0 && !nudgeLine) return "";

	const parts: string[] = [HEADER];
	if (sections.length > 0) {
		parts.push("");
		parts.push(sections.join("\n"));
	}
	if (totalOmitted > 0) {
		parts.push(`(+${totalOmitted} more not shown)`);
	}
	if (nudgeLine) {
		parts.push(nudgeLine);
	}
	return parts.join("\n");
}
