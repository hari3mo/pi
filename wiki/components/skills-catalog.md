---
title: Skills Catalog
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/skills/
  - /Users/harissaif/.pi/agent/git/github.com/DietrichGebert/ponytail/skills/
  - /Users/harissaif/.agents/skills/
tags: [pi, skills, component]
aliases: ["Skill Families", "Installed Skills"]
summary: A catalog of the skill families available to this harness — the LLM-wiki family, the history-ingest family, the ponytail lazy-coding family, and general workflow skills — with what each family does.
relationships:
  - target: "[[concepts/orchestration-doctrine]]"
    type: related_to
  - target: "[[concepts/knowledge-graph-integration]]"
    type: related_to
base_confidence: 0.8
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Skills Catalog

Skills are progressive-disclosure instruction packs (`SKILL.md` + resources) the
agent loads on demand. This catalogs the **families** available to the harness by
what they do — not a page per skill. Skills live in three roots:
`~/.pi/agent/skills` (wiki + ingest + meta), a vendored ponytail repo, and
`~/.agents/skills` (general workflow).

## LLM-Wiki family (the largest)

An Obsidian-based knowledge distillation system built on Karpathy's "compile,
don't retrieve" pattern (the same paradigm this `oracle` vault follows).

- **Theory & setup:** `llm-wiki` (the foundational three-layer pattern),
  `wiki-setup`, `wiki-switch` (vault profiles), `tag-taxonomy`.
- **Ingest:** `wiki-ingest` (any doc/text/URL), `wiki-research` (autonomous
  web research → filed pages).
- **Query & synthesis:** `wiki-query`, `wiki-synthesize`, `wiki-context-pack`,
  `wiki-dashboard`, `memory-bridge` (cross-tool knowledge diff).
- **Maintenance ("dream cycle"):** `wiki-lint`, `cross-linker`, `wiki-dedup`,
  `wiki-status`, `wiki-digest`, `wiki-rebuild`, `daily-update`, `graph-colorize`.
- **Capture & flow:** `wiki-capture`, `wiki-update`, `wiki-stage-commit`,
  `wiki-export`, `wiki-import`, `vault-skill-factory`, `impl-validator`.

## History-ingest family

Query-driven and bulk mining of past AI-agent conversations into the wiki:
`claude-`, `codex-`, `copilot-`, `hermes-`, `openclaw-`, `pi-history-ingest`, the
`wiki-history-ingest` router, and `wiki-agent` (targeted cross-tool pull).

## Meta / tooling

- **`graphify`** — turns any input into a persistent knowledge graph with god
  nodes, community detection, and query/path/explain tools. The engine behind
  [[concepts/knowledge-graph-integration]].
- **`skill-creator` / `write-a-skill`** — create, edit, eval, and benchmark
  skills.

## Ponytail family (lazy-coding)

A vendored family enforcing minimal, YAGNI-first solutions:

- **`ponytail`** — the active mode (levels lite/full/ultra): the "does this need
  to exist / stdlib / native / one line" ladder.
- **`ponytail-review`** / **`ponytail-audit`** — over-engineering review of a
  diff / whole repo.
- **`ponytail-debt`** — harvest deferred `ponytail:` shortcut comments into a
  ledger.
- **`ponytail-gain`** / **`ponytail-help`** — impact scoreboard / command card.

## General workflow skills

Domain and process helpers in `~/.agents/skills`: `diagnose` (bug/perf loop),
`tdd`, `prototype`, `improve-codebase-architecture`, `grill-me` /
`grill-with-docs` (plan stress-testing), `to-prd` / `to-issues` / `triage`
(planning→tracker), `handoff`, `zoom-out`, `frontend-design`,
`data-visualization`, `find-skills`, `caveman` (terse-prose mode, pairs with
ponytail), `soultrace`.

*(Skill trigger text and internals evolve; this catalog captures the durable
family map. For exact current skill files, list the skill roots directly.)*
