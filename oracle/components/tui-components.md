---
title: TUI Components (pi-tui)
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md
tags: [pi, tui, extensions, component]
aliases: [pi-tui, TUI components, custom UI, overlays, Focusable]
summary: pi-tui gives extensions a Component interface (render/handleInput/invalidate), built-ins (Text/Box/Container/Spacer/Markdown/Image), overlays, and a Focusable interface for IME cursor positioning.
relationships:
  - target: "[[components/extension-system]]"
    type: derived_from
  - target: "[[components/themes]]"
    type: uses
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# TUI Components (pi-tui)

`@earendil-works/pi-tui` is the component library
[[components/extension-system|extensions]] and custom [[components/tools|tools]] use to
render interactive terminal UI. It is how the "custom UI" capability of the extension
system is realized.

## Component interface

```typescript
interface Component {
  render(width: number): string[];   // one string per line; each ≤ width
  handleInput?(data: string): void;  // keyboard input when focused
  wantsKeyRelease?: boolean;         // Kitty key-release events
  invalidate(): void;                // clear cached render (on theme change)
}
```

Each rendered line gets a full SGR + OSC 8 reset appended — **styles don't carry across
lines**, so reapply per line or use `wrapTextWithAnsi()`.

## Built-in components

Import from `@earendil-works/pi-tui`: `Text` (wrapped multi-line text), `Box` (padding +
background), `Container` (vertical grouping via `addChild`/`removeChild`), `Spacer`
(empty lines), `Markdown` (syntax-highlighted, takes a `MarkdownTheme`), `Image` (Kitty/
iTerm2/Ghostty/WezTerm/Warp).

## Using components

- In extensions: `const handle = ctx.ui.custom(component)` → `handle.requestRender()`,
  `handle.close()`.
- In tools: `pi.ui.custom(component)`.
- **Overlays:** `ctx.ui.custom(factory, { overlay: true, overlayOptions })` renders on top
  without clearing the screen; `overlayOptions` control size (numbers or `%`), anchor
  (9 positions), and offsets.

## Focusable (IME support)

Components showing a text cursor should implement `Focusable` (a `focused` field). TUI
sets `focused`, scans output for `CURSOR_MARKER` (a zero-width APC escape), and positions
the hardware cursor there. Container components wrapping an `Input`/`Editor` must
propagate `focused` to the child, or IME candidate windows (CJK) mispaint. Built-in
`Editor` and `Input` already implement it. The hardware cursor is hidden by default;
enable with `showHardwareCursor` / `setShowHardwareCursor(true)` / `PI_HARDWARE_CURSOR=1`.

## Where UI attaches

`ctx.ui` also exposes non-component slots: `notify`, `confirm`, `select`, `input`,
`setStatus` (footer), `setWidget` (above/below editor), `setFooter`, `setHeader`,
`setEditorComponent` (replace the editor, e.g. modal-editor), `setWorkingIndicator`,
`setHiddenThinkingLabel`, and autocomplete providers. Colors come from the active
[[components/themes|theme]].

> The doc's common patterns (SelectList, BorderedLoader, SettingsList, status indicator,
> widgets, custom footer, vim-mode editor) are worked examples; this page summarizes the
> primitives — consult [[references/examples-catalog]] for concrete extensions.

## See also

- Capability context and `ctx.ui`: [[components/extension-system]]
- Theme tokens for styling: [[components/themes]]
- Concrete UI extensions (overlays, editors, footers): [[references/examples-catalog]]
</content>
