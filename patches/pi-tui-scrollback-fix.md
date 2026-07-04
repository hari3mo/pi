# pi-tui scrollback-wipe fix (applied to installed dist, pi 0.80.3)

## Problem
Terminal scrollbar "doesn't work / jumps around" while pi streams output
(iTerm2 and others). Root cause (upstream earendil-works/pi #6050, #5839,
#5825): in `pi-tui`'s `doRender()`, any in-place change to a line **above the
visible viewport** (markdown rewrap during streaming, header/widget updates)
falls back to `fullRender(true)`, which emits `ESC[2J ESC[H ESC[3J` — clearing
the terminal scrollback and re-emitting the entire transcript. Clearing
scrollback resets the scrollbar and can snap the view to the top/bottom.

## Fix
File:
`~/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js`

In `doRender()`, replace the destructive fallback:

```js
if (firstChanged < prevViewportTop) {
    logRedraw(`firstChanged < viewportTop (${firstChanged} < ${prevViewportTop})`);
    fullRender(true);
    return;
}
```

with a clamp that skips off-screen rows (they live in scrollback and cannot be
repainted in place anyway; line indexes above `prevViewportTop` map to the same
physical rows regardless of content changes, so skipping is always
layout-safe — scrollback just keeps the stale render, like any normal
terminal program):

```js
if (firstChanged < prevViewportTop) {
    if (lastChanged < prevViewportTop) {
        // Everything that changed is off-screen: nothing to paint.
        logRedraw(`skipped off-screen change (${firstChanged}..${lastChanged} < ${prevViewportTop})`);
        this.positionHardwareCursor(cursorPos, newLines.length);
        this.previousLines = newLines;
        this.previousKittyImageIds = this.collectKittyImageIds(newLines);
        this.previousWidth = width;
        this.previousHeight = height;
        this.previousViewportTop = prevViewportTop;
        return;
    }
    logRedraw(`clamped firstChanged to viewportTop (${firstChanged} -> ${prevViewportTop})`);
    firstChanged = prevViewportTop;
}
```

Width/height changes and drastic shrinks still do real full redraws (needed
for rewrap); those are the only remaining scrollback clears during a session.

## Addendum (2026-07-03): viewport reflow on content collapse
The clamp above assumes rows over `prevViewportTop` stay in scrollback. That
breaks when content SHRINKS below the old viewport window — e.g. the
void-blackhole splash (a full-screen `ctx.ui.custom` component in the editor
container) collapses back into the small editor while the wordmark header is
installed at the top of the buffer. `newViewportTop = newLines.length - height`
drops far below `prevViewportTop`, and clamping left the header rows above the
old viewport top unpainted → the harimo wordmark rendered clipped on the main
screen. (Upstream code did `fullRender(true)` here, so the clip only existed
under this patch.)

Fix, in the same `firstChanged < prevViewportTop` block, before the clamp:
when `newViewportTop < prevViewportTop` (and no kitty images — those still
punt to `fullRender(true)`), re-emit the whole new buffer from screen row 0
with per-line `2K` clears. The first `height` rows overwrite the stale screen
in place; overflow scrolls correct content into scrollback. No `2J`/`3J`, so
scrollback is preserved. Cursor bookkeeping: `previousViewportTop =
newViewportTop`, `hardwareCursorRow = newViewportTop + height - 1`. Look for
`logRedraw("viewport reflow repaint …")` in `doRender()` for the exact code.

## Verification
Regression harness: `~/.pi/agent/patches/pi-tui-scrollback-fix-harness.mjs`
(durable copy; also at `/tmp/pi-scroll-fix/harness.mjs` while it survives).
Run with `node`. Covers: above-viewport in-place change (no `3J`, no repaint
of off-screen rows), mixed above+below change (visible part repainted, no
`3J`), append after a skipped change stays aligned, drastic shrink doesn't
throw, width change still fully clears, splash→main collapse paints the full
wordmark with no `3J` (both taller-than-screen and fits-on-screen variants),
shimmer + append stay aligned after the collapse, mid-session full-screen
collapse bottom-pins correctly. All passed on 2026-07-03.

## Re-apply after pi upgrades
`pi update` / npm reinstall overwrites `dist/tui.js`. If the scrollbar
jumping returns after an upgrade, re-apply BOTH edits above (the clamp and the
viewport-reflow addendum — without the addendum the splash→main wordmark clips
again), then run the harness. Or check whether upstream fixed #6050 properly
first.
