---
title: "oracle-first extension"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['oracle-first.ts', 'OracleFirstState', 'OracleFirstAction'] | 10 nodes found"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T20:10:43.115Z
updated: 2026-07-04T20:10:43.115Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: oracle-first extension

## Answer

Traversal: BFS depth=2 | Start: ['oracle-first.ts', 'OracleFirstState', 'OracleFirstAction'] | 10 nodes found

NODE oracle-first.ts [src=extensions/oracle-first.ts loc=L1 community=96]
NODE classifyPiDocRead() [src=extensions/oracle-first.ts loc=L93 community=96]
NODE isPiDocPath() [src=extensions/oracle-first.ts loc=L64 community=96]
NODE extractPiPkgPath() [src=extensions/oracle-first.ts loc=L71 community=96]
NODE isOracleConsult() [src=extensions/oracle-first.ts loc=L125 community=96]
NODE OracleFirstState [src=extensions/oracle-first.ts loc=L147 community=96]
NODE OracleFirstAction [src=extensions/oracle-first.ts loc=L146 community=96]
NODE decideAction() [src=extensions/oracle-first.ts loc=L157 community=96]
NODE DocReadClassification [src=extensions/oracle-first.ts loc=L79 community=96]
NODE DOC_SUBPATHS [src=extensions/oracle-first.ts loc=L54 community=96]
EDGE oracle-first.ts --contains [EXTRACTED]--> classifyPiDocRead()
EDGE oracle-first.ts --contains [EXTRACTED]--> decideAction()
EDGE oracle-first.ts --contains [EXTRACTED]--> DOC_SUBPATHS
EDGE oracle-first.ts --contains [EXTRACTED]--> DocReadClassification
EDGE oracle-first.ts --contains [EXTRACTED]--> extractPiPkgPath()
EDGE oracle-first.ts --contains [EXTRACTED]--> isOracleConsult()
EDGE oracle-first.ts --contains [EXTRACTED]--> isPiDocPath()

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T20:10:43.115Z
