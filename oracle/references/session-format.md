---
title: "Reference: Session File Format"
category: references
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md
tags: [pi, sdk, reference]
aliases: [session format, JSONL entries, SessionManager API]
summary: Sessions are versioned JSONL trees (v3) — a header line plus id/parentId entries (message, model_change, compaction, branch_summary, custom, custom_message, label, session_info); buildSessionContext walks leaf→root for the LLM.
relationships:
  - target: "[[concepts/session-model]]"
    type: derived_from
  - target: "[[workflows/embed-pi-with-sdk]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: related_to
base_confidence: 0.75
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Reference: Session File Format

The on-disk backing of the [[concepts/session-model|session & branching model]]. Each
session is a JSONL file at
`~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl` (cwd with `/`→`-`). Every line
is a JSON object with a `type`. Entries form a tree via `id`/`parentId`.

## Versions

- **v1** — linear (legacy, auto-migrated).
- **v2** — tree structure via `id`/`parentId`.
- **v3** (current) — `hookMessage` role renamed to `custom` (extensions unification).

Sessions auto-migrate to v3 on load. Deletion = remove the `.jsonl` (or `/resume` →
`Ctrl+D`; pi uses the `trash` CLI when available).

## Content blocks

`AgentMessage`s carry typed blocks: `text`, `image` (base64 + `mimeType`), `thinking`,
`toolCall` (`id`, `name`, `arguments`).

## Entry types

| `type` | Meaning |
|---|---|
| `session` | Header (first line): `version`, `id`, `timestamp`, `cwd`, optional `parentSession`. Not part of the tree. |
| `message` | A `user`/`assistant`/`toolResult` `AgentMessage`. |
| `model_change` / `thinking_level_change` | Mid-session model or thinking-level switch. |
| `compaction` | `summary` + `firstKeptEntryId` + `tokensBefore`; optional `details`, `fromHook`. |
| `branch_summary` | `summary` of an abandoned branch + `fromId`; optional `details`, `fromHook`. |
| `custom` | Extension state (`customType`, `data`) — **not** in LLM context. |
| `custom_message` | Extension-injected message (`content`, `display`) — **in** LLM context. |
| `label` | Bookmark on `targetId` (clear by setting `label` undefined). |
| `session_info` | Display `name` (from `/name`, `--name`, `pi.setSessionName()`). |

`display: false` on a `custom_message` only hides it from the TUI — it is still sent to
the model (matches the `sendMessage` rule in [[components/extension-system]]).

## Context building

`buildSessionContext()` walks from the current leaf to root: collects path entries,
extracts current model + thinking level, and if a `CompactionEntry` is on the path emits
the summary first, then messages from `firstKeptEntryId` onward; `BranchSummaryEntry` and
`CustomMessageEntry` are converted to message formats.

## SessionManager API (highlights)

- **Create:** `create(cwd, sessionDir?)`, `open(path)`, `continueRecent(cwd)`,
  `inMemory(cwd?)`, `forkFrom(sourcePath, targetCwd)`. **List:** `list(cwd)`, `listAll()`.
- **Append (return entry id):** `appendMessage`, `appendModelChange`,
  `appendThinkingLevelChange`, `appendCompaction`, `appendCustomEntry`,
  `appendCustomMessageEntry`, `appendSessionInfo`, `appendLabelChange`.
- **Tree:** `getLeafId`/`getLeafEntry`, `getEntry(id)`, `getBranch(fromId?)`, `getTree`,
  `getChildren`, `branch(entryId)`, `resetLeaf`, `branchWithSummary`,
  `createBranchedSession(leafId)`.
- **Context/info:** `buildSessionContext()`, `getEntries`, `getHeader`, `getSessionName`,
  `getCwd`, `getSessionId`, `getSessionFile`, `isPersisted`.

## See also

- The conceptual model: [[concepts/session-model]]
- SDK usage of `SessionManager`: [[workflows/embed-pi-with-sdk]]
- Extension state persistence (`custom` entries): [[components/extension-system]]
</content>
