/**
 * Rendered view (HEURISTICS.md) and the interop README. See DESIGN.md §10-11.
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { Heuristic, Scope } from "./schema.ts";

const BANNER =
	"<!-- GENERATED — do not edit. Source: heuristics.jsonl. Regenerated on every change; edits are overwritten. -->";

const INTRO =
	"Learned working agreements distilled from past sessions. Harness-neutral; safe to import into any agent context file.";

/**
 * Render HEURISTICS.md for a single-scope store. Deterministic output to keep
 * git diffs quiet: categories sorted alphabetically, pinned-first then
 * created-ascending within each category. Score is never used for render order.
 */
export function renderMarkdown(list: Heuristic[], scope: Scope): string {
	const h1 = scope === "global" ? "# Global Heuristics" : "# Project Heuristics";

	if (list.length === 0) {
		return `${BANNER}\n\n${h1}\n\n${INTRO}\n\n_No heuristics recorded yet._\n`;
	}

	const byCategory = new Map<string, Heuristic[]>();
	for (const h of list) {
		const arr = byCategory.get(h.category);
		if (arr) arr.push(h);
		else byCategory.set(h.category, [h]);
	}

	const categories = Array.from(byCategory.keys()).sort();
	const sections: string[] = [];
	for (const category of categories) {
		const items = (byCategory.get(category) ?? []).slice().sort((a, b) => {
			if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
			return a.created.localeCompare(b.created);
		});
		const bullets = items.map((h) => `- ${h.text}`).join("\n");
		sections.push(`## ${category}\n\n${bullets}`);
	}

	return `${BANNER}\n\n${h1}\n\n${INTRO}\n\n${sections.join("\n\n")}\n`;
}

const README_TEMPLATE = `# Heuristics store (harness-neutral)

This directory stores durable, cross-session lessons ("heuristics") in a format any
coding agent or harness can read.

## Files

- \`heuristics.jsonl\` — source of truth, one JSON object per line.
- \`HEURISTICS.md\` — generated, human/agent-readable view. **Regenerated on every
  change; manual edits are overwritten.**
- \`archive.jsonl\` — evicted heuristics (append-only). Not read by any agent.
- \`README.md\` — this file. Written once; safe to edit, never regenerated.

## Using this with other harnesses

Add this line to your agent's instructions or context file:

> Read ~/.agents/heuristics/HEURISTICS.md and follow those heuristics.

(For project heuristics, point at \`.agents/heuristics/HEURISTICS.md\` in the repo instead.)

### Claude Code

Claude Code supports file imports. Add one of these to your \`CLAUDE.md\`:

\`\`\`
@~/.agents/heuristics/HEURISTICS.md
@.agents/heuristics/HEURISTICS.md
\`\`\`

Pi itself loads these heuristics automatically and does not need an import line.

## Caution

- \`HEURISTICS.md\` is regenerated from \`heuristics.jsonl\` on every write — do not
  hand-edit it; edits are overwritten.
- Review before committing \`.agents/heuristics/\` to version control. Heuristics are
  scrubbed for common secret patterns on save, but no scrub is perfect. Treat this
  directory like any other project file for secret-handling purposes.
`;

/** Write README.md only if it does not already exist. Never overwrites. */
export async function ensureReadme(dir: string): Promise<void> {
	const readmePath = path.join(dir, "README.md");
	try {
		await fsp.access(readmePath);
		return;
	} catch {
		// does not exist yet — fall through and write it
	}
	try {
		await fsp.writeFile(readmePath, README_TEMPLATE, "utf8");
	} catch {
		// best-effort; never throw from the write pipeline over a doc file
	}
}
