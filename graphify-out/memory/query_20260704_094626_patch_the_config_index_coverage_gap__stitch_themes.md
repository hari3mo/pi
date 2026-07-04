---
type: "query"
date: "2026-07-04T09:46:26.328602+00:00"
question: "Patch the config-index coverage gap: stitch themes/schemas/autocommit/graphify-skill into the giant component"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Config Index (semantic audit map)", "~/.pi/agent config repo overview"]
---

# Q: Patch the config-index coverage gap: stitch themes/schemas/autocommit/graphify-skill into the giant component

## Answer

Added 10 EXTRACTED edges documented by docs/config-index.md and README.md: config-index → porcelain themes (x2) and schema/manifest.json; manifest → the 4 registered schemas; README autocommit concept → .pi-vcs/autocommit.sh; README repo overview → graphify SKILL.md; publish.yml → ponytail package.json. Result: giant component 341 → 615 nodes (+274), components 43 → 33; themes, schemas, autocommit, and the graphify doc set are now in the giant. Still standalone (correctly): ponytail npm package key-tree + publish.yml pair, test-file islands (AST cross-file gap, not documentary), package.json trees, baseline.js.

## Outcome

- Signal: useful

## Source Nodes

- Config Index (semantic audit map)
- ~/.pi/agent config repo overview