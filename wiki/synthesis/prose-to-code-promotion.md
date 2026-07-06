---
title: Prose-to-Code Promotion
category: synthesis
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
  - /Users/harissaif/.pi/agent/extensions/lead-config.ts
  - /Users/harissaif/.pi/agent/extensions/read-only-default.ts
  - /Users/harissaif/.pi/agent/extensions/subagent/index.ts
  - /Users/harissaif/.pi/agent/extensions/graph-first.ts
  - /Users/harissaif/.pi/agent/extensions/concurrency-guard.ts
tags: [pi, extensions, config, synthesis]
aliases: ["Prompts Drift, Enforcement Does Not"]
summary: The unifying pattern across the local harness — when a standing order or prompt rule can be enforced mechanically, it is promoted to an extension, validator check, or hook, because prompts drift and enforcement does not.
relationships:
  - target: "[[concepts/self-audit-loop]]"
    type: derived_from
  - target: "[[concepts/orchestration-doctrine]]"
    type: related_to
  - target: "[[components/lead-config-extension]]"
    type: related_to
  - target: "[[components/write-gate-extension]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Prose-to-Code Promotion

The single design pattern that recurs through the whole local harness, stated in
AGENTS.md as a standing order:

> When a standing order or prompt rule can be enforced mechanically, promote it
> to code (extension, validator check, or hook) — **prompts drift, enforcement
> does not.**

Doctrine prose is behavior (even editorial rewording of AGENTS.md measurably
shifts borderline routing), but prose the agent must *remember every turn* is
fragile. Promoting it to code makes the rule a guarantee instead of a hope. This
page collects the pattern's instances so the principle is visible as one thing.

## The promotions (prose rule → mechanism)

| Doctrine prose | Promoted to |
|---|---|
| The per-model [[concepts/delegation-gate]] branch | [[components/lead-config-extension]] injects the matching profile each prompt |
| "Fable lead never edits directly" | [[components/write-gate-extension]] hard-blocks fable `edit`/`write` in every mode |
| [[concepts/rework-loop]] verdict vocabulary + 3-FAIL budget | [[components/subagent-extension]] `finalizeQaOutput` normalizes verdicts and counts |
| GRAPH-FIRST [[concepts/fable-budget-invariants|invariant]] | [[components/graph-first-extension]] redirects structure greps |
| "grep the live file, don't trust session memory" | [[components/concurrency-guard-extension]] content-checks foreign commits |
| The self-audit standing order | [[components/config-validation]] runs every session and gates commits |
| The dispatch-contract hygiene footer | auto-appended to every dispatched task by the subagent tool |

## Why it is filed as synthesis

No single source file states the pattern *as a pattern* — it is distilled by
reading AGENTS.md's standing orders against the extensions that implement them.
That cross-cutting read is exactly what a `synthesis/` page is for (see
[[SCHEMA]]).

## The corollaries that come with it

- **Self-improving closures.** Promoted mechanisms record their own stats
  (`.graph_first_stats.json`, `.lead_config_stats.json`) and the pipeline audit
  WARNs when the mechanism drifts — the promotion audits its own effectiveness.
- **Fail-open.** Every promotion falls back to the static prose on error, so
  mechanization never *removes* capability, only *guarantees* it when it works.
- **Errors integrate downstream.** A recurring failure doesn't get worked around;
  it becomes a new promotion — a `learn_heuristic` lesson, a validator guard, or
  a hook fix (the [[concepts/self-audit-loop]] closes this).
