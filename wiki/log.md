---
title: Wiki Log
---

# Wiki Log

*Append-only chronological record. One `## [YYYY-MM-DD] OP | Title` block per operation.
See [[SCHEMA]] (Log Format) for conventions.*

## [2026-07-04] INIT | Wiki vault created
- Scaffold + schema laid down for the pi coding-agent knowledge map.
- Categories: concepts, components, workflows, references, synthesis, journal.
- Three provenance layers: upstream, local, learned.
- pi_version at creation: 0.80.3

## [2026-07-04] INGEST | Distilled pi concepts (what-is-pi, philosophy, sessions, trust, message queue)
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 5, pages_updated: 0
- pages: concepts/what-is-pi, concepts/extensibility-philosophy, concepts/message-queue, concepts/session-model, concepts/project-trust
- sources: pi-coding-agent README.md, docs/index.md, docs/sessions.md, docs/compaction.md, docs/security.md, docs/settings.md
- notes: what-is-pi and extensibility-philosophy are core-tier hubs; the rest supporting. All reviewed lifecycle (distilled from full authoritative docs).

## [2026-07-04] INGEST | Distilled pi components (extension system, tools, skills, templates, themes)
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 5, pages_updated: 0
- pages: components/extension-system, components/tools, components/skills-system, components/prompt-templates, components/themes
- sources: docs/extensions.md, docs/skills.md, docs/prompt-templates.md, docs/themes.md, README.md
- notes: extension-system is core-tier. Owns the generic pi-feature names per the naming rule (local layer namespaces its *-extension pages).

## [2026-07-04] INGEST | Distilled pi components (keybindings, TUI, providers/models, packages, settings)
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 5, pages_updated: 0
- pages: components/keybindings, components/tui-components, components/providers-and-models, components/pi-packages, components/settings
- sources: docs/keybindings.md, docs/tui.md, docs/providers.md, docs/models.md, docs/packages.md, docs/settings.md
- notes: tui-components marked draft (tui.md skimmed, not fully read); rest reviewed.

## [2026-07-04] INGEST | Distilled pi workflows (write extension, create skill, add model, custom provider, SDK, package)
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 6, pages_updated: 0
- pages: workflows/write-an-extension, workflows/create-a-skill, workflows/add-a-model, workflows/add-custom-provider, workflows/embed-pi-with-sdk, workflows/create-a-pi-package
- sources: docs/extensions.md, docs/skills.md, docs/models.md, docs/custom-provider.md, docs/sdk.md, docs/packages.md, examples/
- notes: embed-pi-with-sdk marked draft (sdk.md partially read). create-a-pi-package added to resolve the pi-packages forward link.

## [2026-07-04] INGEST | Distilled pi references (CLI, RPC, session format, examples catalog)
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 4, pages_updated: 0
- pages: references/cli-reference, references/rpc-mode, references/session-format, references/examples-catalog
- sources: README.md, docs/usage.md, docs/rpc.md, docs/session-format.md, examples/README.md, examples/extensions/README.md, examples/sdk/README.md
- notes: rpc-mode and session-format marked draft (docs read at section granularity, not line-by-line). cli-reference and examples-catalog reviewed.

## [2026-07-04] INGEST | Upstream layer summary
- source_layer: upstream
- pi_version: 0.80.3
- pages_created: 25 (concepts 5, components 10, workflows 6, references 4)
- deliberately skipped: quickstart.md, usage.md (folded into what-is-pi + cli-reference); json.md (mentioned in cli-reference); containerization.md (folded into project-trust); development.md (contributor setup, out of knowledge scope); platform docs windows/termux/tmux/terminal-setup/shell-aliases.md (environment-specific setup, low durable-knowledge value)
- fragments: _fragments/index-upstream.md, _fragments/log-upstream.md (index.md and log.md untouched per fragment protocol)

## [2026-07-04] INGEST | Distilled the local pi harness orchestration doctrine
- source_layer: local
- pages_created: 8, pages_updated: 0
- sources: /Users/harissaif/.pi/agent/AGENTS.md, docs/delegation-contract.md, docs/rework-loop.md, config/lead-profiles.json
- Concept pages: orchestration-doctrine (centerpiece — touch each task twice), delegation-gate (per-model fable/opus/direct branch), routing-and-roles (scale-first table + role roster + pinned tiers), rework-loop (peer verdict contract + 3-FAIL ceiling), fable-budget-invariants (token-spend MUST rules), self-audit-loop, concurrency-model, knowledge-graph-integration.
- Deferred to the graph tool: live symbol/call structure of AGENTS.md and the config files (per SCHEMA graph-tool division of labor).

## [2026-07-04] INGEST | Distilled the enforcement & self-audit extensions
- source_layer: local
- pages_created: 8, pages_updated: 0
- sources: /Users/harissaif/.pi/agent/extensions/{lead-config,read-only-default,subagent/index,concurrency-guard,graph-first,impact-trace,graphify-bridge,self-audit}.ts, scripts/{validate-config,audit-pipelines}.py, schema/manifest.json
- Component pages: lead-config-extension, write-gate-extension, subagent-extension, concurrency-guard-extension, graph-first-extension, impact-trace-extension, graphify-bridge-extension, config-validation (self-audit.ts + both scripts + manifest merged).
- Each page distills durable design/intent (fail-open posture, self-improving stat closures, why each mechanizes a prose rule) rather than line-level structure, which is left to the `graph` tool.

## [2026-07-04] INGEST | Cataloged skill families and the prose→code synthesis
- source_layer: local
- pages_created: 2, pages_updated: 0
- sources: /Users/harissaif/.pi/agent/skills/, git/github.com/DietrichGebert/ponytail/skills/, /Users/harissaif/.agents/skills/
- components/skills-catalog: one catalog page mapping the LLM-wiki, history-ingest, graphify/meta, ponytail, and general-workflow families (deliberately NOT a page per skill).
- synthesis/prose-to-code-promotion: cross-cutting page collecting every "standing prose rule → mechanism" promotion across AGENTS.md and the extensions.
- Total local-layer pages this ingest: 18 (8 concepts, 9 components, 1 synthesis).

## [2026-07-04] INGEST | Distilled the LEARNED layer (heuristics + reflections) into synthesis pages
- source_layer: learned
- pages_created: 7, pages_updated: 0
- sources: /Users/harissaif/.pi/heuristics/heuristics.jsonl, /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl, /Users/harissaif/.pi/agent/graphify-out/reflections/LESSONS.md
- Grouped 30 accumulated heuristics thematically (not one-page-per-lesson); every heuristic ID cited in a page body. Zero lessons skipped.
- synthesis/pi-extension-api-gotchas — h_mr6ars7c, h_mr6ayaby, h_mr5vqdg7 (+ refs h_mr5p7pws, h_mr6ct77f).
- synthesis/pi-tui-rendering-gotchas — h_mr5q6prq, h_mr5og2re, h_mr5ut2oy, h_mr5vsr40, h_mr5t3f3y.
- synthesis/graphify-query-craft — h_mr6a1h0g, h_mr6bnodv + reflections/LESSONS.md preferred/tentative sources.
- synthesis/orchestration-lessons — h_mr6e8a3u (the /Users/harissaif/.pi/heuristics project-scoped entry), h_mr5lmluz, h_mr6dj5qf, h_mr5uv3so, h_mr6dru62, h_mr5tyavr, h_mr5uus41.
- synthesis/write-gate-and-read-only-mode — h_mr5l245j, h_mr5lmko1, h_mr5p7pws (primary home).
- synthesis/harness-environment-quirks — h_mr68svnd, h_mr68t102, h_mr5tuc9h, h_mr5v1oof, h_mr5udd6q.
- synthesis/pi-workflow-conventions — h_mr6ct77f, h_mr64pqxy, h_mr69pwqg, h_mr5k39hu, h_mr5upxvw.
- Note: task named only /Users/harissaif/.pi/heuristics/heuristics.jsonl (1 entry) as source, but its examples reference the richer /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl (29 entries) — ingested both, per "every entry, global and project scopes".

## [2026-07-04] MERGE | Fragment merge — initial three-layer ingest
- per-layer bullet counts merged: upstream 25, local 18, learned 7 (total 50)
