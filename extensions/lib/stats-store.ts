/**
 * Shared atomic stats-array persister for the self-improving extensions
 * (graph-first.ts, lead-config.ts). Both append a per-session record to a small
 * JSON ring in graphify-out/ that audit-pipelines.py reads back.
 *
 * Pure (only node:fs / node:path) so it loads under jiti without the pi package
 * on the module path — the same constraint as lib/graph-lookup.ts, so the
 * extensions that import it stay checkable without node_modules provisioning.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Append-or-replace `record` (identity = `id`) into the JSON array at `path`,
 * capped at `maxRecords` (ring; newest kept), written atomically (tmp+rename).
 *
 * ponytail: atomic replace, last-writer-wins — no lock. Parallel subagents may
 * race this file and drop a record; acceptable for advisory stats, add a lock
 * only if a coverage/drift audit proves it lossy. Fail-open: never throws, and
 * skips silently when the containing dir is absent (no graphify-out here →
 * nothing to close the loop with).
 */
export function persistStatsRecord<T extends { id: string }>(path: string, record: T, maxRecords: number): void {
	try {
		if (!existsSync(dirname(path))) return;
		let arr: T[] = [];
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8"));
			if (Array.isArray(parsed)) arr = parsed;
		} catch {
			// absent/corrupt → start fresh
		}
		const i = arr.findIndex((r) => r && r.id === record.id);
		if (i >= 0) arr[i] = record;
		else arr.push(record);
		if (arr.length > maxRecords) arr = arr.slice(arr.length - maxRecords);
		const tmp = `${path}.${process.pid}.tmp`;
		writeFileSync(tmp, JSON.stringify(arr, null, 2));
		renameSync(tmp, path);
	} catch {
		// fail open: stats are never worth wedging a session
	}
}
