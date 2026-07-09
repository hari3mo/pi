# Learning Pipeline — Event Contract (v2)

Shared contract between the Pi-side capture taps (learning-tap extension,
Phase 1) and the out-of-session distiller (Hermes cron, Phase 2). Both sides
treat THIS file as authoritative. Full design:
`~/.hermes/plans/2026-07-04_210500-pi-learning-loop-redesign.md`.
Domain compartmentalization (v2):
`~/.hermes/plans/2026-07-09_113000-prism-domain-compartmentalization.md`.

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

Git: runtime data IS tracked — deliberately. Multi-machine peer sync
(docs/sync.md) carries `events.jsonl`, `receipts.jsonl`, and heuristics stores
across machines with a `merge=union` driver (.gitattributes), so concurrent
appends from two peers merge without conflict. `.distiller-cursor` and
`digests/` are tracked too; the distiller runs on ONE machine only (the Mac)
so the cursor has a single writer. SCHEMA.md and PHASE1-DISPATCH.md ARE tracked.

## Event schema (one JSON object per line)

```jsonc
{
  "id": "ev_<base36 epoch-ms>_<4 rand>",
  "ts": "ISO 8601",
  "session": "<pi session id>",
  "cwd": "/abs/project/path",
  "domain": "pi" | "prism",   // v2, OPTIONAL — absent means "pi" (back-compat)
  "kind": "verdict" | "rework" | "correction" | "query" | "explicit" | "violation",
  "payload": { },          // kind-specific, below
  "evidence": ["session:<id>#<msgidx>", "file:line", "verdict:<eventId>"]
}
```

### domain (v2)

Which knowledge domain the event belongs to; decides WHERE the distiller
promotes it (see routing below). Assignment: the session's cwd sets the
default via `config/domains.json` prefixes (`extensions/lib/domains.ts`
classifyCwd — e.g. `~/prism` on the Mac or the EC2 SageMaker shared
filesystem → `prism`); the `learn` tool may override per event with an
explicit `domain` argument. Receipts carry the same field. Events/receipts
without the field are `pi` — no migration of old lines.

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
- **Domain routing (v2):** events partition by `domain` (absent = `pi`).
  - `pi` events → pi stores, unchanged: `~/.pi/agent/heuristics/` +
    per-repo `.pi/heuristics/`, oracle `learned` pages, `learning/digests/`.
  - `prism` events → the prism-oracle repo (path per platform in
    `config/domains.json`): `<oracle>/heuristics/heuristics.jsonl` (same
    schema as pi's, DESIGN.md §1), `learned`-layer pages in
    `<oracle>/prism-wiki/`, digests in `<oracle>/learning/digests/`.
    The human-curated `<oracle>/learnings.md` and
    `<oracle>/prism-wiki/heuristics.md` are NEVER machine-written.
    The distiller pulls the prism-oracle repo before writing and
    commits+pushes after; if the pull fails it skips prism routing and
    leaves those events for the next run (cursor not advanced past them).
- Dedupes against the matching domain's knowledge before writing; reinforces
  instead of duplicating.
- Writes ONLY: heuristics stores (per their DESIGN.md schema), wiki/oracle
  `learned`-layer pages (per the vault's SCHEMA), `digests/`, the cursor, and
  archival moves into `_archives/`. Never edits upstream/local pages —
  contradictions are flagged `disputed` in the digest instead.
- Advances the cursor only after a fully successful run (crash-safe replay).
- Single writer: the distiller runs on ONE machine (the Mac) for BOTH
  domains. Peers append events; the pi-repo union-merge carries them to the
  Mac.

## Liveness (self-audit additions, Phase 1 item 5)

- WARN: events.jsonl exists and mtime > 7 days (taps dead)
- WARN: cursor lastRunTs > 7 days behind newest event (distiller dead)
- WARN: wiki/_raw/ contains files older than 14 days (staging stalled)
- ERROR: events.jsonl > 10 MB (runaway tap)
