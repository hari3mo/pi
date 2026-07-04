---
title: Themes
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/themes.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, tui, component]
aliases: [themes, theme JSON, color tokens]
summary: Themes are JSON files defining all 51 required color tokens (plus optional vars and export section); built-ins are dark/light, custom themes hot-reload when the active file is edited.
relationships:
  - target: "[[components/tui-components]]"
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

# Themes

Themes are JSON files that define the colors of pi's TUI. Built-ins are `dark` and
`light`; on first run pi detects the terminal background and defaults to one. Custom
themes **hot-reload** — edit the active theme file and pi applies changes immediately
(the only resource that reloads without `/reload`).

## Format

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": { "primary": "#00aaff", "secondary": 242 },
  "colors": { "accent": "primary", "border": "primary", "text": "", "...": "..." }
}
```

- `name` required, unique, no `/`.
- `vars` optional — reusable named colors referenced from `colors`.
- `colors` **must define all 51 required tokens** (no optional colors).
- `$schema` enables editor completion/validation.
- Optional `export` section colors `/export` HTML output (else derived from `userMessageBg`).

## The 51 tokens (groups)

- **Core UI (11):** `accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`,
  `warning`, `muted`, `dim`, `text`, `thinkingText`.
- **Backgrounds & content (11):** `selectedBg`, `userMessageBg`/`Text`,
  `customMessageBg`/`Text`/`Label` (extension messages), `toolPendingBg`/`SuccessBg`/
  `ErrorBg`, `toolTitle`, `toolOutput`.
- **Markdown (10):** `mdHeading`, `mdLink`/`mdLinkUrl`, `mdCode`/`mdCodeBlock`/`Border`,
  `mdQuote`/`Border`, `mdHr`, `mdListBullet`.
- **Tool diffs (3):** `toolDiffAdded`/`Removed`/`Context`.
- **Syntax (9):** `syntaxComment`/`Keyword`/`Function`/`Variable`/`String`/`Number`/
  `Type`/`Operator`/`Punctuation`.
- **Thinking-level borders (6):** `thinkingOff`→`thinkingXhigh` (editor border shows the
  current thinking level).
- **Bash mode (1):** `bashMode` (editor border under `!` prefix).

## Color values

Hex (`"#ff0000"`), 256-color index (`39`), a `vars` reference (`"primary"`), or `""` for
the terminal default. Pi uses 24-bit RGB and falls back to nearest 256-color on older
terminals; check `$COLORTERM`.

## Locations

Built-in `dark`/`light`; global `~/.pi/agent/themes/*.json`; project `.pi/themes/*.json`
(after [[concepts/project-trust|trust]]); packages; `themes` settings array; CLI
`--theme`. Select via `/settings` or `"theme"` in [[components/settings|settings.json]].

## See also

- Rendering primitives that consume theme tokens: [[components/tui-components]]
- The `theme` and display settings: [[components/settings]]
