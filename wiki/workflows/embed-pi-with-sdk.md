---
title: Embed Pi with the SDK
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/sdk/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, sdk, workflow]
aliases: [SDK, createAgentSession, embed pi, AgentSession, AgentSessionRuntime]
summary: Import from @earendil-works/pi-coding-agent, build an AuthStorage + ModelRegistry, call createAgentSession() for a single session or createAgentSessionRuntime() for session replacement, subscribe to events, and prompt().
relationships:
  - target: "[[concepts/what-is-pi]]"
    type: related_to
  - target: "[[references/session-format]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: related_to
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Embed Pi with the SDK

The SDK gives programmatic access to pi's agent for custom UIs, pipelines, or embedding
in an app. It's bundled in the main package — no separate install. The SDK is one of pi's
four [[concepts/what-is-pi|run modes]].

## Minimal session

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager }
  from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage, modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

## `createAgentSession()` and `AgentSession`

`createAgentSession()` builds a single `AgentSession` using a `ResourceLoader`
(`DefaultResourceLoader` by default → standard discovery of extensions/skills/prompts/
themes/context files). Override `model`, `tools` (allowlist), `sessionManager`, etc.

`AgentSession` exposes `prompt()`, queueing (`steer`/`followUp` — see
[[concepts/message-queue]]), `subscribe()`, model control (`setModel`,
`cycleModel`, `setThinkingLevel`), `messages`, `isStreaming`, `navigateTree()`,
`compact()`, `abort()`, `dispose()`.

`PromptOptions`: `expandPromptTemplates`, `images`, `streamingBehavior`
(`"steer"`/`"followUp"`), `source`, `preflightResult`.

## Session replacement: `createAgentSessionRuntime()`

For new-session / resume / fork / clone / import (which rebuild cwd-bound state), use
`AgentSessionRuntime` — the same layer the interactive/print/RPC modes use. A runtime
factory closes over process-global inputs and recreates cwd-bound services per effective
cwd. **Gotchas after replacement:** `runtime.session` changes, so re-`subscribe()`; call
`runtime.session.bindExtensions(...)` again; failures throw (caller handles).

## The example ladder (`examples/sdk/`)

`01-minimal` → `02-custom-model` → `03-custom-prompt` → `04-skills` → `05-tools` →
`06-extensions` → `07-context-files` → `08-prompt-templates` → `09-api-keys-and-oauth` →
`10-settings` → `11-sessions` → `12-full-control` → `13-session-runtime`. Run with
`npx tsx examples/sdk/01-minimal.ts`.

> Non-Node integrations should use [[references/rpc-mode|RPC mode]] instead of the SDK.

## See also

- Session persistence details: [[references/session-format]]
- Process-integration alternative: [[references/rpc-mode]]
- In-process behavior hooks: [[components/extension-system]]
