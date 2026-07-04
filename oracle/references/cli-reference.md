---
title: "Reference: CLI, Commands & Environment"
category: references
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/usage.md
tags: [pi, config, reference]
aliases: [CLI reference, pi flags, slash commands, environment variables]
summary: Distilled catalog of pi's CLI (modes, model/session/tool/resource flags), interactive slash commands, and environment variables from the README + usage doc.
relationships:
  - target: "[[concepts/what-is-pi]]"
    type: derived_from
  - target: "[[components/settings]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Reference: CLI, Commands & Environment

Summary of `pi [options] [@files...] [messages...]`, the interactive command surface, and
env vars. See [[concepts/what-is-pi]] for orientation and [[components/settings]] for the
JSON settings equivalents.

## Modes

| Flag | Mode |
|---|---|
| *(default)* | Interactive TUI |
| `-p`, `--print` | Print response and exit (also reads piped stdin) |
| `--mode json` | Structured JSON event stream (see json.md) |
| `--mode rpc` | JSONL over stdin/stdout — [[references/rpc-mode]] |
| `--export <in> [out]` | Export session to HTML |

## Model options

`--provider <name>`, `--model <pattern>` (`provider/id`, optional `:<thinking>`),
`--api-key <key>`, `--thinking <off|minimal|low|medium|high|xhigh>`, `--models
<patterns>` (Ctrl+P cycling), `--list-models [search]`. See
[[components/providers-and-models]].

## Session options

`-c`/`--continue`, `-r`/`--resume`, `--session <path|id>`, `--fork <path|id>`,
`--session-dir <dir>`, `--no-session`, `--name`/`-n <name>`. See
[[concepts/session-model]].

## Tool options

`--tools`/`-t <list>` (allowlist), `--exclude-tools`/`-xt <list>`, `--no-builtin-tools`/
`-nbt`, `--no-tools`/`-nt`. Built-ins: `read`, `bash`, `edit`, `write`, `grep`, `find`,
`ls`. See [[components/tools]].

## Resource options

`-e`/`--extension <source>` (repeatable), `--no-extensions`, `--skill <path>`,
`--no-skills`, `--prompt-template <path>`, `--no-prompt-templates`, `--theme <path>`,
`--no-themes`, `--no-context-files`/`-nc`. Combine `--no-*` with explicit flags to load
exactly what you want.

## Other

`--system-prompt <text>`, `--append-system-prompt <text>`, `--verbose`, `-a`/`--approve`,
`-na`/`--no-approve` ([[concepts/project-trust]]), `-h`, `-v`. `@file` args include files
in the message (`pi -p @screenshot.png "What's in this?"`).

## Package commands

`pi install|remove|uninstall <source> [-l]`, `pi update [source|self|pi|--all|
--extensions|--self|--extension <src>]`, `pi list`, `pi config`. See
[[components/pi-packages]].

## Slash commands (interactive)

Auth: `/login`, `/logout`. Model: `/model`, `/scoped-models`. Config: `/settings`,
`/trust`, `/reload`, `/hotkeys`, `/changelog`. Session: `/resume`, `/new`, `/name`,
`/session`, `/tree`, `/fork`, `/clone`, `/compact [prompt]`. Output: `/copy`,
`/export [file]`, `/import <file>`, `/share`. Plus `/skill:name` skills and
`/templatename` prompt templates, and extension-registered commands. `/quit` exits.

## Environment variables

`PI_CODING_AGENT_DIR` (config dir), `PI_CODING_AGENT_SESSION_DIR`, `PI_PACKAGE_DIR`,
`PI_OFFLINE` (disable startup network), `PI_SKIP_VERSION_CHECK`, `PI_TELEMETRY`,
`PI_CACHE_RETENTION` (`long`), `VISUAL`/`EDITOR` (Ctrl+G fallback). Provider API-key env
vars are catalogued in [[components/providers-and-models]].

## See also

- Keyboard shortcuts: [[components/keybindings]]
- Message-queue keys: [[concepts/message-queue]]
- Settings JSON: [[components/settings]]
</content>
