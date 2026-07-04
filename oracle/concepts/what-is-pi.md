---
title: Message Queue Semantics
category: concepts
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md
tags: [pi, tui, concept]
aliases: [steering, follow-up, steering vs follow-up]
summary: While the agent works you can queue a steering message (Enter, delivered after the current tool batch) or a follow-up (Alt+Enter, delivered only when all work is done).
relationships:
  - target: "[[components/keybindings]]"
    type: related_to
  - target: "[[components/settings]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Message Queue Semantics

Pi lets you submit messages *while the agent is still working*. The distinction between
the two queue modes is about **when** the message is delivered, and it is one of pi's
most important interaction primitives.

## The two modes

| Action | Key | Delivered |
|---|---|---|
| **Steering** | `Enter` | After the current assistant turn finishes executing its tool calls, before the next LLM call — it *redirects* work in flight |
| **Follow-up** | `Alt+Enter` | Only after the agent finishes *all* work — it *queues* the next task |

Supporting controls:

- **Escape** — abort the current turn and restore queued messages to the editor.
- **Alt+Up** (`app.message.dequeue`) — pull queued messages back into the editor.

> On Windows Terminal, `Alt+Enter` is fullscreen by default; remap it (terminal setup)
> so pi can receive the follow-up shortcut.

## Delivery batching (settings)

Two [[components/settings|settings]] control whether queued messages of each kind are
delivered one at a time or all at once:

- `steeringMode`: `"one-at-a-time"` (default) or `"all"`
- `followUpMode`: `"one-at-a-time"` (default) or `"all"`

`"one-at-a-time"` waits for a response between messages; `"all"` delivers the whole
queue at once.

## Extension parallel

Extensions inject messages with the same three-way timing via `pi.sendMessage(...,
{ deliverAs })` and `pi.sendUserMessage(..., { deliverAs })`:

- `"steer"` ≈ Enter (mid-turn, before next LLM call)
- `"followUp"` ≈ Alt+Enter (after all work)
- `"nextTurn"` — queue for the next *user* prompt; does not interrupt or trigger anything

See [[components/extension-system]] for the injection API. Note that `sendMessage`
always enters LLM context (except `nextTurn`); for display-only output use `ctx.ui`
widgets instead.

## See also

- Keybinding ids `app.message.followUp` / `app.message.dequeue`: [[components/keybindings]]
- Transport preference (`transport` setting) also lives with delivery config: [[components/settings]]
</content>
</invoke>
