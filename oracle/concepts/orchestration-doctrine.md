---
title: Orchestration Doctrine
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, orchestration, concept]
aliases: ["Fable Doctrine", "Delegation Doctrine"]
summary: The governing philosophy of the local pi harness — a lead touches each task twice (dispatch + judge) and delegates everything between, spending tokens only on judgment.
relationships:
  - target: "[[concepts/delegation-gate]]"
    type: related_to
  - target: "[[concepts/routing-and-roles]]"
    type: related_to
  - target: "[[concepts/fable-budget-invariants]]"
    type: related_to
  - target: "[[concepts/rework-loop]]"
    type: related_to
  - target: "[[concepts/self-audit-loop]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Orchestration Doctrine

The centerpiece of the local harness (`~/.pi/agent/AGENTS.md`). It reframes the
pi coding agent from a solo worker into an **orchestrator whose only defensible
spend is judgment at decision points**: intent capture, spec authoring, routing,
judging returns, and reconciling disagreement.

## The core claim

> A lead touches each task exactly **twice** — dispatch and judge. Everything
> between — reading, writing, verifying — is delegated.

Reading is cheap for a subagent with a fresh context window; it is expensive for
the lead, whose context is the scarce resource. So the doctrine pushes all
bulk work outward and reserves the lead's tokens for the two moments where
judgment actually compounds: **framing the task well (dispatch)** and **deciding
whether the return is correct (judge)**.

## Why "twice", not "never" or "always"

- **Never** (pure autonomy) loses the judgment that catches a mis-framed task
  before it burns a whole pipeline.
- **Always** (do everything yourself) spends the lead's scarce context on
  mechanical reading/writing a subagent could absorb.
- **Twice** is the equilibrium: a generous, precise dispatch spec that one-shots,
  then a gate on the return. `FRONT-LOAD SPEC QUALITY` — the dispatch spec is the
  lead's highest-leverage token spend (see [[concepts/fable-budget-invariants]]).

## The doctrine is model-aware, not universal

The full "orchestrate, never edit" posture applies **only** to the `fable` lead.
Other leads are gated differently by the [[concepts/delegation-gate]]: an Opus
lead may implement directly at small scale; any other model works directly with
no pipeline. This branch is now mechanized by the
[[components/lead-config-extension]] rather than left to prose the agent must
remember — a live example of the harness's [[synthesis/prose-to-code-promotion]]
principle.

## The pieces it governs

| Piece | Page |
|---|---|
| Who orchestrates vs. edits | [[concepts/delegation-gate]] |
| Scale → route, and the role roster | [[concepts/routing-and-roles]] |
| Token-spend rules | [[concepts/fable-budget-invariants]] |
| Verification as a bounce-back gate | [[concepts/rework-loop]] |
| Every task's framing skeleton | [[components/subagent-extension]] (Dispatch Contract) |
| The harness auditing itself | [[concepts/self-audit-loop]] |
| Structure questions answered by the graph | [[concepts/knowledge-graph-integration]] |

## Durable intent (not volatile structure)

The doctrine's *values* are stable even as the config files churn: judgment is
scarce, mechanical work is delegated, prose that can be enforced becomes code,
and errors are root-caused then integrated downstream (a heuristic, a validator
guard, a hook fix). For the live file/symbol structure of `~/.pi/agent`, use the
graphify `graph` tool — that is [[concepts/knowledge-graph-integration|its job]],
not this vault's.
