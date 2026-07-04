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

Baseline — feature index created; all entries above this line predate the
index. Use `git log` in ~/.pi/agent for raw pre-index history.
