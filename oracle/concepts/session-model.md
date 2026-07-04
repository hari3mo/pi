---
title: Session & Branching Model
category: concepts
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/sessions.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, concept]
aliases: [sessions, branching, tree, fork, clone, compaction]
summary: Pi stores each conversation as a single JSONL tree (id/parentId entries), so /tree branches in place while /fork and /clone spin off new files; compaction summarizes old context losslessly (full history stays in the file).
relationships:
  - target: "[[references/session-format]]"
    type: derived_from
  - target: "[[components/settings]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Session & Branching Model

A pi session is a **tree, not a transcript**. Every entry carries an `id` and a
`parentId`; the current position is the active leaf. All of this lives in a single
JSONL file, so branching happens *in place* without spawning new files. Sessions
auto-save to `~/.pi/agent/sessions/`, organized by working directory. The on-disk
format and `SessionManager` API are documented in [[references/session-format]].

## Navigating the tree

| Command | Output | Typical use |
|---|---|---|
| `/tree` | Same file | Jump to any previous point and continue; explore alternatives together |
| `/fork` | New file | Start a new session from an earlier user message |
| `/clone` | New file | Duplicate the current active branch before continuing |

Selecting a **user** message in `/tree` moves the leaf to its parent and places the text
in the editor (edit + resubmit = new branch). Selecting an **assistant/tool/compaction**
entry moves the leaf there with an empty editor (continue from that point).

`--session <path|id>`, `--fork <path|id>`, `-c` (continue), and `-r` (resume) reach the
same tree from the CLI ([[references/cli-reference]]).

## Compaction (context management)

Long sessions exhaust the context window, so pi **compacts**: it summarizes older
messages while keeping recent ones. Compaction is *lossy in context but not on disk* —
the full history remains in the JSONL file and is reachable via `/tree`.

- **Trigger:** auto when `contextTokens > contextWindow - reserveTokens`, or manually via
  `/compact [instructions]`.
- **Mechanism:** walk back until `keepRecentTokens` is reached to find a cut point (never
  cutting between a tool call and its result), summarize the earlier span into a
  `CompactionEntry` with a `firstKeptEntryId`, then reload from that boundary. A single
  oversized turn produces a "split turn" with two merged summaries.
- **Config:** `compaction.enabled` / `reserveTokens` (16384) / `keepRecentTokens` (20000)
  in [[components/settings]].

## Branch summarization

When `/tree` navigates *away* from a branch, pi can summarize the abandoned branch and
attach that summary at the new position, preserving context you left behind. Both
compaction and branch summaries share one structured summary format and track read/
modified files cumulatively.

## Extension hooks

Extensions can cancel or replace both mechanisms via `session_before_compact` /
`session_compact` and `session_before_tree` / `session_tree` events (e.g. summarize with
a cheaper model). See [[components/extension-system]] and the `custom-compaction.ts`
example in [[references/examples-catalog]].

## See also

- File format, entry types, parsing, `SessionManager`: [[references/session-format]]
- Session storage/dir settings: [[components/settings]]
