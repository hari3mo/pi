---
title: Delegation Gate
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
  - /Users/harissaif/.pi/agent/config/lead-profiles.json
tags: [pi, orchestration, concept]
aliases: ["Delegation Threshold", "Lead Gate"]
summary: The per-model rule deciding whether a lead orchestrates via subagents or works directly — plus the two MUST pre-flights (write-gate, intent interview) that run before any dispatch.
relationships:
  - target: "[[concepts/orchestration-doctrine]]"
    type: derived_from
  - target: "[[concepts/routing-and-roles]]"
    type: related_to
  - target: "[[components/lead-config-extension]]"
    type: implements
  - target: "[[components/write-gate-extension]]"
    type: uses
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Delegation Gate

The first decision every lead makes: **do I orchestrate, or do I work directly?**
The answer branches on which model is the lead.

## The branch (two lead profiles)

Encoded in `config/lead-profiles.json` and injected each prompt by the
[[components/lead-config-extension]]:

| Lead | Profile | Posture |
|---|---|---|
| `claude-fable-5` | **fable** | Always orchestrates, never edits/writes files. Its `edit`/`write` are hard-blocked by the [[components/write-gate-extension]] in every gate mode. |
| any other model (incl. `claude-opus-4-8`) | **direct** (catch-all `.*`) | Works directly — no subagents, no pipeline — design → execute → verify inline. |

Only fable orchestrates. Every other lead — opus included — works directly; the
pipeline is not a default to prune down but the sole province of the fable lead.

## Two MUST pre-flights (fable lead)

Before *any* reading, exploration, or dispatch, a fable lead runs two gates:

1. **Write-Gate Pre-Flight** — if the task plausibly needs file changes, the
   FIRST action is the `request_write_mode` tool (not prose). Children inherit
   `--write` only when the parent gate is in write mode, and auto-write is scoped
   to `~/.pi`; exploring first wastes work if the user re-frames when prompted.
   See [[components/write-gate-extension]].
2. **Intent Interview** — ambiguity is resolved by interviewing the *user*
   before dispatching. Headless (no user) → proceed on stated assumptions and
   list them in the final report. There is no scope-planner fallback: scope is
   pinned by the interview and the lead's own dispatch-spec authoring.

## Why it is mechanized

The gate used to live only as prose the agent had to remember every turn. Because
the model can switch mid-session (shift+tab), the
[[components/lead-config-extension]] re-reads the active model id on every
`before_agent_start` and appends the matching profile block — a canonical instance
of [[synthesis/prose-to-code-promotion]]. The prose in `AGENTS.md` remains the
canon; the profiles file is its runtime echo (duplicating the full doctrine would
only let it drift, so the `fable` profile deliberately adds nothing).

Once past the gate, scale determines the route and the roles — see
[[concepts/routing-and-roles]].
