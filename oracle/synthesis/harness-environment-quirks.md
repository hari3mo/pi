---
title: Harness Environment Quirks (autocommit, PATH, packaging)
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, config, environment]
aliases: ["launchd autocommit", "jsonschema PATH", "validate-config gaps"]
summary: Environment traps around the ~/.pi/agent harness — the launchd autocommit daemon, jsonschema-PATH degradation of the pre-commit gate, validate-config blind spots, and packaged-app relaunch.
relationships:
  - target: "[[components/config-validation]]"
    type: derived_from
  - target: "[[concepts/self-audit-loop]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Harness Environment Quirks

The `~/.pi/agent` harness has an autocommit daemon, a pre-commit validation gate, and a
graphify rebuild loop all running in the background. These lessons are the ways that
machinery surprises you — mostly by making its safety nets weaker than they look.

## The launchd autocommit daemon commits any edit within ~10s

The autocommit daemon is `launchd` `WatchPath`-triggered on the **whole** `~/.pi/agent`
directory (`settings.json`, `keybindings.json`, `AGENTS.md`, and everything else) and
commits *any* file edit within ~10 seconds. When testing git-commit gating, invoke the
pre-commit hook **directly** with the file staged
(`.pi-vcs/hooks/pre-commit`) — that is race-immune — rather than via `git commit`, which the
daemon will sweep out from under you mid-block (heuristic `h_mr68t102_vb7xdz22`). Ambient
commit noise from this daemon is expected; ignore it.

## The pre-commit gate silently degrades under launchd's minimal PATH

The daemon runs the pre-commit `validate-config.py` gate under **launchd's minimal PATH**,
where `python3` resolves to `/usr/bin/python3` — which **lacks `jsonschema`**. So schema
violations silently degrade to a parse-only check, exit 0, and get **auto-committed anyway**.
The pre-commit "backstop" only truly blocks for **interactive** commits from a shell whose
`python3` has `jsonschema` installed (heuristic `h_mr68svnd_ddgh2b5r`). Don't trust the
daemon's green commit as schema validation.

## `validate-config.py` doesn't schema-check theme JSON

`validate-config.py` does **not** schema-check theme JSON files (there is no theme schema in
`schema/manifest.json`), so a clean *"0 errors"* run does **not** vouch for theme integrity.
Verify themes independently: JSON-parse them and check token parity against the sibling
variant (heuristic `h_mr5tuc9h_wo7zd50d`). The validator's coverage is only as wide as its
manifest — see [[components/config-validation]].

## Check session logs before re-fixing a "known" bug

Before re-fixing a bug already described in the heuristics store, **check recent session
logs** — a prior fix may have been reverted by a later *"undo all changes"* request,
silently reintroducing the same bug (heuristic `h_mr5udd6q_vukgl5n0`). The heuristic
documenting a fix does not guarantee the fix is still in the tree.

## Source edits don't reach a packaged Electron app until rebuild + relaunch

When a verified fix in `usage-dashboard` "doesn't work", check first whether the user is
running the **packaged Electron app from `release/`**. Source edits reach it only after
`npm run app:dist` **and** an app relaunch — `main.js` re-extracts `standalone.tar` only when
the bundled tar is newer than the extracted `server.js` (heuristic `h_mr5v1oof_8cj8se96`).

## See also

- [[components/config-validation]] — `validate-config.py` and its manifest-driven scope
- [[concepts/self-audit-loop]] — the session-start audit that runs this validator
- [[synthesis/pi-tui-rendering-gotchas]] — the related "re-apply after pi update" dist/ pattern
