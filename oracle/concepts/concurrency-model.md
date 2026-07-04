---
title: Concurrency Model
category: concepts
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/concurrency-guard.ts
  - /Users/harissaif/.pi/agent/extensions/lib/change-detection.ts
  - /Users/harissaif/.pi/agent/AGENTS.md
tags: [pi, config, concept]
aliases: ["Concurrent Sessions", "Autocommit Model"]
summary: How concurrent pi sessions across shells stay safe on ~/.pi/agent — an autocommit daemon snapshots edits, a single change-detection engine classifies foreign commits and tracks stale loaded resources (edit gate + recurring warnings until /refresh), and a pre-commit gate blocks bad config (with a launchd PATH caveat).
relationships:
  - target: "[[components/concurrency-guard-extension]]"
    type: implements
  - target: "[[components/config-validation]]"
    type: related_to
  - target: "[[concepts/self-audit-loop]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Concurrency Model

`~/.pi/agent` is a live git repo that multiple pi sessions (across different
shells) edit at once. Three mechanisms keep that safe.

## 1. The autocommit daemon

A launchd daemon is `WatchPath`-triggered on the whole config dir and commits
any file edit within ~10s. This gives every change an audit trail and lets other
sessions detect it via `git`. Practical consequence: **edits in `~/.pi/agent`
are snapshotted continuously**, so commit "noise" is ambient and expected, and a
concurrent session can silently commit over your in-memory copy of a file.

## 2. The concurrency guard (one engine, thin consumers)

All cross-shell change handling flows through ONE detection + classification
pass in `extensions/lib/change-detection.ts`; the
[[components/concurrency-guard-extension]] is a thin consumer that renders it:

- On `before_agent_start`, `detectAdvance()` classifies each committed file
  once. Never-edited-by-us → a plain foreign-change notice. Edited-by-us →
  **content-checked**: the committed blob is compared to the hash recorded on
  the last write — a match is this session's own autocommit snapshot (stay
  silent, no false positives), a mismatch is the highest-risk case (another
  session committed *different* content over a file we edited) and gets a
  "re-read before further edits" notice.
- The classified result (`{ range, foreign, collided, staleResources }`) is
  broadcast as `config-repo-advanced` on the shared event bus — the single
  consumer interface. [[concepts/self-audit-loop]] auto-re-runs the validator
  off it so injected problems track the new HEAD with no user action.
- **Stale loaded resources** (extensions/skills/prompts/themes/keybindings/
  AGENTS.md changed by another shell) enter a persistent registry: a "Stale
  loaded resources" block (with the concrete git delta) is re-injected EVERY
  turn, a widget shows above the editor, and the FIRST edit to a stale file
  the session has not re-read is **blocked** (`tool_call` → `{ block: true }`,
  the verified pi 0.80.3 capability; a second attempt passes with one warning
  — the gate never wedges). A `read` of the file cures the edit gate; only
  reload clears the registry.
- `/refresh` is the manual companion: report the pending delta, `ctx.reload()`
  — which resets the tracker, clearing baseline, stale registry, and widget.
  Programmatic reload from an event hook remains impossible in pi 0.80.3
  (`sendUserMessage` hard-sets `expandPromptTemplates:false`).

## 3. The pre-commit gate (and its launchd PATH caveat)

The same `validate-config.py` that powers the [[concepts/self-audit-loop]] also
runs as a **pre-commit hook**, gating config snapshots on schema conformance.
But there is a documented caveat: the launchd autocommit daemon runs the hook
under launchd's minimal PATH (`/usr/bin/python3`, which **lacks `jsonschema`**),
so schema violations silently degrade to parse-only, exit 0, and get
auto-committed. The pre-commit "backstop" only truly blocks for **interactive**
commits from a shell whose `python3` has `jsonschema`. ^[ambiguous]

## Durable lesson

The archived lesson the guard mechanizes: *edits in `~/.pi/agent` can be silently
wiped by a concurrent session — grep the live file rather than trusting session
memory.* When a "Concurrent-session notice" appears, RE-READ the named files
before building on remembered content. Loaded resources
(extensions/skills/prompts/themes/keybindings/AGENTS.md) can only be refreshed by
`/reload` (or `/refresh`) — an event hook cannot dispatch a command in pi 0.80.3,
so until the user reloads, the guard keeps the staleness visible (recurring
prompt block + widget) and gates edits to not-yet-re-read stale resources.
