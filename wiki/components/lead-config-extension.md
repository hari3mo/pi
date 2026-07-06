---
title: Lead-Config Extension
category: components
source_layer: local
sources:
  - /Users/harissaif/.pi/agent/extensions/lead-config.ts
  - /Users/harissaif/.pi/agent/config/lead-profiles.json
tags: [pi, extensions, orchestration, component]
aliases: ["lead-config.ts", "Lead Profiles"]
summary: The extension that mechanizes the delegation gate per-model — every prompt it reads the active model id, first-matches a lead profile, and appends that profile's doctrine to the system prompt. Fail-open.
relationships:
  - target: "[[concepts/delegation-gate]]"
    type: implements
  - target: "[[synthesis/prose-to-code-promotion]]"
    type: related_to
  - target: "[[components/config-validation]]"
    type: related_to
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Lead-Config Extension

`extensions/lead-config.ts` — the runtime that mechanizes the
[[concepts/delegation-gate]]. The gate's per-model branch used to live only as
prose the agent had to remember; this extension turns it into structure.

## What it does

On every `before_agent_start` it reads the active model id (`ctx.model.id`),
first-matches it against `config/lead-profiles.json`, and appends the matched
profile's `doctrine` block to the system prompt under a clear header. Because the
model can switch mid-session (shift+tab), this re-evaluates **every turn** — the
lead profile always tracks the *currently* selected model, not the one that
started the session.

## The two profiles

`config/lead-profiles.json` holds an ordered list; the first non-fallback profile
whose `match` regex hits the id wins, else the `fallback`:

- **fable** (`match: "fable"`) — confirms AGENTS.md is canon and adds nothing
  else (duplicating the doctrine would only let it drift).
- **direct** (`match: ".*"`, catch-all) — work directly, no pipeline; this now
  covers `claude-opus-4-8` too (opus is a direct-work lead, not an orchestrator).

## Design intent (durable)

- **Fail-open throughout.** An unknown/garbage model id, a missing/malformed
  profiles file, or any error injects **nothing** — the static `AGENTS.md`
  doctrine stands. The parsed profiles file is cached by mtime.
- **Enforcement is untouched.** This only *injects doctrine*; the actual fable
  edit-block lives in the [[components/write-gate-extension]]. Injection and
  enforcement are deliberately separate concerns.
- **Applies to subagent children too** — a child may itself be a direct-work
  lead of its own sub-work, which is correct.
- **Self-improving closure.** Per-session {models seen, profile applied, fallback
  count} are appended to `graphify-out/.lead_config_stats.json`;
  `audit-pipelines.py:check_lead_profile_coverage()` WARNs when a model id
  repeatedly resolves to the fallback (roster drift). See
  [[components/config-validation]].
- Pure matching functions (`parseProfiles`, `matchProfile`, `buildLeadBlock`)
  carry no bare value imports, so a jiti check can import them without
  provisioning `node_modules`.

This is the canonical worked example of [[synthesis/prose-to-code-promotion]]:
the AGENTS.md prose remains the canon, and this extension is its runtime echo.

*(For the live symbol/call structure of the file, use the `graph` tool per
[[concepts/knowledge-graph-integration]] — this page distills intent, not
line-level structure.)*
