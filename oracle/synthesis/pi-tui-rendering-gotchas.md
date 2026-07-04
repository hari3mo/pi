---
title: Pi TUI Rendering & Header Gotchas
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, tui, synthesis]
aliases: ["setHeader crashes", "tui width guard", "full-screen landing component"]
summary: How pi's TUI stacks header/chat/component/footer and pins the viewport — plus the width-guard and truncateToWidth rules that stop setHeader components from crashing the terminal.
relationships:
  - target: "[[components/tui]]"
    type: derived_from
  - target: "[[components/extension-system]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Pi TUI Rendering & Header Gotchas

Lessons from building custom [[components/tui|TUI]] components (notably the
`void-blackhole` landing extension). The TUI's layout model and its width handling are the
two things that repeatedly crash a naive implementation.

## Layout model: one buffer, viewport pinned to the bottom N rows

Pi stacks **header + chat + custom component + footer** into a single buffer and pins the
viewport to the bottom N terminal rows. A full-screen landing component therefore must keep
the **header at zero rows** while it owns the screen — install tall headers only *after* the
component closes. Reserve/height tweaks *inside* the component cannot compensate for header
lines rendered *above* it (heuristic `h_mr5q6prq_ypqh1hf8`).

## Width handling: guards must measure the art, and every line must be truncated

Two independent rules, both learned from TUI `uncaughtException` crashes:

1. **Guards measure the art, not a magic number.** When resizing `WORDMARK` or any
   fixed-width ASCII art in a `setHeader` render, update *every* width guard to measure the
   art (its max line length). Hardcoded thresholds crash the TUI when a rendered line
   exceeds terminal width (heuristic `h_mr5og2re_bwmlp7tk`).
2. **`truncateToWidth()` every returned line anyway.** Even when a width guard already
   exists, always `truncateToWidth()` each returned line — a stale or raced `width` param can
   slip past the guard, overflow, and crash the TUI. The guard alone is **not** sufficient
   (heuristic `h_mr5ut2oy_vzdtkqwq`).

The pattern: treat width as adversarial input at the render boundary, since the param can be
stale relative to the current terminal.

## Startup resource sections are rendered by `showLoadedResources()`

The startup `[Skills]` / `[Prompts]` / `[Extensions]` / `[Themes]` blocks are emitted by
`showLoadedResources()` in `dist/modes/interactive/interactive-mode.js` via
`addLoadedSection()` calls. To hide one section, comment out just that section's
`addLoadedSection` call (leaving the others and the Context/diagnostics intact). Because
`dist/` is regenerated, **re-apply after any pi reinstall/update**
(heuristic `h_mr5vsr40_uh1emf8q`). This edits the installed package, so it is an
[[synthesis/harness-environment-quirks|environment tweak]], not a config change.

## Running a TUI extension's TS harness

To exercise the `void-blackhole` extension's TypeScript harness, use
`node --experimental-strip-types --experimental-transform-types _void_harness.mts args...`
rather than `npx tsx`: tsx's CJS-interop hook throws `ERR_PACKAGE_PATH_NOT_EXPORTED` against
the pure-ESM `@earendil-works/pi-coding-agent` package (heuristic `h_mr5t3f3y_86jv0cg9`).

## See also

- [[components/tui]] — the layout/render API these rules constrain
- [[synthesis/pi-extension-api-gotchas]] — the other extension-authoring trap surface
- [[synthesis/harness-environment-quirks]] — the `dist/` regeneration & re-apply pattern
