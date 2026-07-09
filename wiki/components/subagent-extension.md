---
title: Subagent Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/subagent/index.ts
  - /Users/harissaif/.pi/agent/docs/delegation-contract.md
  - /Users/harissaif/.pi/agent/docs/rework-loop.md
tags: [pi, extensions, orchestration, component]
aliases: ["subagent tool", "subagent/index.ts"]
summary: The tool that spawns isolated pi subprocesses for delegation (single/parallel/chain) and mechanizes the orchestration doctrine — thinking-lock, gate inheritance, standing-contract footer, peer verdict normalization, sonnet self-disable.
relationships:
  - target: "[[concepts/routing-and-roles]]"
    type: implements
  - target: "[[concepts/rework-loop]]"
    type: implements
  - target: "[[components/write-gate-extension]]"
    type: uses
  - target: "[[concepts/orchestration-doctrine]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Subagent Extension

`extensions/subagent/index.ts` — the `subagent` tool. Each invocation spawns a
separate `pi` process with an isolated context window, run in JSON mode to
capture structured output. It is the concrete machinery behind the
[[concepts/orchestration-doctrine]] and [[concepts/routing-and-roles]].

## Three dispatch modes

- **single** — `{ agent, task }`.
- **parallel** — `{ tasks: [...] }`, capped at 8, concurrency-limited to 4.
- **chain** — `{ chain: [...] }`, sequential, with a `{previous}` placeholder
  substituting the prior step's output.

## The doctrine it mechanizes (durable design)

- **Standing-contract footer.** Every dispatched task is auto-appended a hygiene
  footer (never touch files you didn't create; return the asked shape; orient
  with the `graph` tool first). The lead never restates it — see
  [[components/subagent-extension|Dispatch Contract]] template in
  `docs/delegation-contract.md`.
- **Peer verdict normalization.** `finalizeQaOutput` runs only on `peer` returns:
  it parses the verdict, prepends a `[VERDICT: ...]` first line (inserting
  `MISSING` when absent), maintains the **session-level consecutive-FAIL counter**,
  and appends a LOOP-BUDGET-EXHAUSTED banner at 3. Mid-chain peer steps are not
  counted. This enforces the [[concepts/rework-loop]] contract.
- **Thinking-lock.** Effort is pinned per model family, never inherited from the
  lead: Opus and GPT-5.5 children run `:xhigh`; Sonnet and Gemini Flash children
  run `:high`. Unknown model families keep their configured suffix unchanged.
- **Write-gate inheritance.** Children get `--write` only when the parent is in
  write mode (reads `__piWriteGateMode` from the
  [[components/write-gate-extension]]); otherwise they run headless in confirm
  mode where writes are blocked. Children set `PI_SUBAGENT=1` so sibling
  extensions can exempt them (e.g. the fable edit-block).
- **Sonnet self-disable.** When the *current* model is Sonnet the tool refuses to
  dispatch — Sonnet is already the mechanical/worker tier, so further delegation
  is redundant.

## Scope and inspection

Agents are discovered from the user dir by default (`agentScope: "user"`);
`"both"`/`"project"` include repo-local agents behind a trust confirmation.
`/subagents` (or Ctrl+Alt+S) opens a live keyboard panel of active runs;
`/subagent-shell` inspects one run's full transcript, thinking blocks, tool
results, and stats.

*(File-level symbol/call structure → the `graph` tool, per
[[concepts/knowledge-graph-integration]]; this page is durable design only.)*
