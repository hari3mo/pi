---
title: Extensibility Philosophy
category: concepts
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, extensions, concept]
aliases: [pi philosophy, minimal core, no MCP, no subagents]
summary: Pi keeps its core minimal and pushes everything else to extensions/skills/packages on purpose — no MCP, no sub-agents, no plan mode, no permission popups, no built-in to-dos, no background bash.
relationships:
  - target: "[[concepts/what-is-pi]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: implements
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Extensibility Philosophy

Pi is *aggressively extensible so it doesn't have to dictate your workflow*. Features
that other tools bake into the core can instead be built with
[[components/extension-system|extensions]], [[components/skills-system|skills]], or
installed from third-party [[components/pi-packages|pi packages]]. Keeping the core
minimal is the whole point.

## The deliberate omissions

Each of these is a design decision with a stated escape hatch:

| Not built in | Do this instead |
|---|---|
| **MCP** | Build CLI tools with READMEs (as [[components/skills-system|skills]]), or write an extension that adds MCP support |
| **Sub-agents** | Spawn pi instances via tmux, build your own with extensions, or install a package (see the `subagent/` example) |
| **Permission popups** | Run in a container, or build a confirmation flow with extensions matched to your environment |
| **Plan mode** | Write plans to files, or build it with extensions (see the `plan-mode/` example) |
| **Built-in to-dos** | "They confuse models." Use a `TODO.md`, or build your own (see the `todo.ts` example) |
| **Background bash** | Use tmux — full observability, direct interaction |

## Why this matters

The consequence is that most capability questions about pi resolve to *"which extension
or package provides this?"* rather than *"does the core support this?"*. The
[[references/examples-catalog|examples catalog]] demonstrates that even large features
(a full DOOM overlay, sub-agents, plan mode, sandboxing) fit inside the extension model.

This stance also shapes the security posture: because extensions and skills run with
full user permissions, [[concepts/project-trust|project trust]] gates *loading* untrusted
project resources, and real isolation is delegated to the OS/containers rather than an
in-process sandbox.

## See also

- The subsystem that makes this possible: [[components/extension-system]]
- Bundling and sharing your workflow: [[components/pi-packages]]
- Local orchestration doctrine built on top of this: [[concepts/orchestration-doctrine]]
</content>
