---
title: "Where in the pi agent config are write mode, auto permissions, auto write, or p…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['files', 'mode', 'Mode', 'AgentScopeSchema', 'autocommit.sh', 'Config Index', 'Return callable(obj) -> list[str] of violation messages.', 'Write-Gate Extens…"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:11:01.974Z
updated: 2026-07-04T22:11:01.974Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where in the pi agent config are write mode, auto permissions, auto write, or permission scoping implemented? Return likely files and symbols.

## Answer

Traversal: BFS depth=2 | Start: ['files', 'mode', 'Mode', 'AgentScopeSchema', 'autocommit.sh', 'Config Index', 'Return callable(obj) -> list[str] of violation messages.', 'Write-Gate Extension'] | Context: return_type (heuristic) | 8 nodes found

NODE Mode [src=extensions/read-only-default.ts loc=L76 community=22]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE autocommit.sh [src=.pi-vcs/autocommit.sh loc=L1 community=52]
NODE files [src=git/github.com/DietrichGebert/ponytail/package.json loc=L24 community=14]
NODE AgentScopeSchema [src=extensions/subagent/index.ts loc=L1039 community=4]
NODE mode [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-subagent.js loc=L11 community=9]
NODE Write-Gate Extension [src=oracle/components/write-gate-extension.md loc= community=105]
NODE Return callable(obj) -> list[str] of violation messages. [src=scripts/validate-config.py loc=L64 community=36]

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:11:01.974Z
