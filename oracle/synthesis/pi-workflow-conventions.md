---
title: Pi Workflow Conventions & User Vocabulary
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, config, synthesis]
aliases: ["refresh after edit", "task tool usage", "the void", "status bar meaning"]
summary: Standing workflow habits and vocabulary — refresh after editing loaded resources, use the task tool for lists, preserve message-queue steering keys, and what 'the void'/'status bar' mean.
relationships:
  - target: "[[concepts/message-queue]]"
    type: related_to
  - target: "[[synthesis/pi-extension-api-gotchas]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Pi Workflow Conventions & User Vocabulary

Standing habits and this user's terminology, learned across sessions. These are mostly
`user-confirmed` corrections — treat them as strong defaults.

## Refresh after editing any loaded resource

After editing loaded resources — extensions, skills, prompts, themes, or `AGENTS.md` — in
`~/.pi/agent`, run `/refresh` (or `/reload`) so pi picks up the change instead of running on
a **stale in-memory copy** (heuristic `h_mr6ct77f_srg5s8ny`). This is the manual remedy for
the load-once-at-session-start behavior documented in
[[synthesis/pi-extension-api-gotchas]] (extensions can't reload themselves programmatically).

## Track multi-task requests with the `task` tool

When the user gives a **list of tasks or multiple distinct tasks** in one message, use the
`task` tool (`add` / `list` / `toggle`) to track them rather than just replying inline
(heuristic `h_mr64pqxy_nbkhmgko`).

## Preserve native message-queue steering keys

When modifying pi's [[concepts/message-queue|message-queue]] behavior, preserve the native
**Enter-to-send-or-steer** and **Option+Enter-to-queue-follow-up** semantics unless
explicitly asked otherwise (heuristic `h_mr69pwqg_7jr2bquc`).

## User vocabulary

- **"ascii galaxy" / "the void" / "/void"** (formerly "/galaxy") → the pi TUI landing-page
  extension `~/.pi/agent/extensions/void-blackhole.ts` — **not** the `~/Developer/galaxy`
  website (which is the lensed-blackhole personal site) (heuristic `h_mr5k39hu_ww0o`).
- **"status bar"** (about pi's TUI) → the **prompt input / editor bar** (the box you type
  in), **not** the footer line (heuristic `h_mr5upxvw_doe8069e`).

## See also

- [[concepts/message-queue]] — the steering semantics to preserve
- [[synthesis/pi-extension-api-gotchas]] — why /refresh is needed (no programmatic reload)
- [[synthesis/pi-tui-rendering-gotchas]] — the void-blackhole landing component
