---
title: "Where is write mode auto permissions or auto write permission scoping implement…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['Scope', 'Scope', 'scope', 'AgentScopeSchema', 'autocommit.sh', 'Config Index', 'files', 'identifyTask()', 'Mode', 'Write-Gate Extension'] | 472 nodes found"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:04:19.492Z
updated: 2026-07-04T22:04:19.492Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where is write mode auto permissions or auto write permission scoping implemented in the pi agent config? Identify files and functions related to write mode auto permissions and permission scope.

## Answer

Traversal: BFS depth=2 | Start: ['Scope', 'Scope', 'scope', 'AgentScopeSchema', 'autocommit.sh', 'Config Index', 'files', 'identifyTask()', 'Mode', 'Write-Gate Extension'] | 472 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE colors [src=themes/porcelain.json loc=L22 community=1]
NODE colors [src=themes/porcelain-light.json loc=L22 community=2]
NODE store.ts [src=extensions/heuristics/store.ts loc=L1 community=0]
NODE command.ts [src=extensions/heuristics/command.ts loc=L1 community=0]
NODE model-usage.ts [src=extensions/model-usage.ts loc=L1 community=28]
NODE tasks.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L1 community=8]
NODE index.ts [src=extensions/heuristics/index.ts loc=L1 community=0]
NODE audit-pipelines.py [src=scripts/audit-pipelines.py loc=L1 community=30]
NODE Global Agent Config — Orchestration Doctrine [src=AGENTS.md loc= community=27]
NODE ponytail-config.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L1 community=24]
NODE validate-config.py [src=scripts/validate-config.py loc=L1 community=36]
NODE schema.ts [src=extensions/heuristics/schema.ts loc=L1 community=0]
NODE registerHeuristicsCommand() [src=extensions/heuristics/command.ts loc=L308 community=0]
NODE pi configuration README [src=README.md loc= community=18]
NODE vars [src=themes/porcelain-light.json loc=L4 community=31]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE vars [src=themes/porcelain.json loc=L4 community=17]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE knowledge-compound.ts [src=extensions/knowledge-compound.ts loc=L1 community=74]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE oracle-first.ts [src=extensions/oracle-first.ts loc=L1 community=39]
NODE correctness.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/correctness.js loc=L1 community=51]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=22]
NODE robustness-audit.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/robustness-audit.js loc=L1 community=42]
NODE mutateStore() [src=extensions/heuristics/store.ts loc=L250 community=0]
NODE saveHeuristic() [src=extensions/heuristics/store.ts loc=L291 community=0]
NODE lead-config.ts [src=extensions/lead-config.ts loc=L1 community=30]
NODE check-rule-copies.js [src=git/github.com/DietrichGebert/ponytail/scripts/check-rule-copies.js loc=L1 community=7]
NODE main() [src=scripts/audit-pipelines.py loc=L468 community=30]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE properties [src=schema/heuristic-entry.schema.json loc=L9 community=3]
NODE graph-lookup.ts [src=extensions/lib/graph-lookup.ts loc=L1 community=32]
NODE output() [src=extensions/heuristics/command.ts loc=L41 community=0]
NODE concurrency-guard.ts [src=extensions/concurrency-guard.ts loc=L1 community=36]
NODE publish-openclaw-skills.js [src=git/github.com/DietrichGebert/ponytail/scripts/publish-openclaw-skills.js loc=L1 community=18]
NODE main() [src=scripts/validate-config.py loc=L303 community=36]
NODE graph-first.ts [src=extensions/graph-first.ts loc=L1 community=11]
NODE check-impact-trace.mjs [src=scripts/check-impact-trace.mjs loc=L1 community=35]
NODE self-audit.ts [src=extensions/self-audit.ts loc=L1 community=86]
NODE build-openclaw-skills.js [src=git/github.com/DietrichGebert/ponytail/scripts/build-openclaw-skills.js loc=L1 community=18]
NODE inject.ts [src=extensions/heuristics/inject.ts loc=L1 community=0]
NODE projectDirFor() [src=extensions/heuristics/store.ts loc=L75 community=0]
NODE judge.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/judge.py loc=L1 community=18]
NODE globalDir() [src=extensions/heuristics/store.ts loc=L43 community=0]
NODE grap

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:04:19.492Z
