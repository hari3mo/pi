---
title: Keybindings
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md
tags: [pi, tui, component]
aliases: [keybindings, shortcuts, hotkeys, keybindings.json]
summary: All shortcuts are namespaced action ids (tui.editor.*, app.*) customizable in ~/.pi/agent/keybindings.json, each bound to one or more keys; edit then /reload to apply.
relationships:
  - target: "[[concepts/message-queue]]"
    type: related_to
  - target: "[[components/tui-components]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Keybindings

Every keyboard shortcut is customizable via `~/.pi/agent/keybindings.json`. Each **action
id** can bind to one or more keys. The config uses the same namespaced ids pi uses
internally and that extension authors reference in `keyHint()` and injected `keybindings`
managers. After editing, run `/reload` to apply without restarting.

Older configs using pre-namespaced ids (e.g. `cursorUp`, `expandTools`) are migrated to
the namespaced ids automatically on startup.

## Key format

`modifier+key`, modifiers `ctrl`/`shift`/`alt` (combinable). Keys: letters `a-z`, digits
`0-9`, specials (`escape`, `enter`, `tab`, `space`, `backspace`, `home`, `end`,
`pageUp`/`Down`, arrows…), function keys `f1`-`f12`, and symbols. e.g.
`ctrl+shift+alt+x`.

## Action namespaces

- **`tui.editor.*`** — cursor movement, deletion, kill-ring/yank/undo (Emacs-style
  defaults: `ctrl+a`/`ctrl+e`/`ctrl+w`/`ctrl+k`/`ctrl+u`…).
- **`tui.input.*`** — `newLine` (`shift+enter`), `submit` (`enter`), `tab`.
- **`tui.select.*`** — list navigation/confirm/cancel.
- **`app.*`** — application: `interrupt` (esc), `clear` (ctrl+c), `exit` (ctrl+d),
  `suspend` (ctrl+z), `editor.external` (ctrl+g), `clipboard.pasteImage` (ctrl+v).
- **`app.session.*`** / **`app.tree.*`** — session picker + tree navigation and filters.
- **`app.model.*`** — `select` (ctrl+l), `cycleForward` (ctrl+p) / `cycleBackward`
  (shift+ctrl+p); `app.thinking.cycle` (shift+tab), `app.thinking.toggle` (ctrl+t).
- **`app.tools.expand`** (ctrl+o), **`app.message.followUp`** (alt+enter) /
  **`app.message.dequeue`** (alt+up) — see [[concepts/message-queue]].
- **`app.models.*`** — inside the `/scoped-models` selector.

## Custom config

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

Single key or array of keys; user config overrides defaults. The docs include full Emacs
and Vim example maps. On native Windows, `app.suspend` has no default (no Unix job
control); WSL keeps normal `ctrl+z`/`fg`.

> Gotcha: rebinding a built-in action's key can make an extension log "shortcut conflicts
> with built-in, skipping" — revert the rebind to the action's default to resolve.

## See also

- Queue keys and semantics: [[concepts/message-queue]]
- `keyHint()` in custom rendering: [[components/tui-components]]
