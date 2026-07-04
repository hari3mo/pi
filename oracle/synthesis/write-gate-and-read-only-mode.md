---
title: Write Gate & Read-Only Mode Behavior
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, extensions, synthesis]
aliases: ["read-only mode", "write gate", "--write flag", "redirect blocked"]
summary: How pi's read-only-default and write-gate extensions change tool availability — pass --write for programmatic sessions, avoid > redirects in read-only mode, and let the gate's UI menu grant write.
relationships:
  - target: "[[components/extension-system]]"
    type: derived_from
  - target: "[[synthesis/orchestration-lessons]]"
    type: related_to
  - target: "[[concepts/delegation-gate]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Write Gate & Read-Only Mode Behavior

The `read-only-default` and write-gate extensions silently reshape which tools are available
in a session. These lessons are the surprises that follow.

## Programmatic sessions start read-only — pass `--write`

When spawning pi programmatically (RPC / print / json mode), e.g. for tests, **pass
`--write`** — the `read-only-default` extension disables the `edit`/`write` tools in every
new session, so without the flag a spawned session cannot modify files
(heuristic `h_mr5l245j_gcds9p3m`).

## In read-only / confirm mode, avoid any `>` in bash commands

In pi read-only / confirm mode, avoid **any** `>` in a bash command — including a harmless
`2>/dev/null`. The write-gate extension's redirect regex flags **all** redirections as
destructive and blocks the command (heuristic `h_mr5lmko1_4ffgiwrg`). Route stderr away by
other means (or drop the redirect) when running under the gate.

## `request_write_mode` "not found" → dispatch anyway; the gate's hook pops the menu

If `request_write_mode` reports *"not found"* while the function clearly exists in the
extension file on disk, the running pi process is on a **stale pre-edit copy** (extensions
load once at session start — see [[synthesis/pi-extension-api-gotchas]]). Dispatch the
subagent call anyway: the write-gate's `subagent` `tool_call` hook still pops the UI menu to
switch to write mode, and children inherit `--write` only when the parent gate is in write
mode. Never fall back to asking for write access in prose (heuristic `h_mr5p7pws_jw73u37k`).
The orchestration framing of this rule lives in [[synthesis/orchestration-lessons]].

## See also

- [[components/extension-system]] — where `read-only-default` and the write-gate live
- [[concepts/delegation-gate]] — how write-mode inheritance flows to spawned children
- [[synthesis/orchestration-lessons]] · [[synthesis/pi-extension-api-gotchas]]
