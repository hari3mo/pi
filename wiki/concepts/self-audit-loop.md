---
title: Self-Audit Loop
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/AGENTS.md
  - /Users/harissaif/.pi/agent/extensions/self-audit.ts
  - /Users/harissaif/.pi/agent/scripts/validate-config.py
  - /Users/harissaif/.pi/agent/scripts/audit-pipelines.py
tags: [pi, config, concept]
aliases: ["Harness Self-Audit", "Problems Become Prompts"]
summary: The standing doctrine that the harness audits itself every session and turns its own problems into prompts — validator + pipeline audit at session start, prose→code promotion, errors root-caused then integrated downstream.
relationships:
  - target: "[[concepts/orchestration-doctrine]]"
    type: derived_from
  - target: "[[components/config-validation]]"
    type: implements
  - target: "[[synthesis/prose-to-code-promotion]]"
    type: related_to
  - target: "[[concepts/knowledge-graph-integration]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Self-Audit Loop

A standing order of the harness: **the harness audits itself, and problems
become prompts.** Every session begins by checking its own config health, and
any failure is injected into the system prompt for the agent to fix or surface.

## The loop, each session

1. `scripts/validate-config.py` (static config: schema conformance, hygiene,
   hook/patch integrity) and `scripts/audit-pipelines.py` (pipeline *dynamics*:
   rebuild-hook firing, staleness flags, autocommit liveness, graph-connectivity
   ratchet) run at session start. The [[components/config-validation]] extension
   wires this and injects ERROR/WARN lines into the prompt (zero cost when
   healthy).
2. The same validator gates every snapshot commit (pre-commit hook); `/audit`
   re-runs it on demand with the fuller `--full` pipeline checks.
3. Cross-shell changes re-trigger the audit automatically (via the
   `config-repo-advanced` bus — see [[concepts/concurrency-model]]).

## The four standing principles it enforces

- **Problems become prompts.** A failing check is not logged and forgotten; it
  is surfaced in-band where the agent can act on it or tell the user.
- **Prose that can be enforced becomes code.** When a standing order or prompt
  rule can be mechanized, promote it to an extension, a validator check, or a
  hook — prompts drift, enforcement does not. This is the
  [[synthesis/prose-to-code-promotion]] pattern.
- **Errors are never just worked around.** Root-cause the failure, then
  integrate the fix downstream — a `learn_heuristic` lesson, a
  `validate-config.py` guard, a hook fix, or a graph re-cache.
- **The pipelines audit themselves.** `audit-pipelines.py` checks whether the
  automation actually fired and whether graph quality holds a connectivity
  ratchet (best-ever giant fraction; a >20% drop is an ERROR).

## Adapting to pi itself changing

Toolchain versions (pi / graphify / node) are baseline-tracked; a change WARNs
once with a re-verification list. `/audit` loads every extension with pi's own
jiti loader (`scripts/smoke-extensions.mjs`) so an `ExtensionAPI` or layout break
after a `pi update` is caught before it bites a session. The graphify layer
carries structural staleness (`needs_update`), closing the loop with
[[concepts/knowledge-graph-integration]].

The concrete checks each script performs live in
[[components/config-validation]]; the *durable intent* — a config that
continuously proves its own health — is this page.
