---
title: Graphify-Bridge Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/graphify-bridge.ts
tags: [pi, extensions, graph, component]
aliases: ["graphify-bridge.ts", "graph tool"]
summary: Native integration exposing the `graph` tool (query/explain/path/status) and /graph command, injecting a compact graph block each prompt, and keeping query-lessons fresh — with the cwd-then-agent-dir root resolution.
relationships:
  - target: "[[concepts/knowledge-graph-integration]]"
    type: implements
  - target: "[[components/graph-first-extension]]"
    type: related_to
  - target: "[[components/impact-trace-extension]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Graphify-Bridge Extension

`extensions/graphify-bridge.ts` — the native bridge between pi and the graphify
knowledge graph, so the harness can answer questions about itself from the graph
instead of re-reading files. The read-side heart of
[[concepts/knowledge-graph-integration]].

## What it provides

1. **`before_agent_start` injection** — a compact (~600 char) block into the
   system prompt: size, top hubs, staleness, and the instruction to answer
   codebase/architecture questions via the `graph` tool first.
2. **`graph` tool** — `query` / `explain` / `path` / `status` against the nearest
   `graphify-out/graph.json`, shelling out to the pinned graphify Python.
3. **`/graph` command** — status for humans; `/graph update` re-runs the free AST
   rebuild + recluster (code only; doc changes need `/graphify --update`).
4. **`session_start`** — fire-and-forget `graphify reflect --if-stale` so
   `LESSONS.md` (preferred sources / dead ends from past queries) stays fresh.

## Root resolution — the cwd gotcha (durable)

`findGraphRoot` walks **up from cwd** to the nearest `graphify-out/graph.json`
(per-project graphs must win), then **falls back to the agent config dir**
(`getAgentDir()`, i.e. `~/.pi/agent`) so the harness can always reach its OWN
graph even from a cwd outside it. Consequence: from an unrelated directory the
`graph` tool answers describe the `~/.pi/agent` config, **not** the local
project. This is the resolution behind the [[concepts/knowledge-graph-integration|cwd gotcha]].

## Staleness model (durable)

Cheap stats come straight from `graph.json`, cached by mtime; `contains` edges
(file→entity tree structure) are excluded from degree so data files don't look
like hubs. A `needs_update` marker means **docs/images** changed since last
extraction — surfaced as STALE with a `/graphify --update` suggestion; **code**
stays fresh automatically via the git post-commit hook.

The write-time redirection and dependent-surfacing complements are the
[[components/graph-first-extension]] and [[components/impact-trace-extension]].

*(This page distills durable design; live node/edge counts and hubs come from
the `graph status` action itself.)*
