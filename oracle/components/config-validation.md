---
title: Config Validation & Pipeline Audit
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/scripts/validate-config.py
  - /Users/harissaif/.pi/agent/scripts/audit-pipelines.py
  - /Users/harissaif/.pi/agent/extensions/self-audit.ts
  - /Users/harissaif/.pi/agent/schema/manifest.json
tags: [pi, config, component]
aliases: ["validate-config.py", "audit-pipelines.py", "self-audit.ts"]
summary: The concrete self-audit machinery — a manifest-driven static validator, a pipeline-dynamics auditor, and the self-audit extension that runs both at session start and injects failures as prompts.
relationships:
  - target: "[[concepts/self-audit-loop]]"
    type: implements
  - target: "[[concepts/concurrency-model]]"
    type: related_to
  - target: "[[components/lead-config-extension]]"
    type: related_to
base_confidence: 0.82
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Config Validation & Pipeline Audit

The concrete machinery of the [[concepts/self-audit-loop]] — three parts that
together check the harness's health every session and gate every config snapshot.

## `scripts/validate-config.py` (static config)

**Manifest-driven**: `schema/manifest.json` maps each config artifact to its
JSON Schema and format (`json` or per-line `jsonl`, `required` true/false). To
bring a new config file under audit you add a manifest entry — no validator code
change. Its checks: per-target schema conformance, heuristics hygiene (scope +
`maxEntries`), git hygiene, symlink sanity, installed-integrity, and layout
(the expected/known directory set). Output is `ERROR`/`WARN`/`OK` lines.

Durable rule (from AGENTS.md): **a NEW machine-readable config artifact gets a
malleable JSON Schema** in `schema/` (known keys typed, `additionalProperties:
true`) registered in `manifest.json`.

## `scripts/audit-pipelines.py` (pipeline dynamics)

Checks whether the *automation* actually works, not just that files are valid:

- **Rebuild-hook firing** — did the post-commit graph rebuild fire (it's async
  and silent)?
- **`needs_update` staleness** — doc semantics stale >24h are rotting.
- **Autocommit liveness** — an audit-trail gap means the daemon may be dead.
- **Graph connectivity ratchet** — the giant-component fraction is compared to
  the best-ever; a drop >20% is an ERROR (a semantic-layer wipe regresses this).
- **Toolchain-version baseline** — pi/graphify/node changes WARN once with a
  re-verification list.
- **Extension load smoke** (under `--full`/`/audit`) — every extension is loaded
  with pi's own jiti loader (`smoke-extensions.mjs`).
- **Drift audits** — graph-first bypass ratio, lead-profile fallback coverage,
  reflection drift, semantic-cache drift.

## `extensions/self-audit.ts` (the glue)

Runs both scripts at `session_start` and caches the merged result; injects a
"Harness self-audit" block on `before_agent_start` **only** when errors/warnings
exist (zero cost when healthy); re-runs on the `config-repo-advanced` bus signal
(see [[concepts/concurrency-model]]); and exposes `/audit` for the full report.
It **fails closed**: a non-zero exit with output but no ERROR/WARN line (e.g. a
Python traceback) synthesizes a problem line so the crash is not hidden.

The same `validate-config.py` also runs as the **pre-commit hook** gating
snapshots — with the launchd-PATH caveat documented in
[[concepts/concurrency-model]] (launchd's `python3` lacks `jsonschema`, so the
daemon-run hook degrades to parse-only).
