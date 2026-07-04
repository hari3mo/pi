---
type: "query"
date: "2026-07-04T09:44:45.192747+00:00"
question: "Are the weakly-connected nodes real orphans or extraction gaps?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Config Index (semantic audit map)", "autocommit.sh"]
---

# Q: Are the weakly-connected nodes real orphans or extraction gaps?

## Answer

Mostly extraction gaps, of two identifiable kinds. 782 of 1123 nodes sit outside the 341-node giant component, in 42 single-file islands. (a) AST cross-file resolution gaps: ponytail's tests/ (hooks.test.js 119 nodes), scripts/ (check-rule-copies, build-openclaw-skills), and benchmark code (tasks.py 80, correctness.js, robustness-audit.js) really do require/import each other and read AGENTS.md — those links were the 311 dangling-endpoint edges dropped at build, so each file became an island. (b) Semantic-layer coverage gaps from the inline pass: docs/config-index.md documents the porcelain themes (76+76 nodes), the schema/*.json set (98 nodes across 6 files), and .pi-vcs/autocommit.sh, but no edges were authored to them; publish.yml got a node and zero edges. (c) A minority are genuinely standalone: package.json key-trees, statusline scripts, baseline.js (a deliberately empty benchmark arm). Note BANNER_LINES/APHORISMS are NOT orphans — degree 1 inside the giant via custom-header.ts; the report lumped low-degree with disconnected.

## Outcome

- Signal: useful

## Source Nodes

- Config Index (semantic audit map)
- autocommit.sh