---
title: Fable Budget Invariants
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, orchestration, concept]
aliases: ["Budget Invariants", "Token-Spend Rules"]
summary: The MUST rules keeping the orchestrator's context on judgment: one read before dispatch, never verify by reading, batch dispatches, front-load specs, blind fan-out, graph-first, wiki-first.
relationships:
  - target: "[[concepts/orchestration-doctrine]]"
    type: derived_from
  - target: "[[concepts/knowledge-graph-integration]]"
    type: uses
  - target: "[[concepts/rework-loop]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T12:00:00Z
---

# Fable Budget Invariants

The MUST rules that operationalize the [[concepts/orchestration-doctrine]]:
concrete ceilings on how the orchestrator spends its scarce context so tokens
land on judgment, not on reading and re-verifying.

## The invariants

- **≤1 targeted read ≤50 lines before dispatch.** After the `graph` tool has
  been tried for structure questions, a locating grep that misses once →
  dispatch a `scout`. The lead does not spelunk.
- **Never verify by reading.** Verification goes to `doctor`/`peer`. The lead
  judging a return is not the same as the lead re-reading the whole diff to
  self-check — that is what the gate role is for.
- **Batch dispatches.** All independent dispatches go in ONE parallel call;
  dependent steps in ONE chain. Sequential singles only when one result
  determines the next.
- **FRONT-LOAD SPEC QUALITY.** The dispatch spec itself is the lead's
  highest-leverage token spend. A generous, precise spec that one-shots beats a
  terse one that triggers rework chains (see [[concepts/rework-loop]]).
- **Blind fan-out for expensive-to-unwind calls.** Dispatch `engineer` +
  `lawyer` in parallel where neither sees the other; the lead spends only on
  reconciliation.
- **GRAPH-FIRST.** When `graphify-out/graph.json` exists, answer
  structure/architecture questions with the `graph` tool before dispatching a
  scout or reading files — ~30x cheaper. Subagents inherit the tool, so
  dispatched tasks may assume it too. See
  [[concepts/knowledge-graph-integration]].
- **WIKI-FIRST.** Knowledge questions about pi itself (its APIs, features, docs,
  conventions, past lessons) are answered from the wiki vault (`wiki-query` against
  the wiki profile at `~/.obsidian-wiki/config.wiki`) plus the `graph` tool BEFORE
  reading pi docs or dispatching a scout — compiled knowledge beats re-derivation.
  Durable lessons and valuable query answers are filed BACK into wiki per its
  `SCHEMA.md` (query-compounding: the next identical question is a read, not a
  re-derivation). Wiki `upstream` pages are pi-version-stamped; the session-start
  self-audit flags them stale after a `pi update`.

## Why they are invariants, not guidelines

Each rule removes a specific way the orchestrator's context silently bleeds:
exploratory reading, verification-by-reading, serial dispatch latency, thin
specs that boomerang, single-source high-stakes calls, grep where the graph
is cheaper, and re-deriving knowledge already compiled in the wiki vault. They are the enforcement teeth of the "touch each task twice"
principle — without them the lead drifts back into doing the work itself.

Several are also enforced in code rather than trusted to prose: GRAPH-FIRST is
backed by the [[components/graph-first-extension]] (structure-grep redirection),
and the batching/max-8 fan-out is bounded by the
[[components/subagent-extension]]. This partial mechanization is the
[[synthesis/prose-to-code-promotion]] pattern applied to budget discipline.
