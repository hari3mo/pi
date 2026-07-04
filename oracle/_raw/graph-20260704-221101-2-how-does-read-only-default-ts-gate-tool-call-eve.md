---
title: "How does read-only-default.ts gate tool_call events and what event fields are a…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['read()', 'read()', 'bashMode', 'command.ts', 'shortenCwd()', 'defaultThinkingLevel', 'GateState', 'read-only-default.ts'] | Context: field (heuristic) | 8 …"
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

# Q: How does read-only-default.ts gate tool_call events and what event fields are available for bash command cwd or inputs?

## Answer

Traversal: BFS depth=2 | Start: ['read()', 'read()', 'bashMode', 'command.ts', 'shortenCwd()', 'defaultThinkingLevel', 'GateState', 'read-only-default.ts'] | Context: field (heuristic) | 8 nodes found

NODE command.ts [src=extensions/heuristics/command.ts loc=L1 community=0]
NODE read() [src=git/github.com/DietrichGebert/ponytail/scripts/check-rule-copies.js loc=L7 community=7]
NODE read() [src=git/github.com/DietrichGebert/ponytail/tests/gemini-extension.test.js loc=L40 community=7]
NODE bashMode [src=themes/porcelain.json loc=L79 community=1]
NODE defaultThinkingLevel [src=schema/settings.schema.json loc=L13 community=46]
NODE GateState [src=extensions/read-only-default.ts loc=L78 community=22]
NODE shortenCwd() [src=extensions/lib/format.ts loc=L36 community=34]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=22]

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:11:01.974Z
