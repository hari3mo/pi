---
title: "concurrency-guard.ts"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Node: concurrency-guard.ts"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:42:49.723Z
updated: 2026-07-04T22:42:49.723Z
---

> [!draft] Auto-captured graph `explain` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: concurrency-guard.ts

## Answer

Node: concurrency-guard.ts
  ID:        extensions_concurrency_guard
  Source:    extensions/concurrency-guard.ts L1
  Type:      code
  Community: 38
  Degree:    12

Connections (12):
  <-- Config Index [] [INFERRED]
  <-- Global Agent Config — Orchestration Doctrine [] [INFERRED]
  --> validate-config.py [] [INFERRED]
  --> self-audit.ts [shares_data_with] [INFERRED]
  --> config-paths.ts [imports_from] [EXTRACTED]
  --> Oracle Index [] [INFERRED]
  --> isReloadResource() [imports] [EXTRACTED]
  <-- Concurrency Model [] [INFERRED]
  --> AGENT_DIR [contains] [EXTRACTED]
  --> agentRel() [contains] [EXTRACTED]
  --> git() [contains] [EXTRACTED]
  <-- Concurrency-Guard Extension [references] [EXTRACTED]

## Provenance

- graph tool action: `explain`
- captured: 2026-07-04T22:42:49.723Z
