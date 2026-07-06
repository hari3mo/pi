---
title: Skills System
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, skills, component]
aliases: [skills, SKILL.md, progressive disclosure, Agent Skills]
summary: Skills are on-demand capability packages (a SKILL.md dir with name+description frontmatter) following the Agent Skills standard; only descriptions sit in context, full instructions load when the task matches or via /skill:name.
relationships:
  - target: "[[workflows/create-a-skill]]"
    type: related_to
  - target: "[[components/prompt-templates]]"
    type: related_to
  - target: "[[concepts/project-trust]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Skills System

Skills are self-contained capability packages the agent loads **on demand**: specialized
workflows, setup steps, helper scripts, and reference docs for a specific task. Pi
implements the [Agent Skills standard](https://agentskills.io/specification), warning on
most violations but staying lenient (notably, pi does **not** require a skill's `name` to
match its parent directory, unlike the standard — better for skill dirs shared across
harnesses).

## Progressive disclosure

1. At startup pi scans skill locations and extracts each skill's `name` + `description`.
2. Those descriptions (only) go into the system prompt in XML form — always in context.
3. When a task matches, the agent `read`s the full `SKILL.md` (models don't always do
   this; force it with prompting or `/skill:name`).
4. The agent follows the instructions, using relative paths to scripts/assets.

So descriptions are always present; full instructions load only when needed. The
**description is what triggers loading** — be specific ("Extracts text/tables from PDFs…
Use when working with PDF documents", not "Helps with PDFs").

## Structure

```
my-skill/
├── SKILL.md         # required: frontmatter + instructions
├── scripts/         # helper scripts
├── references/      # detailed docs loaded on demand
└── assets/
```

`SKILL.md` frontmatter: `name` (required, 1–64 chars, lowercase/digits/hyphens, no
leading/trailing/consecutive hyphens), `description` (required, ≤1024 chars). Optional:
`license`, `compatibility`, `metadata`, `allowed-tools` (experimental),
`disable-model-invocation` (hide from prompt; only `/skill:name` loads it).

## Locations

Global: `~/.pi/agent/skills/`, `~/.agents/skills/`. Project (after
[[concepts/project-trust|trust]]): `.pi/skills/`, `.agents/skills/` (cwd up to repo
root). Also packages, the `skills` settings array, and CLI `--skill <path>` (additive
even with `--no-skills`). Discovery: root `.md` files count in `~/.pi/agent/skills/` and
`.pi/skills/` but are ignored in `.agents/skills/`; `SKILL.md` directories are found
recursively everywhere.

You can point pi at other harnesses' skills via the `skills` setting, e.g.
`["~/.claude/skills", "~/.codex/skills"]`.

## Commands

Skills register as `/skill:name` (`enableSkillCommands`, default `true`). Args after the
command are appended as `User: <args>`, e.g. `/skill:pdf-tools extract`.

## Validation

Most issues warn but still load; unknown frontmatter fields are ignored. **Missing
`description` = not loaded.** Name collisions warn and keep the first found.

## See also

- Authoring guide: [[workflows/create-a-skill]]
- Slash-command siblings: [[components/prompt-templates]]
- Bundling skills to share: [[components/pi-packages]]
