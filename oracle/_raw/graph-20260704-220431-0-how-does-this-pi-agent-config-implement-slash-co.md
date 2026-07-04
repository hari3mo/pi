---
title: "How does this pi agent config implement slash commands or menus, and are there …"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['commands', 'commands', 'files', 'AgentScopeSchema', 'Config Index', 'extensions', 'identifyTask()', 'model-email.js', '_slash_access_denied()', 'UsageStats…"
base_confidence: 0.5
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: peripheral
created: 2026-07-04T22:04:31.540Z
updated: 2026-07-04T22:04:31.540Z
---

> [!draft] Auto-captured graph `query` answer — UNREVIEWED.
> Staged by the knowledge-compound extension. Verify against the graph, then
> promote into `synthesis/` (or fold into an existing page) or delete.

# Q: How does this pi agent config implement slash commands or menus, and are there existing usage/accounting commands or model usage tracking files/extensions? Identify likely files to modify for adding a comprehensive pi menu showing usage breakdown by model.

## Answer

Traversal: BFS depth=2 | Start: ['commands', 'commands', 'files', 'AgentScopeSchema', 'Config Index', 'extensions', 'identifyTask()', 'model-email.js', '_slash_access_denied()', 'UsageStats'] | 489 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE colors [src=themes/porcelain.json loc=L22 community=1]
NODE colors [src=themes/porcelain-light.json loc=L22 community=2]
NODE store.ts [src=extensions/heuristics/store.ts loc=L1 community=0]
NODE command.ts [src=extensions/heuristics/command.ts loc=L1 community=0]
NODE tasks.py [src=git/github.com/DietrichGebert/ponytail/benchmarks/agentic/tasks.py loc=L1 community=8]
NODE audit-pipelines.py [src=scripts/audit-pipelines.py loc=L1 community=30]
NODE Global Agent Config — Orchestration Doctrine [src=AGENTS.md loc= community=27]
NODE index.ts [src=extensions/heuristics/index.ts loc=L1 community=0]
NODE ponytail-config.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L1 community=24]
NODE schema.ts [src=extensions/heuristics/schema.ts loc=L1 community=0]
NODE validate-config.py [src=scripts/validate-config.py loc=L1 community=36]
NODE registerHeuristicsCommand() [src=extensions/heuristics/command.ts loc=L308 community=0]
NODE __init__.py [src=git/github.com/DietrichGebert/ponytail/__init__.py loc=L1 community=5]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE vars [src=themes/porcelain-light.json loc=L4 community=31]
NODE void-blackhole.ts [src=extensions/void-blackhole.ts loc=L1 community=6]
NODE manifest.json [src=schema/manifest.json loc=L1 community=23]
NODE vars [src=themes/porcelain.json loc=L4 community=17]
NODE pi configuration README [src=README.md loc= community=23]
NODE oracle-first.ts [src=extensions/oracle-first.ts loc=L1 community=39]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE knowledge-compound.ts [src=extensions/knowledge-compound.ts loc=L1 community=74]
NODE robustness-audit.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/robustness-audit.js loc=L1 community=42]
NODE correctness.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/correctness.js loc=L1 community=51]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=28]
NODE saveHeuristic() [src=extensions/heuristics/store.ts loc=L291 community=0]
NODE lead-config.ts [src=extensions/lead-config.ts loc=L1 community=38]
NODE mutateStore() [src=extensions/heuristics/store.ts loc=L250 community=0]
NODE custom-header.ts [src=extensions/custom-header.ts loc=L1 community=34]
NODE main() [src=scripts/audit-pipelines.py loc=L468 community=30]
NODE check-rule-copies.js [src=git/github.com/DietrichGebert/ponytail/scripts/check-rule-copies.js loc=L1 community=7]
NODE model-email.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/model-email.js loc=L1 community=78]
NODE claude-email.js [src=git/github.com/DietrichGebert/ponytail/benchmarks/claude-email.js loc=L1 community=75]
NODE graph-lookup.ts [src=extensions/lib/graph-lookup.ts loc=L1 community=32]
NODE output() [src=extensions/heuristics/command.ts loc=L41 community=0]
NODE concurrency-guard.ts [src=extensions/concurrency-guard.ts loc=L1 community=47]
NODE heuristic-entry.schema.json [src=schema/heuristic-entry.schema.json loc=L1 community=3]
NODE publish-openclaw-skills.js [src=git/github.com/DietrichGebert/ponytail/scripts/publish-openclaw-skills.js loc=L1 community=18]
NODE check-impact-trace.mjs [src=scripts/check-impact-trace.mjs loc=L1 community=35]
NODE self-audit.ts [src=extensions/self-audit.ts loc=L1 community=86]
NODE inject.ts [src=extensions/heuristics/inject.ts loc=L1 community=0]
NODE hermes-plugin.test.js [src=git/github.com/DietrichGebert/ponytail/tests/hermes-plugin.test.js loc=L1 community=5]
NODE build-openclaw-skills.js [src=git/github.com/DietrichGebert/pon

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:04:31.540Z
