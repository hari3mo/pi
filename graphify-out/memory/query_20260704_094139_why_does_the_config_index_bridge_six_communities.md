---
type: "query"
date: "2026-07-04T09:41:39.508149+00:00"
question: "Why does the Config Index bridge six communities — is it the de-facto hub of the whole harness?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Config Index (semantic audit map)", "Orchestration Doctrine (AGENTS.md)", "~/.pi/agent config repo overview", "Heuristics extension design (v2, authoritative)"]
---

# Q: Why does the Config Index bridge six communities — is it the de-facto hub of the whole harness?

## Answer

Yes — by mandate, not accident. docs/config-index.md is the semantic audit map that AGENTS.md (Config Maintenance) requires every config-changing session to update, so it holds an EXTRACTED 'references' edge to every feature: 14 extension modules (heuristics index.ts C0, subagent index.ts C5, void-blackhole.ts C15, task-tracker.ts C29, plus chat-title, custom-header, model-cycle, read-only-default, etc.), the Orchestration Doctrine (C21), the heuristics DESIGN doc, the scrollback patch, and its own backfilled changelog. Each extension lives in its own tight code community; the Config Index is the one document that touches all of them, so cross-community shortest paths route through it (betweenness 0.075). Even the Ponytail cluster reaches extension code through it: Ponytail project → repo README overview → Config Index → task-tracker.ts (3 hops). Degree 19, all EXTRACTED.

## Outcome

- Signal: useful

## Source Nodes

- Config Index (semantic audit map)
- Orchestration Doctrine (AGENTS.md)
- ~/.pi/agent config repo overview
- Heuristics extension design (v2, authoritative)