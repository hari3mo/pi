---
title: "Where is the task tracker implemented? Find files/nodes related to task tracker…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['Task', 'nodes', 'TASKS', 'AgentScopeSchema', 'Config Index', 'files', 'findEntry()', 'score_todo()', 'ponytail-mode-tracker.js', 'updateStatusBar()'] | 545…"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:07:33.179Z
updated: 2026-07-04T22:07:33.179Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where is the task tracker implemented? Find files/nodes related to task tracker, tasks, todo, persistence, and dynamic updates in the pi agent config.

## Answer

Traversal: BFS depth=2 | Start: ['Task', 'nodes', 'TASKS', 'AgentScopeSchema', 'Config Index', 'files', 'findEntry()', 'score_todo()', 'ponytail-mode-tracker.js', 'updateStatusBar()'] | 545 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE colors [src=themes/porcelain.json loc=L22 community=1]
NODE colors [src=themes/porcelain-light.json loc=L22 community=2]
NODE store.ts [src=extensions/heuristics/store.ts loc=L1 community=0]
NODE command.ts [src=extensions/heuristics/command.ts loc=L1 community=0]
NODE hooks.test.js [src=git/github.com/DietrichGebert/ponytail/tests/hooks.test.js loc=L1 community=16]
NODE tasks.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L1 community=8]
NODE index.ts [src=extensions/heuristics/index.ts loc=L1 community=0]
NODE audit-pipelines.py [src=scripts/audit-pipelines.py loc=L1 community=30]
NODE Global Agent Config — Orchestration Doctrine [src=AGENTS.md loc= community=27]
NODE ponytail-config.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L1 community=24]
NODE schema.ts [src=extensions/heuristics/schema.ts loc=L1 community=0]
NODE validate-config.py [src=scripts/validate-config.py loc=L1 community=36]
NODE ponytail-activate.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-activate.js loc=L1 community=11]
NODE run.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/run.py loc=L1 community=10]
NODE index.js [src=git/github.com/DietrichGebert/ponytail/pi-extension/index.js loc=L1 community=15]
NODE registerHeuristicsCommand() [src=extensions/heuristics/command.ts loc=L308 community=0]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE pi configuration README [src=README.md loc= community=23]
NODE manifest.json [src=schema/manifest.json loc=L1 community=23]
NODE vars [src=themes/porcelain-light.json loc=L4 community=31]
NODE vars [src=themes/porcelain.json loc=L4 community=17]
NODE knowledge-compound.ts [src=extensions/knowledge-compound.ts loc=L1 community=74]
NODE ponytail-instructions.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-instructions.js loc=L1 community=15]
NODE oracle-first.ts [src=extensions/oracle-first.ts loc=L1 community=39]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE robustness-audit.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/robustness-audit.js loc=L1 community=42]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=28]
NODE correctness.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/correctness.js loc=L1 community=51]
NODE ponytail-runtime.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-runtime.js loc=L1 community=9]
NODE lead-config.ts [src=extensions/lead-config.ts loc=L1 community=38]
NODE instructions.js [src=git/github.com/DietrichGebert/ponytail/ponytail-mcp/instructions.js loc=L1 community=53]
NODE saveHeuristic() [src=extensions/heuristics/store.ts loc=L291 community=0]
NODE mutateStore() [src=extensions/heuristics/store.ts loc=L250 community=0]
NODE _ok() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L63 community=8]
NODE _fail() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L62 community=8]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE check-rule-copies.js [src=git/github.com/DietrichGebert/ponytail/scripts/check-rule-copies.js loc=L1 community=7]
NODE main() [src=scripts/audit-pipelines.py loc=L468 community=30]
NODE model-email.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/model-email.js loc=L1 community=78]
NODE _import() [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L32 c

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:07:33.179Z
