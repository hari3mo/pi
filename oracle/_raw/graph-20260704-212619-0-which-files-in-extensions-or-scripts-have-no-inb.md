---
title: "Which files in extensions/ or scripts/ have no inbound references (nothing impo…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['extensions', 'scripts', 'scripts', 'files', 'inboundRefs()', 'Exports Reference'] | Context: import (heuristic) | 12 nodes found"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T21:26:19.262Z
updated: 2026-07-04T21:26:19.262Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Which files in extensions/ or scripts/ have no inbound references (nothing imports them)?

## Answer

Traversal: BFS depth=2 | Start: ['extensions', 'scripts', 'scripts', 'files', 'inboundRefs()', 'Exports Reference'] | Context: import (heuristic) | 12 nodes found

NODE impact-trace.ts [src=extensions/impact-trace.ts loc=L1 community=40]
NODE graph-lookup.ts [src=extensions/lib/graph-lookup.ts loc=L1 community=40]
NODE findGraphRoot() [src=extensions/lib/graph-lookup.ts loc=L21 community=40]
NODE isGraphStale() [src=extensions/lib/graph-lookup.ts loc=L140 community=40]
NODE loadGraph() [src=extensions/lib/graph-lookup.ts loc=L58 community=40]
NODE markSeen() [src=extensions/lib/graph-lookup.ts loc=L129 community=40]
NODE inboundRefs() [src=extensions/lib/graph-lookup.ts loc=L93 community=40]
NODE files [src=git/github.com/DietrichGebert/ponytail/package.json loc=L24 community=14]
NODE scripts [src=git/github.com/DietrichGebert/ponytail/pi-extension/package.json loc=L5 community=80]
NODE extensions [src=git/github.com/DietrichGebert/ponytail/package.json loc=L37 community=14]
NODE scripts [src=git/github.com/DietrichGebert/ponytail/package.json loc=L33 community=14]
NODE Exports Reference [src=skills/graphify/references/exports.md loc=None community=94]
EDGE inboundRefs() --imports [EXTRACTED context=import]--> impact-trace.ts
EDGE impact-trace.ts --imports [EXTRACTED context=import]--> findGraphRoot()
EDGE impact-trace.ts --imports [EXTRACTED context=import]--> isGraphStale()
EDGE impact-trace.ts --imports [EXTRACTED context=import]--> loadGraph()
EDGE impact-trace.ts --imports [EXTRACTED context=import]--> markSeen()
EDGE impact-trace.ts --imports_from [INFERRED context=import]--> graph-lookup.ts

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T21:26:19.262Z
