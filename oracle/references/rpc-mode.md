---
title: "Reference: RPC Mode"
category: references
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md
tags: [pi, sdk, reference]
aliases: [RPC mode, pi --mode rpc, JSONL protocol]
summary: RPC mode drives pi headlessly over stdin/stdout with strict LF-delimited JSONL — commands in, response objects + streamed events out; use for non-Node integrations (Node apps should use the SDK).
relationships:
  - target: "[[workflows/embed-pi-with-sdk]]"
    type: related_to
  - target: "[[concepts/what-is-pi]]"
    type: derived_from
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Reference: RPC Mode

`pi --mode rpc` runs the agent headlessly via a JSON protocol over stdin/stdout — for
embedding in IDEs, custom UIs, or non-Node apps. **Node/TypeScript apps should use the
SDK's `AgentSession` directly** ([[workflows/embed-pi-with-sdk]]) rather than spawning a
subprocess.

## Framing (critical)

Strict JSONL with **LF (`\n`) as the only record delimiter**. Clients must split on `\n`
only (strip a trailing `\r` if present) and must **not** use generic line readers.
Node's `readline` is *not* protocol-compliant because it also splits on `U+2028`/`U+2029`,
which are valid inside JSON strings.

## Protocol shape

- **Commands** — JSON objects to stdin, one per line, with an optional `id` for
  request/response correlation.
- **Responses** — `{ "type": "response", "command": ..., "success": bool, "id"? }`.
  `success: true` = accepted/queued/handled; failures *after* acceptance come through the
  event stream, not a second response.
- **Events** — agent events streamed to stdout as JSON lines (`agent_start`/`agent_end`,
  `turn_start`/`turn_end`, `message_start`/`message_end`, tool events, etc.).

## Command families

- **Prompting:** `prompt` (with optional `images`; during streaming needs
  `streamingBehavior`), `steer`, `follow_up`, `abort`. Mirrors the
  [[concepts/message-queue|message queue]] semantics; extension commands (`/x`) run
  immediately, skills/templates are expanded.
- **Session:** `new_session`, `switch_session`, `fork`, `clone`, `get_fork_messages`,
  `get_state`, `get_messages`, `get_entries`, `get_tree`, `get_last_assistant_text`,
  `get_session_stats`, `set_session_name`, `export_html`, `get_commands`.
- **Model/thinking:** `set_model`, `cycle_model`, `get_available_models`,
  `set_thinking_level`, `cycle_thinking_level`.
- **Delivery/compaction/retry:** `set_steering_mode`, `set_follow_up_mode`, `compact`,
  `set_auto_compaction`, `set_auto_retry`, `abort_retry`.
- **Bash:** `bash`, `abort_bash`.

## Extension UI protocol

Extensions' `ctx.ui` calls surface as protocol messages the client must render/answer:
`select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`,
`set_editor_text` — with value/confirmation/cancellation response shapes. The
`rpc-demo.ts` extension + `examples/rpc-extension-ui.ts` client exercise all of these.

> This page summarizes rpc.md (the full doc includes per-command JSON schemas, the event
> catalog, error handling, type definitions, and Python/Node client examples).

## See also

- In-process alternative: [[workflows/embed-pi-with-sdk]]
- The four run modes: [[concepts/what-is-pi]]
