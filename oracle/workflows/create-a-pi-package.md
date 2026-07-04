---
title: Create a Pi Package
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md
tags: [pi, config, workflow]
aliases: [create a package, bundle extensions, pi-package manifest]
summary: Add a pi manifest to package.json (or use convention dirs), tag with pi-package, list resources with globs, put pi cores in peerDependencies, then share via npm or git and install with pi install.
relationships:
  - target: "[[components/pi-packages]]"
    type: derived_from
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Create a Pi Package

Reference: [[components/pi-packages]] for sources, filtering, scope, and dependency
rules. A package bundles [[components/extension-system|extensions]],
[[components/skills-system|skills]], [[components/prompt-templates|prompts]], and
[[components/themes|themes]] to share via npm or git.

## 1. Manifest

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Paths are relative to the package root and support globs + `!exclusions`. The
`pi-package` keyword makes it discoverable (and gallery-listable; add `video`/`image`
for a preview). **Without** a `pi` manifest, pi auto-discovers from convention dirs:
`extensions/` (`.ts`/`.js`), `skills/` (SKILL.md dirs + top-level `.md`), `prompts/`
(`.md`), `themes/` (`.json`).

## 2. Dependencies

- Runtime deps → `dependencies` (pi runs `npm install` on install).
- Pi cores you import (`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`,
  `pi-tui`, `typebox`) → `peerDependencies` with `"*"`, **not** bundled.
- Other pi packages → `dependencies` **and** `bundledDependencies`, referenced through
  `node_modules/...` paths in the manifest.

## 3. Share & install

Publish to npm or push to git, then:

```bash
pi install npm:@you/my-pi-package
pi install git:github.com/you/repo@v1
pi install ./my-pi-package     # local test
pi -e npm:@you/my-pi-package   # try for one run, no install
```

Use `-l` for project-local installs (`.pi/`), committable so teammates auto-install on
[[concepts/project-trust|trust]]. Consumers can narrow what loads with the object form in
the `packages` setting and toggle resources with `pi config`.

## See also

- Full package system (sources, filtering, scope/dedup): [[components/pi-packages]]
- Build the resources first: [[workflows/write-an-extension]] · [[workflows/create-a-skill]]
</content>
