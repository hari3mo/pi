# pi dist patch: theme-detect timeout 100ms -> 1500ms

## Problem

`settings.json` uses the auto light/dark pair `"porcelain-light/porcelain"`.
pi resolves the variant per session via an OSC 11 terminal-background query
with a hardcoded `timeoutMs: 100`, falling back to COLORFGBG, then dark.

Over SSH the OSC 11 round-trip must traverse the network; against EC2 the
channel RTT is ~1.5s, so the 100ms timeout loses EVERY time. COLORFGBG is not
forwarded by SSH either, so the remote peer deterministically fell back to the
DARK variant — a dark prompt box rendered onto iTerm's light background reads
as a black box ("still black", 2026-07-08). Locally iTerm answers OSC 11
instantly, hence Mac always looked right.

## Patch (per-machine, in the installed dist — pi update WIPES it)

Files (4 sites total, marker `pi-theme-detect-timeout`):

- `dist/modes/interactive/theme/theme-controller.js` (2 sites)
- `dist/cli/startup-ui.js` (2 sites)

Apply on each machine:

```sh
PKG=$(npm root -g)/@earendil-works/pi-coding-agent
perl -pi -e 's/timeoutMs: 100 \}/timeoutMs: 1500 \/* pi-theme-detect-timeout *\/ }/g' \
  "$PKG/dist/modes/interactive/theme/theme-controller.js" \
  "$PKG/dist/cli/startup-ui.js"
grep -c pi-theme-detect-timeout "$PKG/dist/modes/interactive/theme/theme-controller.js" \
  "$PKG/dist/cli/startup-ui.js"   # expect 2 + 2
```

1500ms covers a ~1.5s SSH RTT with margin; detection is a one-shot at startup
(and on OS theme-change events), so the added latency is imperceptible.

## Companion (already in place)

- EC2 `~/.bashrc` exports `COLORTERM=truecolor` (SSH doesn't forward it;
  without it pi renders 256-color and quantizes theme hexes).
- `scripts/validate-config.py` warns when the marker disappears
  (i.e. after `pi update`) — re-apply per this file.

## Verify

Start pi over SSH on the peer: the submitted-prompt box must match the Mac's
(light variant on a light iTerm background). Structural check:
`grep -c pi-theme-detect-timeout` = 2 per file, on both machines.
