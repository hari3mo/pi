---
title: What Is Pi
category: concepts
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/index.md
tags: [pi, concept]
aliases: [pi coding agent, pi harness]
summary: Pi is a minimal terminal coding harness with a small core (four tools) that you extend via TypeScript instead of forking, and that runs in interactive, print/JSON, RPC, and SDK modes.
relationships:
  - target: "[[concepts/extensibility-philosophy]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: uses
  - target: "[[references/cli-reference]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: core
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# What Is Pi

Pi (`@earendil-works/pi-coding-agent`) is a **minimal terminal coding harness**. Its
guiding line is *"adapt pi to your workflows, not the other way around, without having
to fork and modify pi internals."* The core stays small; everything else is added
through TypeScript [[components/extension-system|extensions]],
[[components/skills-system|skills]], [[components/prompt-templates|prompt templates]],
and [[components/themes|themes]], which can be bundled and shared as
[[components/pi-packages|pi packages]].

## The default toolset

Out of the box pi gives the model four tools — `read`, `write`, `edit`, and `bash`
(plus `grep`, `find`, `ls` available as built-ins). See [[components/tools]] for the
full built-in set, allowlisting, and how extensions add or override tools.

## Four run modes

Pi is the same agent exposed through four surfaces:

| Mode | Entry | Use |
|---|---|---|
| **Interactive** | `pi` | The TUI — editor, messages, footer, extension UI |
| **Print / JSON** | `pi -p` / `pi --mode json` | One-shot response, or structured event stream |
| **RPC** | `pi --mode rpc` | Line-delimited JSONL over stdin/stdout for process integration ([[references/rpc-mode]]) |
| **SDK** | `import ... createAgentSession()` | Embed the agent in a Node.js app ([[workflows/embed-pi-with-sdk]]) |

## Deliberately minimal

Pi *ships powerful defaults but skips* features other tools bake in — sub-agents, plan
mode, MCP, permission popups, built-in to-dos, background bash. This is a design stance,
not an omission: you build those with extensions or install a package. The rationale is
captured in [[concepts/extensibility-philosophy]].

## Where things live

- Config directory: `~/.pi/agent` (override with `PI_CODING_AGENT_DIR`).
- [[concepts/session-model|Sessions]] auto-save to `~/.pi/agent/sessions/` as JSONL trees.
- `AGENTS.md`/`CLAUDE.md` context files load from `~/.pi/agent`, ancestors, and cwd.
- [[components/settings|Settings]] layer global (`~/.pi/agent/settings.json`) under project (`.pi/settings.json`).
- Loading project-local resources first requires [[concepts/project-trust|project trust]].

## Interactive interface at a glance

Top to bottom: startup header (shortcuts, loaded AGENTS.md, templates, skills,
extensions) → messages (yours, assistant, tool calls/results, extension UI) → editor
(border color shows thinking level) → footer (cwd, session name, token/cache usage,
cost, context usage, model). Commands are typed with `/`; the full command and flag
surface is catalogued in [[references/cli-reference]].

## See also

- Extend, don't fork: [[concepts/extensibility-philosophy]]
- Session persistence and branching: [[concepts/session-model]]
- Provider/model configuration: [[components/providers-and-models]]
</content>
