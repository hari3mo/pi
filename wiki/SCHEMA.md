---
title: Oracle Schema
---

# Oracle — Schema & Conventions

> This is the **schema layer** for the `oracle` vault (an `llm-wiki`-pattern
> knowledge base). It governs how every page in this vault is structured. Read it
> before writing or updating any page. Downstream ingest tasks consume it verbatim.

## Purpose

Oracle is a persistent, compounding knowledge map of **everything related to the
`pi` coding agent**: what it is, why it is built the way it is, and how to use it —
across three sources of truth (the pi installation, the local harness config, and
accumulated lessons). It is a compiled artifact, not a chat log: knowledge is
distilled once and kept current, per the "compile, don't retrieve" principle.

Oracle answers **knowledge questions** — "what / why / how do I use pi". It does
**not** track volatile, file-level code structure of `~/.pi/agent`; that is the job
of the graphify `graph` tool (see *Graph-Tool Division of Labor* below).

## Three-Layer Provenance Model

Every page belongs to exactly one **source layer**, declared in frontmatter as
`source_layer:`. The layer determines where a page's truth comes from and — critically —
whether a `pi update` can invalidate it.

| `source_layer` | Distilled from | Invalidated by a `pi update`? |
|---|---|---|
| `upstream` | The pi installation itself — README/docs/examples under `/Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/` | **Yes** — carries `pi_version:`; see *Staleness Protocol* |
| `local` | The local harness config — `~/.pi/agent` (AGENTS.md doctrine, extensions, skills, scripts, schemas) | No |
| `learned` | Accumulated lessons — `/Users/harissaif/.pi/agent/heuristics/heuristics.jsonl` (the global heuristic store), `/Users/harissaif/.pi/agent/learning/events.jsonl` (capture-tap intake; distilled nightly per `learning/SCHEMA.md`), `/Users/harissaif/.pi/agent/graphify-out/reflections/LESSONS.md` | No |

`upstream` pages MUST carry `pi_version:` (the pi version they were distilled against).
`local` and `learned` pages MUST NOT carry `pi_version:` — their sources evolve
independently of the pinned pi release and are never invalidated by a version bump.

## Frontmatter Template (exact)

Every page carries this YAML block. Fields marked REQUIRED must be present.

```yaml
---
title: Page Title                    # REQUIRED
category: concepts                   # REQUIRED — concepts | components | workflows | references | synthesis | journal
source_layer: upstream               # REQUIRED — upstream | local | learned
pi_version: 0.80.3                   # REQUIRED iff source_layer == upstream; OMIT for local/learned
sources:                             # REQUIRED — absolute file paths this page was distilled from
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, extensions]               # REQUIRED — canonical tags per _meta/taxonomy.md, max 5
aliases: []                          # optional — alternate names
summary: One line, <=200 chars, so a reader or skill can preview without opening.  # REQUIRED
relationships:                       # optional — typed edges; omit if none
  - target: "[[concepts/delegation-gate]]"
    type: related_to                 # extends | implements | contradicts | derived_from | uses | replaces | related_to
base_confidence: 0.75                # REQUIRED — [0.0,1.0]; see llm-wiki confidence formula
lifecycle: draft                     # REQUIRED — draft | reviewed | verified | disputed | archived
lifecycle_changed: 2026-07-04        # REQUIRED — ISO date of last state transition
tier: supporting                     # REQUIRED — core | supporting | peripheral (new pages default supporting)
created: 2026-07-04T00:00:00Z        # REQUIRED
updated: 2026-07-04T00:00:00Z        # REQUIRED
---
```

**Infrastructure-file exemption.** Vault infrastructure files are exempt from this page
frontmatter contract: `index.md`, `log.md`, `hot.md`, `SCHEMA.md`, and everything under
`_meta/`. They are catalogs/scaffolding, not knowledge pages — whatever minimal
frontmatter they carry (e.g. a bare `title:`) is fine.

Inline provenance markers apply as in `llm-wiki`: default = extracted, `^[inferred]`
for synthesized claims, `^[ambiguous]` for contested/uncertain ones.

## Staleness Protocol (upstream pages only)

A `pi update` changes the installed version. **Only `source_layer: upstream` pages
become suspect** — `local` and `learned` pages are untouched.

1. **Detect.** A page is *stale* when its `pi_version:` differs from the live version
   (`pi --version`). A one-line sweep finds all suspects:
   ```bash
   CUR=$(pi --version)
   grep -rl '^source_layer: upstream' <vault> | while read f; do
     v=$(grep -m1 '^pi_version:' "$f" | awk '{print $2}')
     [ "$v" != "$CUR" ] && echo "STALE $f (page=$v cur=$CUR)"
   done
   ```
2. **Re-verify on next touch.** When a stale upstream page is next read or updated,
   re-verify its claims against the current docs/examples under the pi install path
   before trusting or extending it. Claims that no longer hold get corrected; claims
   that can't be re-verified get an `^[ambiguous]` marker.
3. **Re-stamp.** After re-verification, set `pi_version:` to the current version and
   bump `updated:`. Optionally record `lifecycle_reason: "re-verified against pi <ver>"`.
4. **Never cascade.** A version bump never touches `local`/`learned` pages and never
   auto-demotes lifecycle — staleness is a computed overlay, not a lifecycle state.

## Category Taxonomy

Six categories. Pick the single best fit; when a page spans layers of abstraction,
prefer the more concrete category.

| Category | One-line definition |
|---|---|
| `concepts/` | Pi ideas & mental models — the *why* (delegation gate, provenance layering, message-queue semantics, orchestration doctrine). |
| `components/` | Pi's concrete parts — the *what* (extensions, skills, hooks, tools, subagents, providers, TUI, prompt templates). |
| `workflows/` | How-to procedures — the *how* (add a model, write an extension, orchestrate a delegation, install a skill). |
| `references/` | Distilled summary of one specific source file (one page ≈ one README/doc/example). |
| `synthesis/` | Cross-cutting analysis spanning multiple sources; **filed-back query answers land here** (see *Query-Compounding*). |
| `journal/` | Timestamped observations & session logs (`journal/YYYY-MM-DD.md`). |

## Wikilink & Tag Conventions

- **Links:** `wikilink` format (`OBSIDIAN_LINK_FORMAT=wikilink`) — links are wrapped in
  double square brackets, e.g. `category/page` or `category/page|display`. Every page links to its neighbours; `references/` pages
  link up to the `concepts/`/`components/` they inform, and vice-versa. Typed edges go in
  the `relationships:` block (types listed in the template above).
- **Tags:** canonical vocabulary lives in `_meta/taxonomy.md` — **read it before tagging**.
  Max 5 tags/page: 1–2 domain tags + 1 type tag + optional descriptors, lowercase-hyphenated,
  canonical forms only (no aliases). `visibility/*` tags are reserved and don't count toward
  the limit.

## Query-Compounding Rule

Per the `llm-wiki` paradigm, the wiki compounds: a good answer is captured, not
discarded. When a `graph`/`wiki-query` answer synthesizes something not already on a
page, **file it back as a `synthesis/` page** (or fold it into the relevant existing
page), with `sources:` pointing at the pages/files it drew from and the appropriate
`source_layer:`. The next identical question is then answered by a read, not a
re-derivation.

## Graph-Tool Division of Labor

| Question shape | Answer with |
|---|---|
| "What is X / why does pi do Y / how do I use Z" (durable knowledge) | **Oracle** (this vault) |
| "Where is symbol S defined / what references file F / current call graph of `~/.pi/agent`" (live code structure) | **graphify `graph` tool** (query / explain / path) |

Oracle pages MUST NOT duplicate volatile file-level structure (line numbers, current
import graphs, symbol locations) — that drifts on every commit and belongs to the
`graph` tool. When a page needs to point at code, name the file/concept and defer the
live structure to `graph`.

## Parallel Ingest Fragment Protocol

Multiple ingest passes run concurrently (one per source layer). To avoid write races on
the shared root files, **parallel ingests never write `index.md` or `log.md` directly.**
Instead each pass:

1. Writes its category pages under the normal category directories.
2. Appends its index entries to `_fragments/index-<layer>.md`
   (`<layer>` ∈ `upstream` | `local` | `learned` — one file per layer, so concurrent
   writers never touch the same file). Each line uses the index bullet format:
   `- ` followed by a double-square-bracketed `category/page` link, then
   ` — summary ( #tag #tag)` (note the space after `(`).
3. Appends its log entries to `_fragments/log-<layer>.md`, each a
   `## [YYYY-MM-DD] OP | Title` block (see *Log Format*).

A later **maintenance/integration pass** (single-writer):

1. Merges every `_fragments/index-*.md` into `index.md` under the matching provenance-layer
   section (## Upstream / ## Local / ## Learned).
2. Appends every `_fragments/log-*.md` block into `log.md` in date order.
3. Deletes the merged fragment files.

## Special Files

- `index.md` — content catalog, **organized by provenance layer** (## Upstream / ## Local /
  ## Learned), one bullet per page. Rebuilt by the integration pass from fragments.
- `log.md` — append-only chronological record. Format below.
- `hot.md` — ~500-word rolling snapshot of recent activity (optional; maintained by
  `daily-update`/ingest skills).
- `_meta/taxonomy.md` — canonical tag vocabulary (read before tagging).
- `SCHEMA.md` — this file.

### Log Format

Grep-able heading per operation, newest appended at the end:

```markdown
## [2026-07-04] INGEST | Distilled pi extensions API
- source_layer: upstream
- pages_created: 3, pages_updated: 1
- sources: /Users/.../docs/extensions.md
```

The `## [YYYY-MM-DD] OP | Title` first line is the grep anchor (`OP` ∈ INIT | INGEST |
QUERY | MERGE | LINT | REVERIFY | ARCHIVE).
