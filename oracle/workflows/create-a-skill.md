---
title: Create a Skill
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md
tags: [pi, skills, workflow]
aliases: [creating a skill, authoring a skill, SKILL.md how-to]
summary: Make a directory with a SKILL.md carrying name + a specific description, add scripts/references/assets referenced by relative paths, place under a skills location, and invoke via /skill:name or let the agent auto-load.
relationships:
  - target: "[[components/skills-system]]"
    type: derived_from
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Create a Skill

Reference: [[components/skills-system]] for how loading and progressive disclosure work.

## 1. Make the directory

```
brave-search/
├── SKILL.md         # required
├── search.js        # helper scripts
└── references/      # detailed docs loaded on demand
```

## 2. Write SKILL.md

````markdown
---
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching
  documentation, facts, or any web content.
---

# Brave Search

## Setup
```bash
cd /path/to/brave-search && npm install
```

## Search
```bash
./search.js "query"           # basic
./search.js "query" --content # include page content
```
````

- `name`: 1–64 chars, lowercase letters/digits/hyphens, no leading/trailing/consecutive
  hyphens. Pi (unlike the standard) does **not** require it to match the directory.
- `description` is what triggers auto-loading — **be specific** about *what* and *when*.
  A vague description means the agent never loads the skill. Missing description = not
  loaded at all.
- Reference bundled files with **relative paths** (`references/REFERENCE.md`).

## 3. Place it

Global: `~/.pi/agent/skills/` or `~/.agents/skills/`. Project (after
[[concepts/project-trust|trust]]): `.pi/skills/` or `.agents/skills/`. Or point the
`skills` setting / a [[components/pi-packages|package]] at it, or load once with
`--skill <path>`.

## 4. Use it

The agent auto-loads when a task matches the description; force it with `/skill:name`.
Pass args: `/skill:pdf-tools extract` (appended as `User: extract`). Toggle
`/skill:name` commands with `enableSkillCommands`.

> Tip: pi can write skills for you — ask it to build one for your use case.

## See also

- Loading model, locations, validation: [[components/skills-system]]
- Lighter, code-free alternative: [[components/prompt-templates]]
- Package skills to share: [[workflows/create-a-pi-package]]
</content>
