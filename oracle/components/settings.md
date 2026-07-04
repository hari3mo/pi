---
title: Settings Model
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, config, component]
aliases: [settings, settings.json, project overrides]
summary: Pi settings are JSON files where project (.pi/settings.json) deep-merges over global (~/.pi/agent/settings.json), covering model/thinking, UI, compaction, retry, message delivery, resources, and more.
relationships:
  - target: "[[concepts/project-trust]]"
    type: related_to
  - target: "[[components/providers-and-models]]"
    type: related_to
  - target: "[[concepts/session-model]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Settings Model

Pi uses JSON settings files with **project settings overriding global settings** (nested
objects are deep-merged, not replaced). Edit directly or use `/settings` for common
options.

| Location | Scope |
|---|---|
| `~/.pi/agent/settings.json` | Global (all projects) |
| `.pi/settings.json` | Project (loaded only after [[concepts/project-trust|trust]]) |

Paths in settings resolve relative to the file's directory (`~/.pi/agent` or `.pi`);
absolute and `~` supported.

## Key setting groups

- **Model & thinking:** `defaultProvider`, `defaultModel`, `defaultThinkingLevel`,
  `hideThinkingBlock`, `thinkingBudgets` (per-level token budgets). See
  [[components/providers-and-models]].
- **UI & display:** `theme`, `externalEditor` (use `code --wait` for VS Code),
  `quietStartup`, `defaultProjectTrust` (`ask`/`always`/`never`, global only),
  `doubleEscapeAction`, `treeFilterMode`, padding/autocomplete tunables,
  `collapseChangelog`.
- **Compaction:** `compaction.enabled`/`reserveTokens` (16384)/`keepRecentTokens` (20000).
  Branch summary: `branchSummary.reserveTokens`/`skipPrompt`. See
  [[concepts/session-model]].
- **Retry:** agent-level `retry.enabled`/`maxRetries`/`baseDelayMs`; provider-level
  `retry.provider.*` (keep `maxRetries` at `0` unless needed).
- **Message delivery:** `steeringMode`/`followUpMode` (`one-at-a-time`/`all`),
  `transport` (`sse`/`websocket`/`websocket-cached`/`auto`), HTTP/WS timeouts. See
  [[concepts/message-queue]].
- **Network:** `httpProxy` (global only). **Shell:** `shellPath`,
  `shellCommandPrefix`, `npmCommand`.
- **Terminal & images:** `terminal.showImages`/`imageWidthCells`/`clearOnShrink`,
  `images.autoResize`/`blockImages`.
- **Sessions:** `sessionDir` (precedence: `--session-dir` > `PI_CODING_AGENT_SESSION_DIR`
  > `sessionDir`).
- **Model cycling:** `enabledModels` (patterns, same as `--models`).
- **Markdown:** `markdown.codeBlockIndent`.
- **Telemetry:** `enableInstallTelemetry`, `enableAnalytics` (opt-in),
  `warnings.anthropicExtraUsage`.

## Resources

`packages`, `extensions`, `skills`, `prompts`, `themes` define where to load each
resource type (arrays support globs, `!exclude`, `+path`, `-path`). `enableSkillCommands`
toggles `/skill:name`. See [[components/pi-packages]] for `packages` object-form filters.

## Project override example

```jsonc
// global: { "theme": "dark", "compaction": { "enabled": true, "reserveTokens": 16384 } }
// project: { "compaction": { "reserveTokens": 8192 } }
// result: { "theme": "dark", "compaction": { "enabled": true, "reserveTokens": 8192 } }
```

## See also

- Env vars, CLI flags, and modes: [[references/cli-reference]]
- Trust that gates project settings: [[concepts/project-trust]]
