---
title: Write-Gate Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/read-only-default.ts
tags: [pi, extensions, orchestration, component]
aliases: ["read-only-default.ts", "Write Gate"]
summary: The extension gating file writes by mode (confirm/write/read-only), hard-blocking fable-lead edits in every mode, publishing the gate so subagents inherit it, and offering request_write_mode as an orchestrator pre-flight.
relationships:
  - target: "[[concepts/delegation-gate]]"
    type: implements
  - target: "[[components/subagent-extension]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Write-Gate Extension

`extensions/read-only-default.ts` — the safety gate over file mutation. New pi
sessions start in **confirm** mode by default; two other modes exist.

## The three modes

| Mode | Behavior | Reach |
|---|---|---|
| **confirm** (default) | Reads free; each edit/write or destructive bash command prompts for approval. | `/confirm` |
| **write** | Auto-approves mutations under `~/.pi`; outside that root, UI sessions still prompt and headless sessions block. | `/write`, `pi --write` |
| **read-only** | edit/write tools disabled; destructive bash blocked. | `/read-only` |

`Ctrl+`` cycles confirm → write → read-only. In **headless** modes (no UI)
confirm-mode blocks writes since it cannot prompt — use `pi --write` for
unattended write access under `~/.pi` only. The mode persists across `/resume` within a session but
every brand-new session starts in confirm. Confirm-mode "allow all writes" is also scoped to `~/.pi`.

## Two harness-specific enforcements

1. **Fable lead never edits directly.** In *every* gate mode (before the
   write-mode early return), a fable-model lead calling `edit`/`write` is
   hard-blocked with a "delegate to a worker-tier agent" reason. Spawned
   children set `PI_SUBAGENT=1` and are exempt (a `fable-engineer` child runs
   `claude-fable-5` and MUST write). This is the enforcement half of the
   [[concepts/delegation-gate]]; the doctrine-injection half is the
   [[components/lead-config-extension]].
2. **Subagents inherit the gate.** The current mode is published on
   `globalThis.__piWriteGateMode`; the [[components/subagent-extension]] reads it
   and grants children `--write` **only** when the parent is in write mode.
   Even with `--write`, the child gate auto-approves mutations only under
   `~/.pi`; outside that root a headless child blocks. Orchestrating from a
   gated mode offers to switch to write first, so workers don't silently fail their writes.

## `request_write_mode` (orchestrator pre-flight)

A tool that shows the user a selection prompt to open the gate — the mechanized
form of the [[concepts/delegation-gate|Write-Gate Pre-Flight]]. Headless, it
**throws** (isError) rather than improvising, forcing the agent to STOP and
surface the blocker instead of editing directly or spawning writer subagents
that would silently run read-only. It also injects an `[ORCHESTRATOR
PRE-FLIGHT]` note for fable leads with a closed gate.

## Destructive-bash gating

Confirm mode also prompts for (and read-only blocks) destructive bash commands
matched by a pattern set (rm/mv/git commit/npm install/…). Safe redirects to
`/dev/null` and fd duplications are stripped before matching so read-only
commands like `grep foo 2>/dev/null` pass freely. Fail-open: any error in the
fable guard falls through to normal gating.
