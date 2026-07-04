---
title: Graph-First Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/graph-first.ts
tags: [pi, extensions, graph, component]
aliases: ["graph-first.ts"]
summary: The extension that redirects structure-shaped grep/rg searches to the graph tool with a per-session escalation ladder (nudge → block → identical-retry bypass); content greps pass untouched. Inert when no graphify-out.
relationships:
  - target: "[[concepts/knowledge-graph-integration]]"
    type: implements
  - target: "[[concepts/fable-budget-invariants]]"
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

# Graph-First Extension

`extensions/graph-first.ts` — enforces the GRAPH-FIRST
[[concepts/fable-budget-invariants|budget invariant]]. Structure-shaped code
searches belong in the [[concepts/knowledge-graph-integration|knowledge graph]],
not grep, because the graph is ~30x cheaper.

## The escalation ladder (per session)

When `graphify-out/graph.json` exists, it watches the `bash` tool for grep/rg
commands hunting a symbol definition/reference/import:

1. **First** flagged grep → allow, inject a one-line nudge naming the equivalent
   `graph explain '<id>'` call.
2. **Second and later** → BLOCK, with a reason telling the model to re-run the
   IDENTICAL command to proceed if the graph genuinely can't answer.
3. **Identical retry of a block** → always allowed (recorded as a bypass).

## Conservative by design

A false positive (blocking a real content search) is worse than a miss, so the
classifier is deliberately careful:

- **Content greps pass untouched** — log strings, TODOs, prose, data values.
- A doc/log/text glob or a path under `docs/`/`logs/`/`README*` is treated as
  prose (target guard).
- A ≥3-word pattern is a sentence, not a declaration ("class action lawsuit").
- All-caps content markers (TODO/FIXME/ERROR/WARN) are excluded — a symbol has a
  lowercase letter or an underscore.

Only `bash` grep/rg is ever touched; nothing else is blocked. Inert and silent
when `graphify-out/` is absent, applies to subagents, and everything is wrapped
fail-open so it can never wedge a session.

## Self-improving closure

Per-session {nudges, blocks, bypasses} are appended to
`graphify-out/.graph_first_stats.json`. At `agent_end`, if bypasses ≥ blocks
(>0) the graph is consistently failing to answer, so one nudge suggests a
`/graphify --update` re-cache; `audit-pipelines.py` WARNs when the bypass ratio
stays high across sessions (see [[components/config-validation]]). This is the
[[synthesis/prose-to-code-promotion]] pattern — GRAPH-FIRST stops being a prose
rule and becomes an enforced ladder that measures its own effectiveness.

The read-side complement (exposing the `graph` tool and the prompt block) is the
[[components/graphify-bridge-extension]].
