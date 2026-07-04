---
title: "Which extension files implement or mention the task tool / task tracker UI / ta…"
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/graphify-out/graph.json
tags: [pi, graph, synthesis]
summary: "Traversal: BFS depth=2 | Start: ['Task', 'files', 'state', 'extension.test.js', 'Spanish Waitlist Banner', 'normalizePersistedMode()', 'Tools — Built-in & Custom', 'ponytail-mode-tracker.js…"
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

# Q: Which extension files implement or mention the task tool / task tracker UI / task list in pi? Need persisted task state and dynamic updates.

## Answer

Traversal: BFS depth=2 | Start: ['Task', 'files', 'state', 'extension.test.js', 'Spanish Waitlist Banner', 'normalizePersistedMode()', 'Tools — Built-in & Custom', 'ponytail-mode-tracker.js', 'updateStatusBar()'] | 170 nodes found

NODE index.ts [src=extensions/subagent/index.ts loc=L1 community=4]
NODE Config Index [src=docs/config-index.md loc= community=27]
NODE hooks.test.js [src=git/github.com/DietrichGebert/ponytail/tests/hooks.test.js loc=L1 community=16]
NODE Global Agent Config — Orchestration Doctrine [src=AGENTS.md loc= community=27]
NODE ponytail-config.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L1 community=24]
NODE ponytail-activate.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-activate.js loc=L1 community=11]
NODE index.js [src=git/github.com/DietrichGebert/ponytail/pi-extension/index.js loc=L1 community=15]
NODE ponytail.mjs [src=git/github.com/DietrichGebert/ponytail/.opencode/plugins/ponytail.mjs loc=L1 community=52]
NODE pi configuration README [src=README.md loc= community=23]
NODE ponytail-instructions.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-instructions.js loc=L1 community=15]
NODE package.json [src=git/github.com/DietrichGebert/ponytail/package.json loc=L1 community=14]
NODE ponytail-runtime.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-runtime.js loc=L1 community=9]
NODE read-only-default.ts [src=extensions/read-only-default.ts loc=L1 community=22]
NODE instructions.js [src=git/github.com/DietrichGebert/ponytail/ponytail-mcp/instructions.js loc=L1 community=53]
NODE gemini-extension.test.js [src=git/github.com/DietrichGebert/ponytail/tests/gemini-extension.test.js loc=L1 community=7]
NODE getPonytailInstructions() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-instructions.js loc=L73 community=15]
NODE ponytail-mode-tracker.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-mode-tracker.js loc=L1 community=9]
NODE getDefaultMode() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L76 community=24]
NODE ponytailExtension() [src=git/github.com/DietrichGebert/ponytail/pi-extension/index.js loc=L56 community=15]
NODE normalizePersistedMode() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L32 community=15]
NODE lead-profiles.schema.json [src=schema/lead-profiles.schema.json loc=L1 community=22]
NODE uninstall.js [src=git/github.com/DietrichGebert/ponytail/scripts/uninstall.js loc=L1 community=24]
NODE normalizeMode() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L20 community=15]
NODE opencode-plugin.test.js [src=git/github.com/DietrichGebert/ponytail/tests/opencode-plugin.test.js loc=L1 community=58]
NODE hooks-windows.test.js [src=git/github.com/DietrichGebert/ponytail/tests/hooks-windows.test.js loc=L1 community=61]
NODE check-versions.js [src=git/github.com/DietrichGebert/ponytail/scripts/check-versions.js loc=L1 community=7]
NODE ponytail-subagent.js [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-subagent.js loc=L1 community=9]
NODE check-graph-first.mjs [src=scripts/check-graph-first.mjs loc=L1 community=76]
NODE task-tracker.ts [src=extensions/task-tracker.ts loc=L1 community=48]
NODE extension.test.js [src=git/github.com/DietrichGebert/ponytail/pi-extension/test/extension.test.js loc=L1 community=15]
NODE parsePonytailCommand() [src=git/github.com/DietrichGebert/ponytail/pi-extension/index.js loc=L33 community=15]
NODE finish() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-mode-tracker.js loc=L11 community=9]
NODE normalizeConfigMode() [src=git/github.com/DietrichGebert/ponytail/hooks/ponytail-config.js loc=L26 community=24]
NODE resolveMode() [src=git/github.com/DietrichGebert/ponytail/ponytail-mcp/instructions.js loc=L16 community=53]
NODE buildInstructions() [src=git/github.com/DietrichGebert/ponytail/ponytail-mcp/instructions.js loc=L24 community=53]
NODE setMode() [src=git/github.com/Diet

## Provenance

- graph tool action: `query`
- captured: 2026-07-04T22:07:33.179Z
