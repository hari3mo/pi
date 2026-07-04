---
title: Tools — Built-in & Custom
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, extensions, component]
aliases: [built-in tools, custom tools, registerTool, tool override]
summary: Pi ships read/write/edit/bash/grep/find/ls; extensions add tools via pi.registerTool (typebox params, streaming execute, custom rendering) and can override built-ins; CLI flags allowlist/exclude any tool.
relationships:
  - target: "[[components/extension-system]]"
    type: derived_from
  - target: "[[references/cli-reference]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Tools — Built-in & Custom

Tools are the actions the LLM can invoke. Pi separates **built-in** tools (shipped) from
**custom** tools (added by [[components/extension-system|extensions]]), but they share
one namespace and one allowlist.

## Built-in tools

Default model tools: `read`, `write`, `edit`, `bash`. Additional built-ins available:
`grep`, `find`, `ls`.

Control which load via CLI flags (see [[references/cli-reference]]):

| Flag | Effect |
|---|---|
| `--tools <list>` / `-t` | Allowlist specific tool names (built-in + extension + custom) |
| `--exclude-tools <list>` / `-xt` | Disable specific tool names |
| `--no-builtin-tools` / `-nbt` | Disable built-ins, keep extension/custom tools |
| `--no-tools` / `-nt` | Disable all tools |

Example read-only session: `pi --tools read,grep,find,ls -p "Review the code"`.

## Custom tools (`pi.registerTool`)

A custom tool declares typebox `parameters` and an async `execute`. It can be registered
at load time *or* at runtime (inside `session_start`, a command, or an event handler) —
new tools refresh immediately and become callable without `/reload`.

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "One-line entry in Available tools",           // optional
  promptGuidelines: ["Use my_tool when ..."],                    // optional, name the tool
  parameters: Type.Object({ action: StringEnum(["list","add"] as const) }),
  prepareArguments(args) { return args; },                        // optional compat shim
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] }); // stream progress
    return { content: [{ type: "text", text: "Done" }], details: {} };
  },
  renderCall(args, theme, context) { /* optional */ },
  renderResult(result, options, theme, context) { /* optional */ },
});
```

Key rules:

- **Use `StringEnum` (from `pi-ai`), not `Type.Union`**, for string-choice params — the
  latter is not Google-API compatible.
- Persist state in the result `details` so it survives forking; reconstruct on
  `session_start` by scanning `ctx.sessionManager.getBranch()`.
- `promptGuidelines` bullets are appended flat to Guidelines with no tool prefix — each
  bullet must name its tool ("Use my_tool when…"), never "this tool".
- A tool returning `terminate: true` lets the agent end on the tool call (structured
  output). `executionMode: "sequential"` prevents races on shared state.

## Overriding built-ins

Re-register a built-in name to wrap it (add logging, access control, remote execution).
Examples: `tool-override.ts` (logging on `read`), `ssh.ts` (delegate all tools over
SSH), `truncated-tool.ts` (ripgrep with 50KB/2000-line truncation),
`built-in-tool-renderer.ts` / `minimal-mode.ts` (custom rendering only). See
[[references/examples-catalog]].

## Rendering

`renderCall`/`renderResult` control how a tool appears in the TUI using
[[components/tui-components|pi-tui]] components and theme colors; keybinding hints show
via `keyHint()`. A fallback renderer applies when none is provided.

## See also

- Registration API in context: [[components/extension-system]]
- Read-only and tool-scoping flags: [[references/cli-reference]]
- SDK tool allowlists: [[workflows/embed-pi-with-sdk]]
</content>
