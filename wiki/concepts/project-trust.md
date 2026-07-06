---
title: Project Trust & Security Boundary
category: concepts
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/security.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, config, concept]
aliases: [trust, defaultProjectTrust, security]
summary: Project trust is an input-loading guard (not a sandbox) that gates whether pi loads project-local settings/resources/extensions; pi has no built-in sandbox and runs with full user permissions, so real isolation comes from containers.
relationships:
  - target: "[[components/settings]]"
    type: related_to
  - target: "[[concepts/extensibility-philosophy]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Project Trust & Security Boundary

Pi is a local coding agent: it runs with the permissions of the user account that starts
it and treats every file that user can write as inside the same local trust boundary.
There is **no built-in sandbox**. Built-in [[components/tools|tools]] and
[[components/extension-system|extensions]] read/write files and run shell commands with
the pi process's permissions.

## What project trust actually is

Project trust is only an **input-loading guard** — it decides whether pi loads
project-local configuration and resources *before* you approve a directory. It is not a
runtime restriction on what the model can ask tools to do afterward.

A directory "requires trust" when pi finds any of:

- `.pi/settings.json`
- `.pi/extensions`, `.pi/skills`, `.pi/prompts`, or `.pi/themes`
- `.pi/SYSTEM.md` or `.pi/APPEND_SYSTEM.md`
- project `.agents/skills` in cwd or an ancestor

(A bare `.pi` directory does not count.)

Trusting a project lets pi load `.pi/settings.json`, `.pi` resources (extensions, skills,
prompts, themes, system-prompt files), install missing project packages, and run
project-local extensions.

## Resolution

- **Interactive, no saved decision:** follow `defaultProjectTrust` (default `"ask"`).
  Saved decisions live in `~/.pi/agent/trust.json` by canonical directory; the closest
  saved decision on the current-or-parent path wins before the global default.
- **Before trust resolves:** pi loads only context files, user/global extensions, and CLI
  `-e` extensions — these can handle the `project_trust` event and the first extension to
  return a yes/no decision owns it.
- **Non-interactive** (`-p`, `--mode json`, `--mode rpc`): no prompt; `"ask"`/`"never"`
  ignore project resources, `"always"` trusts them. `--approve`/`-a` and
  `--no-approve`/`-na` override per run. `pi update` never prompts.
- `AGENTS.md`/`CLAUDE.md` context files load regardless of trust (unless context loading
  is disabled).
- `/trust` saves a decision (incl. immediate parent) but does not reload the current
  session — restart to apply.

## Real isolation

Because trust is *not* a sandbox, prompt injection from repository files and untrusted
model output is expected local-agent risk. For untrusted repos or unattended automation,
run pi inside a container/VM/micro-VM (Gondolin, Docker, OpenShell — see the
containerization docs), mount only needed paths, avoid mounting host `~/.pi/agent`, and
pass minimal/short-lived credentials.

## See also

- `defaultProjectTrust` and the trust-related settings: [[components/settings]]
- `project_trust` event handling: [[components/extension-system]]
- Why the core is minimal and unsandboxed: [[concepts/extensibility-philosophy]]
