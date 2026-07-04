---
title: "Where are learned heuristics stored and what code/config enforces or references…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['Heuristic', 'files', 'heuristicsExtension()', 'AgentScopeSchema', 'code_stats()', 'Config Index', 'DisplayItem', 'identifyTask()', 'Exports Reference', 're…"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:10:26.714Z
updated: 2026-07-04T22:10:26.714Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: Where are learned heuristics stored and what code/config enforces or references them in the pi agent config? Identify files for heuristic storage, display, and validation.

## Answer

Traversal: BFS depth=2 | Start: ['Heuristic', 'files', 'heuristicsExtension()', 'AgentScopeSchema', 'code_stats()', 'Config Index', 'DisplayItem', 'identifyTask()', 'Exports Reference', 'restoreDefaults()', 'Config Validation & Pipeline Audit'] | 453 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE colors [src=themes/porcelain-light.json loc=L22 community=2]
NODE colors [src=themes/porcelain.json loc=L22 community=1]
NODE store.ts [src=extensions/heuristics/store.ts loc=L1 community=0]
NODE command.ts [src=extensions/heuristics/command.ts loc=L1 community=0]
NODE tasks.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L1 community=8]
NODE Global Agent Config — Orchestration Doctrine [src=AGENTS.md loc= community=27]
NODE index.ts [src=extensions/heuristics/index.ts loc=L1 community=0]
NODE audit-pipelines.py [src=scripts/audit-pipelines.py loc=L1 community=30]
NODE ponytail-config.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L1 community=24]
NODE schema.ts [src=extensions/heuristics/schema.ts loc=L1 community=0]
NODE validate-config.py [src=scripts/validate-config.py loc=L1 community=36]
NODE run.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/run.py loc=L1 community=10]
NODE registerHeuristicsCommand() [src=extensions/heuristics/command.ts loc=L308 community=0]
NODE vars [src=themes/porcelain.json loc=L4 community=17]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE manifest.json [src=schema/manifest.json loc=L1 community=23]
NODE vars [src=themes/porcelain-light.json loc=L4 community=31]
NODE pi configuration README [src=README.md loc= community=23]
NODE oracle-first.ts [src=extensions/oracle-first.ts loc=L1 community=39]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE knowledge-compound.ts [src=extensions/knowledge-compound.ts loc=L1 community=74]
NODE correctness.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/correctness.js loc=L1 community=51]
NODE robustness-audit.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/robustness-audit.js loc=L1 community=42]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=28]
NODE mutateStore() [src=extensions/heuristics/store.ts loc=L250 community=0]
NODE saveHeuristic() [src=extensions/heuristics/store.ts loc=L291 community=0]
NODE lead-config.ts [src=extensions/lead-config.ts loc=L1 community=38]
NODE check-rule-copies.js [src=git/github.com/DietrichGebert/ponytail/scripts/check-rule-copies.js loc=L1 community=7]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE main() [src=scripts/audit-pipelines.py loc=L468 community=30]
NODE output() [src=extensions/heuristics/command.ts loc=L41 community=0]
NODE graph-lookup.ts [src=extensions/lib/graph-lookup.ts loc=L1 community=32]
NODE concurrency-guard.ts [src=extensions/concurrency-guard.ts loc=L1 community=47]
NODE graph-first.ts [src=extensions/graph-first.ts loc=L1 community=30]
NODE heuristic-entry.schema.json [src=schema/heuristic-entry.schema.json loc=L1 community=3]
NODE judge.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/judge.py loc=L1 community=21]
NODE publish-openclaw-skills.js [src=git/github.com/DietrichGebert/ponytail/scripts/publish-openclaw-skills.js loc=L1 community=18]
NODE build-openclaw-skills.js [src=git/github.com/DietrichGebert/ponytail/scripts/build-openclaw-skills.js loc=L1 community=18]
NODE projectDirFor() [src=extensions/heuristics/store.ts loc=L75 community=0]
NODE check-impact-trace.mjs [src=scripts/check-impact-trace.mjs loc=L1 community=35]
NODE lead-profiles.schema.json [src=schema/lead-profiles.schema.json loc=L1 community=33]
NODE globalDir(

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:10:26.714Z
