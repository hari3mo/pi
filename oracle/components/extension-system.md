---
title: Extension System & ExtensionAPI
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, extensions, component]
aliases: [ExtensionAPI, extensions, ExtensionContext, event hooks]
summary: Extensions are TypeScript modules (default factory receiving ExtensionAPI) that register tools/commands/shortcuts/providers and subscribe to a rich lifecycle of events, with ctx.ui for interaction and ctx for session/model access.
relationships:
  - target: "[[concepts/extensibility-philosophy]]"
    type: implements
  - target: "[[components/tools]]"
    type: related_to
  - target: "[[components/tui-components]]"
    type: uses
  - target: "[[workflows/write-an-extension]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Extension System & ExtensionAPI

Extensions are TypeScript modules that extend pi's behavior. An extension exports a
**default factory function** that receives an `ExtensionAPI` object (`pi`). The factory
may be `async` — pi awaits it before startup continues, which is how one-time init
(e.g. fetching a remote model list before `pi.registerProvider()`) runs before
`session_start`. Extensions load via [jiti](https://github.com/unjs/jiti), so TypeScript
works without a build step.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => { /* block/modify */ });
  pi.registerTool({ /* ... */ });
  pi.registerCommand("hello", { /* ... */ });
}
```

## Locations & loading

| Location | Scope |
|---|---|
| `~/.pi/agent/extensions/*.ts` or `*/index.ts` | Global |
| `.pi/extensions/*.ts` or `*/index.ts` | Project-local (after [[concepts/project-trust|trust]]) |
| `settings.json` `extensions`/`packages` | Explicit paths / [[components/pi-packages|packages]] |
| `pi -e ./ext.ts` | One-off / quick test |

Auto-discovered extensions hot-reload with `/reload`. Available imports:
`@earendil-works/pi-coding-agent` (types), `typebox` (schemas), `@earendil-works/pi-ai`
(`StringEnum`), `@earendil-works/pi-tui` ([[components/tui-components|TUI]]), node
built-ins, and npm deps (via a co-located `package.json`).

## Capabilities

- **Custom tools** the LLM can call, or overrides of built-ins ([[components/tools]]).
- **Event interception** — block/modify tool calls, inject context, customize compaction.
- **User interaction** via `ctx.ui` (`select`, `confirm`, `input`, `notify`, `custom`).
- **Custom UI** — footers, headers, widgets, status line, editors, overlays.
- **Commands/shortcuts/flags** — `/mycommand`, key bindings, CLI flags.
- **Providers** — `pi.registerProvider()` ([[workflows/add-custom-provider]]).
- **Session persistence** via `pi.appendEntry()` (out of LLM context).

## The event lifecycle

Events fire in a defined order (abbreviated):

```
project_trust → session_start → resources_discover
  ↓ (per user prompt)
input → before_agent_start → agent_start → message_start/update/end
  ↓ (per turn, repeats while tools are called)
  turn_start → context → before_provider_request → after_provider_response
    → tool_execution_start → tool_call → tool_execution_update → tool_result → tool_execution_end
  turn_end
agent_end
```

Plus lifecycle events for `session_before_switch`/`_fork`/`_compact`/`_tree`,
`session_shutdown`, `model_select`, `thinking_level_select`, and `user_bash`. Many are
**cancellable or transforming** — e.g. `tool_call` can return `{ block: true, reason }`;
`context` can modify messages; `before_provider_request` can replace the payload;
`input` can intercept/transform a prompt.

## ExtensionContext (`ctx`) and ExtensionAPI (`pi`)

- `ctx`: `ui`, `mode`, `hasUI`, `cwd`, `isProjectTrusted()`, `sessionManager`,
  `modelRegistry`/`model`, `signal`, `compact()`, `getSystemPrompt()`, `shutdown()`, and
  (in command contexts) session-replacement APIs `newSession`/`fork`/`navigateTree`/
  `switchSession`/`reload`.
- `pi`: `on`, `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`,
  `registerProvider`/`unregisterProvider`, `registerMessageRenderer`,
  `sendMessage`/`sendUserMessage` (see [[concepts/message-queue]]), `appendEntry`,
  `setSessionName`/`setLabel`, `getActiveTools`/`setActiveTools`, `setModel`,
  `get/setThinkingLevel`, and `pi.events` (inter-extension bus).

## Message injection vs. display

`pi.sendMessage`/`sendUserMessage` **always enter LLM context** (except
`deliverAs: "nextTurn"`). For *display-only* output use `ctx.ui.setWidget()` /
`ctx.ui.custom()`; for *out-of-context persistent* state use `pi.appendEntry()`.

## Long-lived resources

Do not start processes/sockets/watchers/timers in the factory (it may run without a
session). Start them in `session_start` or the triggering handler, and register an
idempotent `session_shutdown` handler to close them.

## See also

- Step-by-step build: [[workflows/write-an-extension]]
- Tool registration/override detail: [[components/tools]]
- Rendering custom UI: [[components/tui-components]]
- The full example set: [[references/examples-catalog]]
</content>
