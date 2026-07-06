---
title: "Reference: Examples Catalog"
category: references
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/sdk/README.md
tags: [pi, extensions, reference]
aliases: [examples, example extensions, sdk examples, examples catalog]
summary: Map of the pi install's examples/ tree — 70+ extension examples grouped by theme (safety, custom tools, UI, git, compaction, providers) plus a 13-step SDK ladder — showing what each demonstrates.
relationships:
  - target: "[[components/extension-system]]"
    type: related_to
  - target: "[[workflows/write-an-extension]]"
    type: related_to
  - target: "[[concepts/extensibility-philosophy]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Reference: Examples Catalog

The pi install ships `examples/` with two families plus a top-level
`rpc-extension-ui.ts` client. These are the canonical "how do I…" references for the
[[concepts/extensibility-philosophy|extensibility philosophy]] — even large features
(DOOM, sub-agents, plan mode, sandboxing) fit the extension model.

## `examples/sdk/` — programmatic ladder

A 13-step progression from minimal to full control:
`01-minimal` → `02-custom-model` → `03-custom-prompt` → `04-skills` → `05-tools`
(built-in allowlists) → `06-extensions` → `07-context-files` → `08-prompt-templates` →
`09-api-keys-and-oauth` → `10-settings` → `11-sessions` → `12-full-control` →
`13-session-runtime` (runtime-backed session replacement). See
[[workflows/embed-pi-with-sdk]].

## `examples/extensions/` — 70+ extensions by theme

**Lifecycle & safety:** `permission-gate` (confirm dangerous bash), `project-trust`
(the `project_trust` event), `protected-paths`, `confirm-destructive`,
`dirty-repo-guard`, `sandbox/` (OS-level sandbox), `gondolin/` (route tools into a
micro-VM).

**Custom tools:** `hello` (minimal), `todo` (stateful list + `/todos`), `question`/
`questionnaire` (`ctx.ui.select`/input), `tool-override` (wrap `read`),
`dynamic-tools` (register at runtime + prompt snippets/guidelines),
`structured-output` (`terminate: true`), `built-in-tool-renderer`/`minimal-mode`
(rendering), `truncated-tool` (ripgrep truncation), `ssh` (remote delegation),
`subagent/` (isolated-context sub-agents). See [[components/tools]].

**Commands & UI:** `preset`, `plan-mode/`, `tools` (`/tools` toggle), `handoff`, `qna`,
`status-line`, `github-issue-autocomplete`, `widget-placement`,
`hidden-thinking-label`, `working-indicator`, `model-status`, `snake`/`tic-tac-toe`/
`doom-overlay/` (games/overlays), `send-user-message`, `timed-confirm`, `rpc-demo`,
`modal-editor`/`rainbow-editor` (custom editors), `notify`, `titlebar-spinner`,
`summarize`, `custom-footer`/`custom-header`, `overlay-test`/`overlay-qa-tests`,
`shutdown-command`, `reload-runtime`, `interactive-shell`/`inline-bash`
(`user_bash`/`input` hooks), `input-transform-streaming`. See
[[components/tui-components]].

**Git:** `git-checkpoint` (stash per turn), `auto-commit-on-exit`.

**System prompt & compaction:** `pirate` (`systemPromptAppend`), `claude-rules`,
`custom-compaction`, `trigger-compact`. See [[concepts/session-model]].

**System integration:** `mac-system-theme`. **Resources:** `dynamic-resources/`
(`resources_discover`). **Messages:** `message-renderer`, `event-bus` (`pi.events`).
**Session metadata:** `session-name`, `bookmark`.

**Custom providers:** `custom-provider-anthropic/` (OAuth + custom streaming),
`custom-provider-gitlab-duo/` (proxy via pi-ai streaming). See
[[workflows/add-custom-provider]].

**External deps:** `with-deps/` (own `package.json` + jiti resolution), `file-trigger`.

## Running

`pi --extension examples/extensions/permission-gate.ts`, or copy into
`~/.pi/agent/extensions/`. SDK: `npx tsx examples/sdk/01-minimal.ts`.

## See also

- The API these use: [[components/extension-system]]
- Build your own: [[workflows/write-an-extension]]
