# Learning Pipeline — Event Contract (v1)

Shared contract between the Pi-side capture taps (learning-tap extension,
Phase 1) and the out-of-session distiller (Hermes cron, Phase 2). Both sides
treat THIS file as authoritative. Full design:
`~/.hermes/plans/2026-07-04_210500-pi-learning-loop-redesign.md`.

## Files (this directory)

- `events.jsonl`      — append-only intake. Writers: learning-tap, `learn` tool.
- `receipts.jsonl`    — per-session consumed-knowledge manifests (Phase 3, LIVE):
                        `{ session, ts, cwd, heuristicIdsInjected, wikiPagesRead,
                        graphQueries, correctionsCaptured, violations, outcome }`.
                        Written at session_shutdown even when no events were
                        buffered (the "consumed but nothing happened" signal).
- `.distiller-cursor` — JSON `{ "lastEventId": "...", "lastRunTs": "ISO" }`.
                        Writer: distiller only.
- `digests/YYYY-MM-DD.md` — human-readable distiller run reports.
- `.lock`             — write lock, protocol identical to heuristics DESIGN.md §2
                        (wx-open, 10s stale-steal, backoff ≤130×100ms).

Git: runtime data. Exclude `events.jsonl`, `receipts.jsonl`, `.distiller-cursor`,
`digests/` from config snapshots the same way graphify-out/ artifacts are
excluded. SCHEMA.md and PHASE1-DISPATCH.md ARE tracked.

## Event schema (one JSON object per line)

```jsonc
{
  "id": "ev_<base36 epoch-ms>_<4 rand>",
  "ts": "ISO 8601",
  "session": "<pi session id>",
  "cwd": "/abs/project/path",
  "kind": "verdict" | "rework" | "correction" | "query" | "explicit" | "violation",
  "payload": { },          // kind-specific, below
  "evidence": ["session:<id>#<msgidx>", "file:line", "verdict:<eventId>"]
}
```

Caps: payload strings individually ≤4000 chars (findings/answer) or ≤1000
(userText); whole line ≤8KB; writers drop oversize rather than truncate JSON.

### payload by kind

- `verdict`   `{ role: "peer"|"doctor", verdict: "PASS"|"FAIL: implementation"|"FAIL: design", findings, taskSpecHash }`
- `rework`    `{ chainLen, firstFailFindings, finalVerdict }`
- `correction` `{ precedingAction, userText, basis: "inferred"|"user-confirmed" }`
- `query`     `{ tool: "graph"|"wiki-query", action, question, answer }`
              NOTE: raw graph node/edge dumps are NOT durable knowledge —
              apply knowledge-compound's isSubstantive filter AND skip answers
              matching /^Traversal: BFS/ (regenerable; distiller drops them).
- `explicit`  `{ text, category: "correction"|"gotcha"|"environment"|"workflow"|"convention"|"orchestration", scope: "global"|"project", basis }`
- `violation` `{ doctrine: "budget"|"wiki-first"|"graph-first", detail }`

## Distiller contract (what Pi may assume)

- Runs nightly out-of-session; reads events after `.distiller-cursor`, plus
  `graphify-out/reflections/LESSONS.md` and any legacy `wiki/_raw/*` files.
- Dedupes against the wiki vault before writing; reinforces instead of
  duplicating.
- Writes ONLY: heuristics stores (per their DESIGN.md schema), wiki
  `learned`-layer pages (per wiki/SCHEMA.md), `digests/`, the cursor, and
  archival moves into `wiki/_archives/`. Never edits upstream/local pages —
  contradictions are flagged `disputed` in the digest instead.
- Advances the cursor only after a fully successful run (crash-safe replay).

## Liveness (self-audit additions, Phase 1 item 5)

- WARN: events.jsonl exists and mtime > 7 days (taps dead)
- WARN: cursor lastRunTs > 7 days behind newest event (distiller dead)
- WARN: wiki/_raw/ contains files older than 14 days (staging stalled)
- ERROR: events.jsonl > 10 MB (runaway tap)
