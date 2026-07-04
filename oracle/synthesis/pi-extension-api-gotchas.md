---
title: Pi Extension & Programmatic-API Gotchas
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, extensions, synthesis]
aliases: ["extension api traps", "sendUserMessage gotcha"]
summary: Hard limits of pi's extension/programmatic API — extensions can't dispatch slash commands, sendUserMessage can't run /cmd, and extensions load once per session.
relationships:
  - target: "[[components/extension-system]]"
    type: derived_from
  - target: "[[synthesis/pi-workflow-conventions]]"
    type: related_to
  - target: "[[synthesis/write-gate-and-read-only-mode]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Pi Extension & Programmatic-API Gotchas

Cross-session lessons about the boundaries of pi's [[components/extension-system|extension API]].
The recurring theme: several things that *look* programmable from an extension are not,
because command dispatch and reload are gated to user-driven contexts, and extensions are
loaded exactly once at session start.

## Extensions cannot programmatically dispatch slash commands

`pi.sendUserMessage("/cmd")` does **not** run the command — the leading `/cmd` text is
delivered to the LLM verbatim. `prompt()` gates command dispatch behind
`expandPromptTemplates`, and `sendUserMessage()` hard-sets that flag to `false`; delivered
follow-ups drain straight to the LLM via the agent-loop, bypassing `prompt()` entirely.
`ctx.reload()` exists **only on command contexts**, so auto-reload from an event hook is
infeasible — despite the `reload_runtime` example in `extensions.md` suggesting otherwise.
Command dispatch / reload is reachable only from a user-typed slash command or an
extension-registered command context. `^[verified against pi 0.80.3]`
(heuristics `h_mr6ars7c_oazteylr`, `h_mr6ayaby_dz6c8ifn`.)

**Consequence for design:** an extension that needs the runtime reloaded after it changes
config cannot force it — it can only *tell the user* to `/refresh`. See
[[synthesis/pi-workflow-conventions]] for the refresh-after-edit habit that fills this gap.

## Extensions load once, at session start (stale-copy trap)

Extension code is read and bound at session start; editing an extension file on disk does
**not** update the already-running session. This produces confusing "not found" errors —
e.g. `request_write_mode` can report missing while the function plainly exists in the
extension file, because the live pi process is running a stale pre-edit copy
(heuristic `h_mr5p7pws_jw73u37k`; the write-gate consequences are covered in
[[synthesis/write-gate-and-read-only-mode]]). The remedy is `/refresh` (or `/reload`) after
editing any loaded resource — extension, skill, prompt, theme, or `AGENTS.md`
(heuristic `h_mr6ct77f_srg5s8ny`, detailed in [[synthesis/pi-workflow-conventions]]).

## "Shortcut conflicts with built-in, skipping" → check keybindings.json first

When an extension logs *"shortcut conflicts with built-in, skipping"*, the culprit is
usually **not** the extension. Check `~/.pi/agent/keybindings.json`: a user rebinding of a
built-in action onto that key is what creates the collision. The fix is to remove the
rebind (reverting the action to its default key), **not** to change the extension's
shortcut (heuristic `h_mr5vqdg7_wr9g26tr`).

## See also

- [[components/extension-system]] — the API these lessons constrain
- [[components/prompt-templates]] · [[concepts/message-queue]] — why `sendUserMessage` skips dispatch
- [[synthesis/pi-tui-rendering-gotchas]] — the other big extension-authoring trap surface
- [[references/extensions-md]] — upstream doc whose `reload_runtime` example is misleading
