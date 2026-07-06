---
title: Prompt Templates
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/prompt-templates.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, prompts, component]
aliases: [prompt templates, slash templates, argument-hint]
summary: Prompt templates are Markdown files expanded by typing /name; they support positional args ($1, $@, ${1:-default}, ${@:N:L}), a description, and an argument-hint shown in autocomplete.
relationships:
  - target: "[[components/skills-system]]"
    type: related_to
  - target: "[[concepts/what-is-pi]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Prompt Templates

Prompt templates are reusable Markdown snippets that expand into full prompts. Type
`/name` in the editor (filename without `.md`) to invoke one. They are the lightest form
of customization — no code, unlike [[components/extension-system|extensions]], and no
on-demand loading model, unlike [[components/skills-system|skills]].

## Format

```markdown
---
description: Review staged git changes
argument-hint: "<PR-URL>"
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
```

- Filename → command name (`review.md` → `/review`).
- `description` optional; if absent, the first non-empty line is used.
- `argument-hint` optional; shown before the description in autocomplete. Use
  `<angle brackets>` for required args, `[square brackets]` for optional.

## Arguments

| Syntax | Meaning |
|---|---|
| `$1`, `$2`, … | Positional args |
| `$@` or `$ARGUMENTS` | All args, joined |
| `${1:-default}` | Arg 1 if present/non-empty, else `default` |
| `${@:N}` | Args from the Nth position (1-indexed) |
| `${@:N:L}` | `L` args starting at N |

Usage: `/component Button "onClick handler" "disabled support"`.

## Locations & loading

Global `~/.pi/agent/prompts/*.md`; project `.pi/prompts/*.md` (after
[[concepts/project-trust|trust]]); packages; the `prompts` settings array; CLI
`--prompt-template <path>`. Disable with `--no-prompt-templates`. Discovery in
`prompts/` is **non-recursive** — subdirectory templates must be added explicitly via
settings or a package manifest.

## See also

- On-demand capability packages: [[components/skills-system]]
- Bundling templates to share: [[components/pi-packages]]
- SDK template control: [[workflows/embed-pi-with-sdk]]
