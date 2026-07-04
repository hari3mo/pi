---
title: Rework Loop
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/docs/rework-loop.md
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, orchestration, concept]
aliases: ["Peer Verdict Contract", "Verification Gate"]
summary: Verification is a gate that can bounce work backwards — peer returns PASS / FAIL:implementation / FAIL:design, and the orchestrator loops until pass or a session-level 3-FAIL ceiling.
relationships:
  - target: "[[concepts/routing-and-roles]]"
    type: derived_from
  - target: "[[components/subagent-extension]]"
    type: implements
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Rework Loop

Peer-gated work is **not one-pass**. The `peer` role is a gate that can bounce
work backwards, and the orchestrator runs the loop until the gate passes or the
loop budget is exhausted. Applies to any build that goes through `peer` — a
fan-out or a solo `engineer`/`fable-engineer` build.

## The verdict contract (exact vocabulary)

Every `peer` task must return one of three verdicts:

- **`PASS`** — ship (the implementing agent commits).
- **`FAIL: implementation`** — findings as `file:line` + what's wrong + expected
  behavior; route back to the implementing agent.
- **`FAIL: design`** — the flaw is in the approach, not the code; do **not** patch
  around it — the orchestrator re-frames the problem (interviewing the user if
  "done" itself was misdefined, or dispatching a design-only `engineer`).

## Loop mechanics

1. On `FAIL: implementation`, dispatch the fix as ONE chain: the implementing
   agent given (a) the original bounded task, (b) the peer's findings **verbatim**,
   and (c) an explicit "fix ONLY the findings — no opportunistic refactoring"
   instruction → a fresh `peer` as the FINAL chain step.
2. The closing `peer` checks findings are resolved AND nothing regressed. Never
   let the implementing agent self-certify.
3. On `FAIL: design`, re-frame; the revised design flows forward through
   implementation → `peer` again.

## The budget and its ceiling

**A session-level ceiling of 3 *consecutive* peer FAILs (not per-work-item).**
Any FAIL increments the counter; any PASS resets it. At 3, STOP looping —
persistent failure means the problem was mis-framed, not mis-typed. The
orchestrator then re-frames the bounded problem itself, or surfaces the impasse
to the user with accumulated findings and a recommendation. Never silently ship
known-failing work; never burn unbounded tokens retrying.

## Convergence discipline

Each iteration must **shrink** the problem: pass prior findings forward so the
peer checks resolution, not rediscovery. If iteration N's findings are unrelated
to N−1's (new problems keep appearing), that is a design smell — re-frame early,
before the budget runs out.

## Mechanized, not just convention

The contract is enforced in code: the [[components/subagent-extension]]'s
`finalizeQaOutput` normalizes every peer return with a `[VERDICT: ...]` first
line (inserting a `MISSING` notice when the agent omits one), maintains the
session-level consecutive-FAIL counter, and appends a LOOP-BUDGET-EXHAUSTED
banner at 3. Mid-chain peer steps are not counted. This is another instance of
[[synthesis/prose-to-code-promotion]] — the verdict vocabulary and budget stop
being prose the lead must police and become structure the harness guarantees.
