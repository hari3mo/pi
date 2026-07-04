---
title: Concurrency-Guard Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/concurrency-guard.ts
  - /Users/harissaif/.pi/agent/extensions/lib/change-detection.ts
tags: [pi, extensions, config, component]
aliases: ["concurrency-guard.ts", "/refresh", "change-detection.ts"]
summary: Thin extension over the lib/change-detection.ts engine — ONE detection/classification pass per repo advance broadcast as config-repo-advanced, a persistent stale-loaded-resource registry (recurring prompt block + widget), an edit gate that blocks the first edit to a stale not-re-read resource, and /refresh. Fail-open on any git error.
relationships:
  - target: "[[concepts/concurrency-model]]"
    type: implements
  - target: "[[concepts/self-audit-loop]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T12:00:00Z
---

# Concurrency-Guard Extension

`extensions/concurrency-guard.ts` — a **thin consumer** of the single
cross-shell change engine `extensions/lib/change-detection.ts`
(`createChangeTracker`). All detection, classification, staleness state, and
git logic live in the tracker; the extension only wires pi events to it and
renders results. This is the runtime behind the [[concepts/concurrency-model]].

## The engine (lib/change-detection.ts)

- **`detectAdvance()`** — THE one detection + classification pass (called once
  per `before_agent_start`). HEAD moved since the session last looked →
  classify each committed file: own autocommit snapshot (committed blob hash ==
  hash recorded on our last write) = **silent**; never-edited-by-us =
  **foreign**; edited-by-us with different content = **collided** (highest
  risk). Any changed loaded resource (per `isReloadResource`) is registered in
  a **persistent staleness registry** with its concrete git delta
  (`git log --oneline` summary).
- **`checkEdit()`** — THE one per-edit classification: stale not-re-read
  resource → *block first attempt, warn once on the second, then stand aside*
  (never wedge); target git-dirty from another shell → warn once.
- **`recordWrite()` / `recordRead()`** — feed the session's own edits (touched
  set + post-edit blob hash) and reads (cures the stale-edit gate) back in.
- The registry only empties on `reset()` — i.e. on reload, exactly when the
  in-memory copies stop being stale.

## The consumer interface

Each `RepoAdvance` (`{ range, foreign, collided, staleResources }`) is
re-broadcast verbatim as **`config-repo-advanced`** on the shared bus — the one
interface any subscriber uses. [[concepts/self-audit-loop]] re-runs
`validate-config.py` off it; future consumers get the classified result with no
extra pass.

## The hooks (rendering only)

1. **`before_agent_start`** — advance notices ("HIGHEST RISK … RE-READ" for
   collided, plain foreign notice) plus, while ANY loaded resource is stale, a
   recurring **"Stale loaded resources"** block re-injected EVERY turn (file,
   range, delta, re-read state) and a persistent widget above the editor — not
   one forgettable prose notice.
2. **`tool_call` (edit/write)** — renders `checkEdit()`: `{ block: true }` for
   the first edit to a stale not-re-read resource (verified pi 0.80.3
   capability), `[concurrency-guard]` warning messages otherwise.
3. **`tool_result`** — non-error edit/write → `recordWrite`; non-error read →
   `recordRead` (cures the gate).
4. **`agent_end`** — ≥2 same-file collisions → one serialize-the-sessions nudge.

## `/refresh`

The manual companion. An event hook *cannot* dispatch a command in pi 0.80.3
(`sendUserMessage` hard-sets `expandPromptTemplates:false`, verified in
`dist/core/agent-session.js`) and `ctx.reload()` exists only on a command
context — so the auto-surfaces can only *tell* the user to reload. `/refresh`
reports the pending delta (`tracker.pendingDelta()`) then `ctx.reload()`, which
re-fires `session_start` → `tracker.reset()` clears the baseline, the stale
registry, and the widget, so nothing re-fires for the change just synced.

## Design intent (durable)

- **Fail-open.** Every handler body is try/caught; any git failure degrades to
  silence for that event, never blocks a turn. The edit gate blocks at most
  once per file and warns at most once — it can never wedge a session whose
  re-read it could not observe (e.g. via bash).
- It mechanically enforces the archived lesson *"edits in `~/.pi/agent` can be
  silently wiped by a concurrent session — grep the live file rather than
  trusting session memory."*
- Regression contract lives in `scripts/check-concurrency-guard.mjs` (drives
  the shipped extension against a scratch repo; checks (a)–(k)).

*(Live symbol/call structure → the `graph` tool per
[[concepts/knowledge-graph-integration]].)*
