---
title: Knowledge-Graph Integration
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/graphify-bridge.ts
  - /Users/harissaif/.pi/agent/extensions/graph-first.ts
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, graph, concept]
aliases: ["Graph-First Doctrine", "Graphify Integration"]
summary: The harness treats its own graphify knowledge graph as the source of truth for live code structure — graph-first over grep, a strict division of labor with this vault, and a cwd-resolution gotcha.
relationships:
  - target: "[[concepts/fable-budget-invariants]]"
    type: related_to
  - target: "[[components/graphify-bridge-extension]]"
    type: implements
  - target: "[[components/graph-first-extension]]"
    type: implements
  - target: "[[SCHEMA]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Knowledge-Graph Integration

The harness maintains a graphify knowledge graph of itself
(`graphify-out/graph.json`) and treats it as the **live map of the config** —
the thing you query for structure/architecture questions before reading files.

## Graph-first, because it is ~30x cheaper

The governing rule (a [[concepts/fable-budget-invariants|budget invariant]]):
when `graphify-out/graph.json` exists, answer "where is X / what references F /
current call graph" via the `graph` tool (query / explain / path) **before**
reading files or dispatching a scout. Two extensions make this real:

- The [[components/graphify-bridge-extension]] exposes the `graph` tool, injects
  a compact graph block (size, hubs, staleness) into each prompt, and keeps
  query-lessons fresh (`reflect --if-stale`).
- The [[components/graph-first-extension]] redirects structure-shaped
  `grep`/`rg` to the graph tool with an escalation ladder (nudge, then block,
  with an identical-retry bypass). Content greps pass untouched.

Code changes rebuild the graph automatically via a git post-commit hook; **doc**
changes leave it STALE (`needs_update`) until `/graphify --update`.

## Division of labor with this vault (critical for Oracle)

| Question shape | Answer with |
|---|---|
| "What is X / why does pi do Y / how do I use Z" (durable knowledge) | **Oracle** (this vault) |
| "Where is symbol S defined / what references F / current call graph" (live structure) | **graphify `graph` tool** |

Oracle pages MUST NOT duplicate volatile file-level structure (line numbers,
current import graphs, symbol locations) — that drifts on every commit and
belongs to the graph. This vault distills **durable design and intent**; when a
page needs to point at code it names the file/concept and defers the live
structure to `graph`. See [[SCHEMA]] (*Graph-Tool Division of Labor*).

## The cwd-resolution gotcha

The `graph` tool resolves `graphify-out` by walking up from cwd, **with a
fallback to the agent config dir's graph**. So a cwd that has its own
`graphify-out` always wins, but from an unrelated directory the graph answers
describe the `~/.pi/agent` config, **not** the local project. When graph answers
look surprisingly like harness internals, check which root resolved. ^[ambiguous]

The `impact-trace` extension is the write-side complement: after every edit it
surfaces the file's inbound graph dependents so cross-file impact is visible
without asking — see [[components/impact-trace-extension]].
