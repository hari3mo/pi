---
title: Impact-Trace Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/impact-trace.ts
tags: [pi, extensions, graph, component]
aliases: ["impact-trace.ts"]
summary: After every successful edit/write, surfaces the file's inbound graph dependents (fileA:line (references)) so cross-file impact is visible without asking; debounced once per file, with an agent_end follow-through reminder.
relationships:
  - target: "[[concepts/knowledge-graph-integration]]"
    type: implements
  - target: "[[components/graphify-bridge-extension]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Impact-Trace Extension

`extensions/impact-trace.ts` — the write-side complement to
[[concepts/knowledge-graph-integration|graph-first]]. Every successful edit/write
surfaces the file's graph dependents so cross-file impact is visible without the
agent having to ask.

## What it does

When `graphify-out/graph.json` exists, after an edit it resolves the file
repo-relative, looks up its nodes, and collects **inbound** cross-file references
(other files whose nodes point at this file via references/calls/imports edges).
If any exist it injects one message:

> `[impact-trace] <file> is referenced by: <fileA>:<line> (references), … — verify each reflects the change.`

The list is capped at 10 (+ "…and N more"). A "(graph may be stale — rebuilt on
commit)" note is appended when `graph.json` predates the edit or the
`needs_update` flag is set (mirrors the bridge's staleness signal).

## Design intent (durable)

- **Debounced once per file per session** — no repeated nagging on the same
  file.
- **Silent** when there are no inbound refs, the file isn't in the graph,
  `graphify-out/` is absent, or on any error — never wedge an edit.
- **Order-aware follow-through.** `agent_end` sends ONE summary reminder for
  dependents that were flagged but never subsequently edited (a dependent edited
  *before* its flag stays pending — that earlier edit couldn't reflect the later
  change). No auto-dispatch, no blocking. Applies to subagents.

## Gotcha (verified)

Messages sent with `deliverAs: "nextTurn"` (this extension and the
[[components/graph-first-extension]] nudge) are **invisible to the agent within
the same run** — they surface on the next turn. Verify those branches
behaviorally, not by expecting them in the current transcript. ^[ambiguous]

The read-side counterpart is the [[components/graphify-bridge-extension]].
