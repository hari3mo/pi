---
title: Write an Extension
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/README.md
tags: [pi, extensions, workflow]
aliases: [writing an extension, extension hello world]
summary: Create a TypeScript file exporting a default factory that receives ExtensionAPI, drop it in ~/.pi/agent/extensions/ (or test with pi -e), register tools/commands and subscribe to events, then /reload.
relationships:
  - target: "[[components/extension-system]]"
    type: derived_from
  - target: "[[components/tools]]"
    type: uses
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Write an Extension

Reference: [[components/extension-system]] for the full API and event catalog.

## 1. Create the file

```typescript
// ~/.pi/agent/extensions/my-extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({ name: Type.String({ description: "Name to greet" }) }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: `Hello, ${params.name}!` }], details: {} };
    },
  });

  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => ctx.ui.notify(`Hello ${args || "world"}!`, "info"),
  });
}
```

## 2. Test it

```bash
pi -e ./my-extension.ts
```

`pi -e` is for quick tests. For auto-discovery + `/reload` hot-reload, put it in
`~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local, needs
[[concepts/project-trust|trust]]).

> Verifying load: only loading through pi uses pi's module resolution. A standalone
> `npx jiti ext.ts` **fails** for any *value* import from the pi packages (ESM-only,
> `import`-condition-only exports). For a syntax check, bundle with those packages marked
> `--external` via esbuild (see the extensions doc).

## 3. Iterate

Edit the file, run `/reload` to pick up changes without restarting the session.

## Patterns to reach for

- **Custom tools** with typebox params + streaming `onUpdate` — [[components/tools]]. Use
  `StringEnum` (from `@earendil-works/pi-ai`), not `Type.Union`, for string choices.
- **Persist state** in the tool result `details` (survives forking); reconstruct on
  `session_start` from `ctx.sessionManager.getBranch()`.
- **Custom UI** via `ctx.ui.custom()` + [[components/tui-components|pi-tui]].
- **Async factory** for one-time init (e.g. fetch a remote model list before
  `pi.registerProvider()`) — pi awaits it before startup.
- **Background resources:** start them in `session_start`, close them in
  `session_shutdown` (idempotent) — never in the factory.
- **npm deps:** add a co-located `package.json`, `npm install`, import from
  `node_modules/`.

## See also

- Full ExtensionAPI + events: [[components/extension-system]]
- 70+ working extensions: [[references/examples-catalog]]
- Ship it as a package: [[workflows/create-a-pi-package]]
