/**
 * Shared config-path classification for the concurrency guard.
 *
 * Pure (only node:path) so it loads under jiti without the pi package on the
 * module path and is unit-testable in isolation (scripts/test-config-paths.mjs).
 */

import { basename } from "node:path";

/** Repo-relative dir prefixes whose contents pi loads as resources (need /reload). */
const RESOURCE_PREFIXES = ["extensions/", "skills/", "prompts/", "themes/"];
/** Repo-relative files pi loads at session/reload time (need /reload). */
// ponytail: settings.json excluded — pi rewrites it on every thinking-level/
// model/theme toggle, so tracking it as a reload resource just flags noise on
// every concurrent session. Add back only if it stops being machine-churned.
const RESOURCE_FILES = new Set(["keybindings.json"]);

/**
 * True when a repo-relative path is a pi-loaded resource whose in-memory copy
 * goes stale on a cross-shell change and can only be refreshed by `/reload`
 * (extensions, skills, prompts, themes, keybindings/settings, and any AGENTS.md
 * context file). Non-resource config (schema/, scripts/, docs/) is covered by
 * the self-audit re-run instead, not reload.
 */
export function isReloadResource(rel: string): boolean {
	if (RESOURCE_PREFIXES.some((p) => rel.startsWith(p))) return true;
	if (RESOURCE_FILES.has(rel)) return true;
	// AGENTS.md at the repo root or nested in a subdir is loaded into the prompt.
	// (settings.json is deliberately NOT here — see RESOURCE_FILES.)
	return basename(rel) === "AGENTS.md";
}
