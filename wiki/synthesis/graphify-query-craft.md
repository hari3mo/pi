---
title: Graphify Query Craft
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
  - /Users/harissaif/.pi/agent/graphify-out/reflections/LESSONS.md
tags: [pi, graph, synthesis]
aliases: ["graph tool tips", "explain vs query", "graphify cwd resolution"]
summary: How to get useful answers from the graphify graph tool — prefer explain over lexically-anchored query, and know that graphify-out resolves from cwd, not the project you think you're in.
relationships:
  - target: "[[components/graphify-bridge-extension]]"
    type: derived_from
  - target: "[[components/graph-first-extension]]"
    type: related_to
base_confidence: 0.8
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Graphify Query Craft

Practical lessons for driving the [[components/graphify-bridge-extension|graphify `graph` tool]] well. The
[[components/graph-first-extension|graph-first]] doctrine says to answer structure/architecture
questions with the graph before reading files — but the tool has two sharp edges that make
naive use return garbage.

## Prefer `explain` (or distinctive identifiers) over vague `query`

The `query` action anchors **lexically** on the literal tokens in your question and BFS-walks
from whatever nodes match. A vague word like *"result"* will walk unrelated variables that
merely share the token, producing an irrelevant traversal. Two ways to avoid this:

- Use `explain` with a **concrete node name** when you know the thing you're asking about.
- If you must `query`, phrase around **distinctive identifiers** (unique symbol/file names),
  not generic English words.

(heuristic `h_mr6a1h0g_74czw8bh`.)

## `graphify-out` resolves from cwd, with a fallback — mind where you are

The graph tool (`graphify-bridge`) resolves `graphify-out` by **walking up from the current
working directory**, with a fallback to the agent config dir's graph. So a cwd that has its
*own* `graphify-out` always wins. Run the tool from an unrelated directory and the answers
describe the **`~/.pi/agent` config graph**, not the local project you meant to ask about
(heuristic `h_mr6bnodv_yqcda4ez`). Before trusting a graph answer, confirm which
`graphify-out` it resolved to.

## Orientation: trust the reflected "preferred sources" first

`graphify reflect` distills session memories into
`graphify-out/reflections/LESSONS.md` (deterministic, no LLM). For the `~/.pi/agent`
config graph the corroborated **preferred sources** — start-here nodes with ≥2 useful hits —
are `Config Index (semantic audit map)` and `~/.pi/agent config repo overview`. Treat
these as the entry points for a config-structure question; treat the *tentative* nodes
(`autocommit.sh`, the Ponytail project, the Heuristics extension design, the AGENTS.md
Orchestration Doctrine) as verify-before-relying. The reflections file itself warns to
verify before relying and revisit dead ends if code changed since
(source: `reflections/LESSONS.md`).

## See also

- [[components/graphify-bridge-extension]] — the tool these tips drive
- [[components/graph-first-extension]] — the doctrine that mandates graph-before-read
- [[synthesis/orchestration-lessons]] — subagents inherit the graph tool, so dispatched tasks assume it too
