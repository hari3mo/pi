---
title: Routing & Roles
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, orchestration, concept]
aliases: ["Scale-First Routing", "Role Roster", "Agent Tiers"]
summary: The scale-first routing table (Micro/Standard/Large) and the role roster (scout/worker/engineer/doctor/peer/lawyer/fable-engineer) with pinned model tiers.
relationships:
  - target: "[[concepts/orchestration-doctrine]]"
    type: derived_from
  - target: "[[concepts/delegation-gate]]"
    type: related_to
  - target: "[[concepts/rework-loop]]"
    type: related_to
  - target: "[[components/subagent-extension]]"
    type: implements
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Routing & Roles

Once the [[concepts/delegation-gate]] says "orchestrate", **scale picks the
route** and **role picks the tier**.

## Scale-first routing

| Scale | Definition | Route |
|---|---|---|
| **Micro** | 1 file, ≤20 lines, zero design decisions | ONE `worker` dispatch; lead judges the returned diff; chain a `doctor` only if there is a runnable acceptance path. |
| **Standard** (the default) | single-session scope | ONE chain: `engineer` → `doctor` (greenfield, runnable) or `engineer` → `peer` (touches existing behavior). The doctor/peer is the FINAL chain step. |
| **Large** | exceeds one context window, genuine concurrency, or ambiguity surviving the interview | interview → optional design-only `engineer` → ONE parallel fan-out (max 8) and/or chains → `peer` gate. |

The single chain is the default that gets **escalated up** — the pipeline is NOT
a default that gets pruned down. Most tasks are Standard.

## The role roster

| Role | Tier (pinned model) | When |
|---|---|---|
| `scout` | mechanical (`claude-sonnet-5:high`) | Read-only investigation (any read >50 lines, or a grep that missed once); returns compressed `file:line` findings; never edits. |
| `worker` | mechanical | Fully-specified mechanical edits, zero residual design; ships after review. |
| `engineer` | deep reasoning (`claude-opus-4-8:xhigh`) | THE DEFAULT WORKHORSE — whole bounded tasks end-to-end, design inline; also design-only dispatches. |
| `doctor` | mechanical (`claude-sonnet-5:high`) | Runs the acceptance path, PASS/FAIL + `file:line` evidence; never edits. Only when something is RUNNABLE. |
| `peer` | deep reasoning (`openai/gpt-5.5:xhigh`, pinned xhigh) | Gate-tier verification: existing behavior, 3+ files, auth/security, migrations, public API. Returns PASS / FAIL: implementation / FAIL: design. |
| `lawyer` | peer (`openai/gpt-5.5:xhigh`, pinned xhigh) | Blind independent second opinion on expensive-to-unwind calls; never shown the other's answer. |
| `fable-engineer` | orchestrator-tier, opt-in | Highest-stakes solo builds; dispatched ONLY with explicit user approval; its task must inline repo conventions (loads no context files). |

## Two durable design rules

- **No standing architect role.** When 2+ implementers will consume a design,
  dispatch `engineer` with a *design-only* task returning the design artifact
  ("architect-as-contract"), rather than maintaining a separate architect tier.
- **Core algorithmic/stateful modules route to `engineer` even when the design
  is fixed** — mechanical workers ship spec-corner defects that reviews miss
  (benchmarked). Laziness about tier choice is a false economy here.

Escalation `engineer` → `fable-engineer` happens ONLY with explicit user
approval (or after two review failures with lead's proposal accepted). The gate
that bounces work back is the [[concepts/rework-loop]]; the token-spend rules
that constrain fan-out are the [[concepts/fable-budget-invariants]]. The concrete
dispatch machinery is the [[components/subagent-extension]].
