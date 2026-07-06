---
title: Pi Packages
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, config, component]
aliases: [packages, pi install, package manifest, pi-package]
summary: Pi packages bundle extensions/skills/prompts/themes for sharing via npm/git/local, declared in package.json's pi key or auto-discovered from convention dirs; pinned git refs are skipped by updates.
relationships:
  - target: "[[workflows/create-a-pi-package]]"
    type: related_to
  - target: "[[components/extension-system]]"
    type: related_to
  - target: "[[components/settings]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Pi Packages

Pi packages bundle [[components/extension-system|extensions]],
[[components/skills-system|skills]], [[components/prompt-templates|prompt templates]], and
[[components/themes|themes]] so you can share a whole workflow via npm or git. This is the
distribution layer of pi's [[concepts/extensibility-philosophy|extensibility philosophy]].

> **Security:** packages run with full system access. Extensions execute arbitrary code
> and skills can instruct the model to run executables. Review source before installing.

## Install & manage

```bash
pi install npm:@foo/bar@1.0.0        # pinned version
pi install git:github.com/user/repo@v1
pi install ./relative/path           # local dir or file
pi remove npm:@foo/bar
pi list
pi update            # pi CLI only
pi update --all      # pi + packages + reconcile pinned git refs
pi update --extensions   # packages only
pi -e npm:@foo/bar   # try without installing (temp dir, one run)
```

Defaults write to user settings (`~/.pi/agent/settings.json`); `-l` writes to project
settings (`.pi/settings.json`), shareable with a team (pi installs missing project
packages on startup after [[concepts/project-trust|trust]]).

## Sources

- **npm:** `npm:@scope/pkg[@version]` → `~/.pi/agent/npm/` (user) or `.pi/npm/` (project).
  Versioned specs are pinned/skipped by updates. `npmCommand` pins the npm wrapper.
- **git:** `git:github.com/user/repo@ref`, `git@host:path`, `ssh://…` → `~/.pi/agent/git/
  <host>/<path>`. Refs are pinned tags/commits (updates reconcile but don't move them;
  use `pi install git:...@new-ref` to move). Git packages run `npm install --omit=dev`.
- **local:** absolute/relative paths added without copying (relative resolved against the
  settings file).

## Creating a package

Add a `pi` manifest to `package.json` and the `pi-package` keyword:

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./extensions"], "skills": ["./skills"],
          "prompts": ["./prompts"], "themes": ["./themes"] }
}
```

Paths support globs and `!exclusions`. Without a `pi` manifest, pi auto-discovers from
convention dirs: `extensions/` (`.ts`/`.js`), `skills/` (SKILL.md dirs + top-level `.md`),
`prompts/` (`.md`), `themes/` (`.json`). Optional `video`/`image` fields feed the gallery.

## Dependencies

Runtime deps → `dependencies` (installed automatically). Pi-bundled cores
(`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox`) →
`peerDependencies` with `"*"`, not bundled. Other pi packages → `dependencies` +
`bundledDependencies`, referenced through `node_modules/` paths (separate module roots,
no collisions).

## Filtering, enable/disable, scope

Object form in `packages` settings filters what loads (`extensions`/`skills`/`prompts`/
`themes` arrays; `[]` = none, omit = all, `!pattern`/`+path`/`-path`). `pi config`
enables/disables individual resources. If a package appears in both global and project
settings, **project wins** (identity: npm name / git URL sans ref / resolved local path).

## See also

- Authoring guide: [[workflows/create-a-pi-package]]
- The `packages` settings key: [[components/settings]]
