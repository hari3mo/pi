---
title: Tag Taxonomy
---

# Oracle — Tag Taxonomy

Canonical tag vocabulary for the oracle vault. **Read this before tagging any page.**
Rules: max 5 tags/page (1–2 domain + 1 type + optional descriptors), lowercase-hyphenated,
canonical forms only. `visibility/*` tags are reserved and do not count toward the limit.

## Domain Tags (what subject area)

| Canonical | Use for | Aliases → canonical |
|---|---|---|
| `pi` | Anything about the pi coding agent (nearly every page) | `pi-agent`, `pi-coding-agent` → `pi` |
| `orchestration` | Delegation, subagents, routing, roles, dispatch | `delegation`, `subagents` → `orchestration` |
| `extensions` | Pi extension API, event hooks, custom tools | `extension`, `hooks` → `extensions` |
| `skills` | Skills system, SKILL.md, progressive disclosure | `skill` → `skills` |
| `tui` | Terminal UI, keybindings, layout, themes | `terminal-ui`, `keybindings` → `tui` |
| `providers` | Model providers, adding models, custom providers | `models`, `provider` → `providers` |
| `graph` | Graphify knowledge graph, graph tool | `graphify` → `graph` |
| `config` | Harness/vault configuration, schemas, validation | `configuration` → `config` |
| `sdk` | Pi SDK, programmatic integration | — |
| `prompts` | Prompt templates, system prompt | `prompt-templates` → `prompts` |

## Type Tags (what kind of page)

| Canonical | Use for |
|---|---|
| `concept` | A mental model / idea page (`concepts/`) |
| `component` | A concrete pi part (`components/`) |
| `workflow` | A how-to procedure (`workflows/`) |
| `reference` | A single-source summary (`references/`) |
| `synthesis` | Cross-cutting analysis / filed-back query answer (`synthesis/`) |
| `journal` | A timestamped log entry (`journal/`) |

## Provenance note

Provenance is carried by the `source_layer:` frontmatter field (`upstream` | `local` |
`learned`), **not** by tags — do not create `upstream`/`local`/`learned` tags.

## Reserved System Tags

`visibility/public` (default, omit) · `visibility/internal` · `visibility/pii`.
One per page, excluded from the 5-tag limit, never alias-mapped.
