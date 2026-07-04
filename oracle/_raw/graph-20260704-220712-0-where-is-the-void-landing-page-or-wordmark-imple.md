---
title: "Where is the Void landing page or wordmark implementation in the available code…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['WORDMARK', 'Tasks for the agentic benchmark.  Each task is a realistic \"edit this codebase\"', 'graph-lookup.ts', 'pageBg', 'void-blackhole.ts'] | 92 nodes …"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:07:12.229Z
updated: 2026-07-04T22:07:12.229Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where is the Void landing page or wordmark implementation in the available codebase graph?

## Answer

Traversal: BFS depth=2 | Start: ['WORDMARK', 'Tasks for the agentic benchmark.  Each task is a realistic "edit this codebase"', 'graph-lookup.ts', 'pageBg', 'void-blackhole.ts'] | 92 nodes found

NODE Config Index [src=docs/config-index.md loc= community=27]
NODE tasks.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L1 community=8]
NODE run.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/run.py loc=L1 community=10]
NODE pi configuration README [src=README.md loc= community=23]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE _ok() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L63 community=8]
NODE _fail() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L62 community=8]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE _import() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L32 community=8]
NODE graph-lookup.ts [src=extensions/lib/graph-lookup.ts loc=L1 community=32]
NODE judge.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/judge.py loc=L1 community=21]
NODE _find() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L45 community=8]
NODE _void_harness.mts [src=extensions/_void_harness.mts loc=L1 community=6]
NODE format.ts [src=extensions/lib/format.ts loc=L1 community=55]
NODE BlackHoleComponent [src=extensions/void-blackhole.ts loc=L318 community=6]
NODE complete.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/complete.py loc=L1 community=21]
NODE impact-trace.ts [src=extensions/impact-trace.ts loc=L1 community=32]
NODE porcelain.json [src=themes/porcelain.json loc=L1 community=17]
NODE score_safe_path() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L68 community=8]
NODE tui [src=extensions/_void_harness.mts loc=L24 community=50]
NODE score_email() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L371 community=8]
NODE score_cache() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L314 community=8]
NODE score_auth() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L213 community=8]
NODE score_sql() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L169 community=8]
NODE score_reuse_money() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L658 community=8]
NODE score_reuse_slug() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L606 community=8]
NODE render() [src=extensions/custom-header.ts loc=L96 community=34]
NODE score_trace_transfer() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L697 community=8]
NODE score_trace_amount() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L759 community=8]
NODE score_ratelimit() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L109 community=8]
NODE score_csv() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L263 community=8]
NODE _import_pkg() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L591 community=8]
NODE score_todo() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L521 community=8]
NODE .constructor() [src=extensions/void-blackhole.ts loc=L383 community=6]
NODE shortenCwd() [src=extensions/lib/format.ts loc=L36 community=34]
NODE export [src=themes/porcelain.json loc=L81 community=17]
NODE .tick() [src=extensions/void-blackhole.ts loc=L499 community=6]
NODE smoothstep() [src=extensions/void-blackhole.ts loc=L308 community=6]
... (truncated — 54 more nodes cut by ~1200-token budget. Narrow with context_filter=['call'] or use get_node for a specific symbol)

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:07:12.229Z
