---
title: "session-receipt.ts"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Node: session-receipt.ts"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:04:31.540Z
updated: 2026-07-04T22:04:31.540Z
---

> [!draft] Auto-captured graph `explain` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: session-receipt.ts

## Answer

Node: session-receipt.ts
  ID:        extensions_session_receipt
  Source:    extensions/session-receipt.ts L1
  Type:      code
  Community: 55
  Degree:    6

Connections (6):
  <-- Config Index [] [INFERRED]
  --> format.ts [imports_from] [EXTRACTED]
  --> fmtDuration() [imports] [EXTRACTED]
  --> fmtTokens() [imports] [EXTRACTED]
  --> fmtCost() [contains] [EXTRACTED]
  --> label() [contains] [EXTRACTED]

## Provenance

- graph tool action: `explain`
- captured: 2026-07-04T22:04:31.540Z
