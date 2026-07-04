# Config Index

This file is the semantic audit map of `~/.pi/agent`.
Git snapshots hold the raw diffs; this file holds the meaning.
Every session that changes config must update it.

## Feature index

| Feature | Files | Purpose |
|---|---|---|
| Void harness (test) | `extensions/_void_harness.mts` | Drives `void-blackhole.ts`'s fake registration to unit-test its component factory. |
| Chat title | `extensions/chat-title.ts` | Sets the terminal tab/window title to project + condensed last prompt, prefixed with a live session timer. |
| Custom header | `extensions/custom-header.ts` | Replaces pi's built-in header with a figlet "harimo" banner + greeting/cwd/aphorism subtitle lines. |
| Focus chime | `extensions/focus-chime.ts` | macOS-only notification (osascript) when an agent turn runs longer than 25s; `/chime` toggles it. |
| Minimal UI | `extensions/minimal-ui.ts` | Companion to the "porcelain" theme: quiet one-line footer + grayscale breathing working-indicator; `/minimal-ui` toggles. |
| Model awareness | `extensions/model-awareness.ts` | Keeps the LLM's system prompt aware of the live active model so the Delegation Gate model checks stay accurate across mid-session switches. |
| Model cycle | `extensions/model-cycle.ts` | Shift+Tab cycles a fixed pinned-model list (sonnet-5 → opus-4-8 → fable-5 → gemini-3.5-flash → gpt-5.5); frees Shift+Tab by rebinding `app.thinking.cycle` to Option+Tab. |
| pi-vcs breadcrumb | `extensions/pi-vcs-breadcrumb.ts` | Logs each pi tool-use touching a file to a breadcrumb log, folded into `.pi-vcs` autocommit messages. |
| Write-gate default | `extensions/read-only-default.ts` | New sessions start in "confirm" mode; `/write`, `/confirm`, `/read-only` (or Ctrl+\`) switch write-access modes. |
| Session receipt | `extensions/session-receipt.ts` | Narrow "shop receipt" summary (duration, turns, tokens, cost, tool tally, files touched); `/receipt` toggles it. |
| Task tracker | `extensions/task-tracker.ts` | Demo `task` tool + `/tasks` command; state lives in tool-result details so branching stays correct. |
| Void blackhole | `extensions/void-blackhole.ts` | Animated ASCII black-hole TUI landing page / `/void` screensaver with a Newtonian accretion-disk simulation. |
| Shared format helpers | `extensions/lib/format.ts` | Duration/token/cwd formatting helpers shared by several extensions; not auto-loaded (lives outside `extensions/*.ts`). |
| Continuous-learning design doc | `extensions/heuristics/DESIGN.md` | Authoritative v2 spec for the heuristics extension (storage, capture, injection, scoring, `/heuristics` command). |
| Heuristics `/heuristics` command | `extensions/heuristics/command.ts` | Implements the `/heuristics` command (list/edit/delete/promote) per DESIGN.md §10. |
| Heuristics entry point | `extensions/heuristics/index.ts` | Wires the `learn_heuristic` tool, `before_agent_start` injection, `agent_end`/`tool_result` nudges, and the `/heuristics` command together. |
| Heuristics injection | `extensions/heuristics/inject.ts` | Pure builder for the "Learned heuristics" system-prompt block from already-loaded heuristic lists (DESIGN.md §8). |
| Heuristics sanitize | `extensions/heuristics/sanitize.ts` | Save-pipeline text processing: sanitize, secret redaction, generality rewrite + lint (DESIGN.md §4–§5). |
| Heuristics schema | `extensions/heuristics/schema.ts` | Shared types/constants and dedup/scoring primitives for the heuristic entry schema (DESIGN.md §1, §6, §7, §11). |
| Heuristics store | `extensions/heuristics/store.ts` | Path resolution, JSONL read, locked read-modify-write mutations, and the full capture pipeline (DESIGN.md §1–§2, §4, §6–§7). |
| Subagent tool | `extensions/subagent/index.ts` | Spawns isolated `pi` subprocesses per delegated task; supports single/parallel/chain modes via JSON-mode structured output. |
| Subagent agents helper (symlink) | `extensions/subagent/agents.ts` | Symlink into the installed `pi-coding-agent` examples package; not repo-local logic. |
| Agent role set | `agents/architect.md`, `agents/builder.md`, `agents/fable-engineer.md`, `agents/peer-engineer.md`, `agents/qa-reviewer.md`, `agents/scope-planner.md`, `agents/shipper.md`, `agents/solo-engineer.md` | Subagent role definitions dispatched by the Delegation Gate (scope-planner → architect → builder → qa-reviewer → shipper, plus solo-engineer/fable-engineer/peer-engineer). |
| Prompt templates | `prompts/build.md`, `prompts/design.md`, `prompts/feature.md`, `prompts/ship.md` | `/design`, `/build`, `/ship`, `/feature` slash-command prompt templates. |
| Themes | `themes/porcelain.json`, `themes/porcelain-light.json` | "Porcelain" quiet theme (dark + light variants), paired with the Minimal UI extension. |
| Schema validation | `schema/*.schema.json`, `schema/manifest.json`, `scripts/validate-config.py` | Manifest-driven validator: schema conformance, heuristics scope drift, credential leakage, gitignore coverage, dangling skill symlinks, layout conformance. |
| pi-tui scrollback fix | `patches/pi-tui-scrollback-fix.md`, `patches/pi-tui-scrollback-fix-harness.mjs`, `patches/pi-tui-scrollback-fix.harness.mjs` | Documents + regression-tests a manual patch to the installed `pi-tui` dist that stops scrollback-wiping full-redraws when content above the viewport changes; must be re-applied after pi package updates. |
| Rework loop doc | `docs/rework-loop.md` | Defines the `qa-reviewer` verdict contract (PASS / FAIL:implementation / FAIL:design) and the pipeline's bounded rework/retry mechanics. |
| Autocommit snapshot infra | `.pi-vcs/autocommit.sh`, `.pi-vcs/hooks/pre-commit` | launchd-triggered git auto-snapshot of config changes (tool-driven and manual editor edits alike), gated by a pre-commit hook that runs the validator. |
| Global settings | `settings.json` | Default provider/model/thinking level, enabled model list (feeds `model-cycle.ts`), quiet-startup flag, installed packages. |
| Keybindings | `keybindings.json` | User keybinding overrides (currently: `app.thinking.cycle` → Option+Tab to free Shift+Tab for model-cycle; session rename → Option+R). |
| Global agent doctrine | `AGENTS.md` | The Delegation Gate, model-tier table, role split, routing rules, and config-maintenance checklist governing how this harness is used across sessions. |

## Changelog

> Append a new entry at the top whenever a config feature is added, changed,
> or removed. Format: date, summary, files touched, why. Keep entries to
> 2–4 lines.

### 2026-07-03

**~22:55 — Changelog backfilled (this entry).** Reconstructed the full
pre-index history below from `~/.pi/agent/sessions/` logs, ~370 auto-snapshot commits
(point-in-time count), file birth times, and the heuristics store. Files: `docs/config-index.md`.
Why: git history only begins 2026-07-03 15:41 (repo init), but the config was
built across ~2 days of sessions — the semantic arc needed to be auditable.

**~22:52 — Workflow heuristic: review git status before autocommit.** Captured via
`learn_heuristic` to `~/.pi/heuristics/heuristics.jsonl` — "Always run git status and
review changes before making an automatic commit." No code change; `.pi-vcs/autocommit.sh`
itself was not modified. Session: "always check git status before auto commit".

**~22:50 — Config index created (baseline).** `docs/config-index.md` — the
feature→files→purpose map plus this changelog, per AGENTS.md → Config Maintenance.
Session: "create some sort of index/mapping so future sessions can fully audit".
All entries dated below this one are reconstructed after the fact **(backfilled)** —
not written contemporaneously; use `git log` in ~/.pi/agent for the raw diffs.

**~22:44 — Model-cycle order finalized + rework-loop doc.** (backfilled)
Shift+Tab cycle pinned to sonnet-5 → opus-4-8 → fable-5 → gemini-3.5-flash → gpt-5.5
(`settings.json` `enabledModels`, `extensions/model-cycle.ts`); `docs/rework-loop.md`
formalized the qa-reviewer PASS / FAIL:implementation / FAIL:design verdict contract.

**~22:34 — Task tracker extension.** (backfilled) `extensions/task-tracker.ts` —
demo `task` tool + `/tasks` command; state lives in tool-result details so branch/rewind
stays correct. Session: "add task tracker to pi tui".

**~21:16–22:16 — Solo/fable engineer roles added.** (backfilled)
`agents/solo-engineer.md` (renamed from a short-lived `opus-engineer.md`) and
`agents/fable-engineer.md`; `AGENTS.md` tiers updated. Why: a single-session
whole-task tier and a highest-stakes orchestrator-tier solo tier, beyond the
scope-planner→…→shipper pipeline. Surfaced during the "fix scrollbar jumping" work.

**~21:28–22:21 — pi-tui scrollback fix documented + harness.** (backfilled)
`patches/pi-tui-scrollback-fix.md` + `…-harness.mjs` / `….harness.mjs`. Documents and
regression-tests a manual patch to the installed `pi-tui` dist that stops
scrollback-wiping full redraws when content above the viewport changes; must be
re-applied after pi updates. Session: "fix entirely with claude fable (bypass pipeline)".

**~18:58 — Shared format helpers extracted.** (backfilled) `extensions/lib/format.ts` —
duration/token/cwd formatters shared by several extensions (kept outside `extensions/*.ts`
so it isn't auto-loaded as an extension). Extracted during the "fable should never manually write code" session.

**~17:43 — Model-awareness extension.** (backfilled) `extensions/model-awareness.ts` —
injects the live active model into the system prompt so the Delegation Gate's model
checks stay correct after a mid-session Shift+Tab switch. Session: "pi should always
recognize current model … subagent orchestration does not trigger when fable is selected".

**~17:13–17:37 — Config governance: schema + validator + README.** (backfilled)
`schema/*.schema.json`, `schema/manifest.json`, `scripts/validate-config.py`, `README.md`,
`.gitignore`, and a validator-gating `.pi-vcs/hooks/pre-commit`; heuristics store/command/index
reworked to harness scope; `agents/peer-engineer.md` added. Why: standardize the directory
layout and enforce malleable, manifest-driven schema validation for auditability. Session:
"initialize and organize pi configuration. standardize directory and enforce malleable schema".

**~15:52–16:25 — Continuous-learning heuristics extension.** (backfilled)
`extensions/heuristics/{DESIGN.md,schema.ts,sanitize.ts,store.ts,inject.ts,index.ts,command.ts}`
+ `heuristics/heuristics.jsonl`. `learn_heuristic` tool, before-agent injection of a
"Learned heuristics" block, capture/sanitize/dedup pipeline, and the `/heuristics` command.
DESIGN.md spec came first (~15:21). Session: "I want pi to continuously learn and improve".

**~16:16–17:05 — Chat-title header extension.** (backfilled) `extensions/chat-title.ts`
(evolved from a short-lived `chat-descriptor.ts`) — sets the iTerm2 tab/window title to
project + condensed last prompt, prefixed with a live session timer. Sessions: "add summary
descriptor of chat to iterm2 window header", "add session running timer to window header".

**~14:32–17:47 — Write-gate (confirm-by-default) extension.** (backfilled)
`extensions/read-only-default.ts` (consolidated from earlier `confirm-edits.ts` /
`edit-mode.ts` / `read-edit-mode.ts` experiments). New sessions start in confirm mode;
`/write` `/confirm` `/read-only` (and Ctrl+\`) switch modes; confirm mode still allows
read-only bash. Sessions: "how to stop pi auto edit", "default pi mode should be full
read + confirm write", "allow confirm mode to use read only bash commands".

**~15:41 — Version-control infra: git + launchd autocommit.** (backfilled)
`.pi-vcs/autocommit.sh`, `.pi-vcs/hooks/pre-commit`, `extensions/pi-vcs-breadcrumb.ts`.
Set up git tracking of `~/.pi/agent` (remote `github.com/hari3mo/pi`, commits authored by the
user), launchd-triggered auto-snapshots, and a breadcrumb log of tool-touched files folded
into commit messages. Initial snapshot committed 15:41. No logged session captured the request; files born 15:41 (initial snapshot cf16e55).

**~14:51 → evening — Minimal UI + Porcelain themes.** (backfilled)
`extensions/minimal-ui.ts`, `themes/porcelain.json`, `themes/porcelain-light.json`.
Quiet one-line footer + grayscale breathing working-indicator, `/minimal-ui` toggle; later
revisions added thinking-level display, session time, and softened/then removed the prompt-bar
thinking animation. Session: "comprehensive redesign of pi tui. award-winning, minimal design".

**~14:50 — Model-cycle extension + keybinding rebinds.** (backfilled)
`extensions/model-cycle.ts`, `keybindings.json`. Shift+Tab cycles the pinned model list;
`app.thinking.cycle` rebound to Option+Tab (and later `app.session.rename` to Option+R) to
free Shift+Tab and resolve a Ctrl+R built-in conflict. Session: "remove rainbow from hari3mo,
change to harimo everywhere".

**~14:36 → evening — Delegation doctrine: AGENTS.md + roles + prompts.** (backfilled)
`AGENTS.md`, `agents/{scope-planner,architect,builder,qa-reviewer,shipper}.md`,
`prompts/{design,build,ship,feature}.md`, and the `extensions/subagent/` tool. Model-tier
hierarchy from the "Fable 5 where it pays" article; the Delegation Gate (pipeline only when
lead is fable, or opus past a complexity test), model-switch order, read/write-mode rules, and
a request-write-mode selection prompt were layered in across the day.

**~00:06 → ~21:00 — Void black-hole landing page.** (backfilled)
`extensions/void-blackhole.ts` (+ `extensions/_void_harness.mts` test harness). Animated ASCII
black-hole / accretion-disk `/void` screensaver + starfield with a "harimo" wordmark; many
refinements (constellations, keypress-to-quit, realism, 3D wordmark, shimmer, contrast).
Session: "add animated black hole from void to pi cli".

**by ~15:41 — Focus chime + session receipt (approx).** (backfilled)
`extensions/focus-chime.ts` (macOS notification when a turn exceeds 25s; `/chime`) and
`extensions/session-receipt.ts` ("shop receipt" summary; `/receipt`, later extended to include
subagent cost). Both present in the initial 15:41 snapshot; exact creation session not isolated.

### 2026-07-02

**~22:40 — Custom header banner.** (backfilled) `extensions/custom-header.ts` — replaces pi's
built-in header with a figlet "harimo" banner + greeting/cwd/aphorism subtitle (later extended
to hide the startup [Skills]/[Prompts]/[Extensions]/[Themes] sections). Earliest surviving
custom extension. Sessions: "add ascii art of pi symbol to start page", "creative custom touches to pi".

**~20:49 — First pi customizations (approx).** (backfilled) `settings.json` (ASCII-art launch,
provider/model defaults) plus early experiment extensions `claude-statusline.ts` and `effort.ts`
(both later removed). The starting point of the config. Sessions: "hi" (~20:49) and "set pi ascii art on launch" (~21:57).
