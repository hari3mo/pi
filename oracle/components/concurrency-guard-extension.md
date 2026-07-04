---
title: Concurrency-Guard Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/concurrency-guard.ts
tags: [pi, extensions, config, component]
aliases: ["concurrency-guard.ts", "/refresh"]
summary: The extension making concurrent pi sessions safe on ~/.pi/agent — detects HEAD advances, content-checks files this session edited, emits a config-repo-advanced signal, and provides /refresh. Fail-open on any git error.
relationships:
  - target: "[[concepts/concurrency-model]]"
    type: implements
  - target: "[[concepts/self-audit-loop]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Concurrency-Guard Extension

`extensions/concurrency-guard.ts` — the runtime behind the
[[concepts/concurrency-model]]. It makes concurrent sessions across shells safe
on `~/.pi/agent` without locking anything.

## The four hooks

1. **`before_agent_start`** — if HEAD advanced since this session last looked,
   classify each committed file. Not-edited-by-us → a plain foreign-change
   notice. Edited-by-us → **content-check**: compare the committed blob to the
   hash recorded on our last write. A match is our own autocommit snapshot (stay
   silent — no false positives); a mismatch is the highest-risk case (another
   session committed *different* content over a file we edited) and gets a
   dedicated "RE-READ before further edits" notice. It also emits
   `config-repo-advanced` on the shared bus so [[concepts/self-audit-loop]]
   re-runs the validator.
2. **`tool_call` (edit/write)** — if the target under `~/.pi/agent` is git-dirty
   but not touched by this session, warn (once) *before* the edit lands.
3. **`tool_result` (edit/write, non-error)** — mark the file touched and record
   its post-edit content hash. Kept off `tool_call` so a failed edit doesn't
   suppress later foreign-change notices.
4. **`agent_end`** — if ≥2 same-file collisions occurred, send one nudge to
   serialize the sessions or split file ownership.

## `/refresh`

The manual companion to the auto-notice. An event hook *cannot* dispatch a
command in pi 0.80.3 (`sendUserMessage` delivers slash text to the LLM, it does
not dispatch), and `ctx.reload()` exists only on a command context — so the
auto-notice can only *tell* the user to reload. `/refresh` does it in one step:
re-check repo state, report the delta, and `ctx.reload()` (which re-fires
`session_start`, resetting the baseline so the notice won't re-fire for the
change just synced). It lives in this extension so the git-state logic stays in
one place.

## Design intent (durable)

- **Fail-open.** Any git failure disables the check for that event and never
  blocks a turn.
- **Loaded-resource hint.** When the changed files include loaded resources
  (extensions/skills/prompts/themes/keybindings/AGENTS.md), the notice tells the
  user to run `/refresh` or `/reload` — their in-memory copies are stale.
- It mechanically enforces the archived lesson *"edits in `~/.pi/agent` can be
  silently wiped by a concurrent session — grep the live file rather than
  trusting session memory."* See [[concepts/concurrency-model]] for the full
  autocommit-daemon + pre-commit-gate picture.

*(Live symbol/call structure → the `graph` tool per
[[concepts/knowledge-graph-integration]].)*
