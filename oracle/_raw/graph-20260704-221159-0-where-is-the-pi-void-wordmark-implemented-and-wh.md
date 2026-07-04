---
title: "Where is the pi void wordmark implemented, and what files control its visibilit…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['WORDMARK', 'colors', 'colors', 'files', 'theme', 'void-blackhole.ts'] | 152 nodes found"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:11:59.017Z
updated: 2026-07-04T22:11:59.017Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where is the pi void wordmark implemented, and what files control its visibility or theme colors?

## Answer

Traversal: BFS depth=2 | Start: ['WORDMARK', 'colors', 'colors', 'files', 'theme', 'void-blackhole.ts'] | 152 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE colors [src=themes/porcelain.json loc=L22 community=1]
NODE vars [src=themes/porcelain.json loc=L4 community=17]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE renderResult() [src=extensions/subagent/index.ts loc=L1488 community=12]
NODE .render() [src=extensions/subagent/index.ts loc=L654 community=12]
NODE BlackHoleComponent [src=extensions/void-blackhole.ts loc=L318 community=6]
NODE _void_harness.mts [src=extensions/_void_harness.mts loc=L1 community=50]
NODE ActiveSubagentPanel [src=extensions/subagent/index.ts loc=L592 community=50]
NODE properties [src=schema/settings.schema.json loc=L8 community=46]
NODE theme.schema.json [src=schema/theme.schema.json loc=L1 community=21]
NODE settings.schema.json [src=schema/settings.schema.json loc=L1 community=46]
NODE theme [src=schema/settings.schema.json loc=L10 community=34]
NODE tui [src=extensions/_void_harness.mts loc=L24 community=50]
NODE runStatusWord() [src=extensions/subagent/index.ts loc=L441 community=12]
NODE formatUsageStats() [src=extensions/subagent/index.ts loc=L125 community=37]
NODE properties [src=schema/theme.schema.json loc=L9 community=21]
NODE porcelain.json [src=themes/porcelain.json loc=L1 community=75]
NODE isFailedResult() [src=extensions/subagent/index.ts loc=L297 community=12]
NODE getElapsedMs() [src=extensions/subagent/index.ts loc=L111 community=12]
NODE formatRunStatus() [src=extensions/subagent/index.ts loc=L170 community=37]
NODE getFinalOutput() [src=extensions/subagent/index.ts loc=L285 community=4]
NODE render() [src=extensions/custom-header.ts loc=L96 community=34]
NODE getActiveSubagentRunRefs() [src=extensions/subagent/index.ts loc=L381 community=4]
NODE .detailLines() [src=extensions/subagent/index.ts loc=L644 community=50]
NODE .constructor() [src=extensions/void-blackhole.ts loc=L383 community=6]
NODE export [src=themes/porcelain.json loc=L81 community=75]
NODE runInProgress() [src=extensions/subagent/index.ts loc=L304 community=12]
NODE enabledModels [src=schema/settings.schema.json loc=L18 community=46]
NODE vars [src=schema/theme.schema.json loc=L12 community=21]
NODE oneLine() [src=extensions/subagent/index.ts loc=L404 community=12]
NODE defaultThinkingLevel [src=schema/settings.schema.json loc=L13 community=46]
NODE .tick() [src=extensions/void-blackhole.ts loc=L499 community=6]
NODE name [src=schema/theme.schema.json loc=L11 community=21]
NODE colors [src=schema/theme.schema.json loc=L16 community=21]
NODE export [src=schema/theme.schema.json loc=L20 community=21]
NODE getBanner() [src=extensions/custom-header.ts loc=L44 community=34]
NODE author [src=git/github.com/DietrichGebert/ponytail/package.json loc=L7 community=14]
NODE .close() [src=extensions/void-blackhole.ts loc=L574 community=6]
NODE smoothstep() [src=extensions/void-blackhole.ts loc=L308 community=6]
NODE repository [src=git/github.com/DietrichGebert/ponytail/package.json loc=L12 community=14]
NODE .buildDustField() [src=extensions/void-blackhole.ts loc=L441 community=6]
NODE .bodyHeight() [src=extensions/subagent/index.ts loc=L638 community=50]
NODE type [src=schema/theme.schema.json loc=L14 community=21]
NODE .spawnDiskParticle() [src=extensions/void-blackhole.ts loc=L418 community=6]
NODE pi [src=git/github.com/DietrichGebert/ponytail/package.json loc=L36 community=14]
NODE getDisplayItems() [src=extensions/subagent/index.ts loc=L330 community=12]
NODE bugs [src=git/github.com/DietrichGebert/pon

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:11:59.017Z
