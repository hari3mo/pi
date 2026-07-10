# Config Index

This file is the semantic audit map of `~/.pi/agent`.
Git snapshots hold the raw diffs; this file holds the meaning.
Every session that changes config must update it.

## Feature index

| Feature | Files | Purpose |
|---|---|---|
| Concurrency guard | `extensions/concurrency-guard.ts` + `extensions/lib/change-detection.ts` | Cross-shell session safety for ~/.pi/agent: one detection/classification engine (lib) — foreign-commit notices (own-edit snapshots filtered = autocommit stays silent), classified `config-repo-advanced` bus event, persistent stale-loaded-resource registry (recurring prompt block + widget, first edit to a not-re-read stale resource blocked), per-edit dirty-file warnings. Fail-open on any git error. |
| Graph maintenance runbook | `docs/graph-maintenance.md` | Operational canon for graphify-out/: the md-re-extraction wipe invariant, multiprocessing `__main__` guard, content-keyed cache re-binding, regeneration and shrink-guard procedure, health signals. Distilled from heuristics + 2026-07-04 incidents. |
| Toolchain adaptability | `scripts/smoke-extensions.mjs`, `scripts/audit-pipelines.py` | Extension load smoke using pi's own jiti loader against a Proxy fake-pi (all registered extensions; self-provisions gitignored `node_modules` symlinks, self-heals on pi relocation); toolchain version tracking (pi/graphifyy/node in `.pipeline_baseline.json`) WARNs once per upgrade with the re-verification list. Runs in `/audit` (`--full`); versions checked every session start. |
| Pipeline meta-audit | `scripts/audit-pipelines.py`, `extensions/self-audit.ts` | Audits the pipelines themselves (dynamics, not static config): post-commit rebuild firing, needs_update staleness, launchd autocommit liveness, reflection drift, semantic-cache drift (`--full`), and a self-maintaining graph-connectivity ratchet (`graphify-out/.pipeline_baseline.json`, best-ever giant fraction; >20% drop = ERROR). Merged with validate-config.py into the session-start injection and `/audit`. |
| Self-audit loop | `extensions/self-audit.ts`, `scripts/validate-config.py` | Session-start validator run with ERROR/WARN injected into the system prompt (silent when healthy); `/audit` on-demand report; validator gained installed-artifact integrity checks (graphify hook doc-filter present, no post-checkout rebuild hook, pi-tui scrollback patch still applied). |
| Graph-first redirect | `extensions/graph-first.ts`, `extensions/lib/graph-lookup.ts`, `schema/graph-first-stats.schema.json`, `scripts/check-graph-first.mjs` | Steers structure-shaped `grep`/`rg` (symbol def/ref/import hunts) to the `graph` tool via a per-session escalation ladder: 1st offense = allow + nudge, 2nd+ = block, identical retry = bypass; content greps pass untouched (false positives worse than misses). Self-improving: per-session `{nudges,blocks,bypasses}` appended to `graphify-out/.graph_first_stats.json` (~50 records); at agent_end a high bypass ratio nudges a `/graphify --update` re-cache, and `audit-pipelines.py:check_graph_first_drift()` WARNs when the recorded ratio stays >50%. Active only when `graphify-out/graph.json` exists; applies to subagents; fail-open. |
| Wiki/wiki session link | `extensions/wiki-first.ts`, `extensions/lib/knowledge-router.ts` | Injects absolute active-wiki and pi-wiki links into every prompt so wiki access is independent of cwd; also enforces WIKI-FIRST for pi docs (nudge then block with identical-retry bypass) and names both stores so agents pick `wiki-query` for durable pi knowledge vs `graph` for live code structure. Domain-aware (v2): in a non-default domain cwd (config/domains.json) the domain's wiki vault also counts as consulted and the messages name its profile. |
| Domain routing | `config/domains.json`, `extensions/lib/domains.ts` | Maps cwd prefixes to knowledge domains (currently `prism`; default `pi`). Consumers: learning-tap (stamps `domain` on events/receipts per learning/SCHEMA.md v2), wiki-first (domain vault = consulted), graphify-bridge + graph-first (domain graph dir, e.g. prism-oracle/prism-graph). Fail-open: broken config behaves like v1 single-domain. Check: `scripts/check-domains.mjs`. |
| Knowledge compounding | `extensions/learning-tap/` (`index.ts`, `lib.ts`) | Mechanized capture for the learning pipeline (`learning/SCHEMA.md`): observes substantive `graph` query/explain answers and peer/doctor verdicts in subagent returns, provides the `learn` tool for explicit lessons, and flushes buffered events to `learning/events.jsonl` at shutdown plus `graphify save-result --outcome useful` (nearest project graph, pi-agent-graph fallback) so reflections stay fed. Triage/promotion happens out-of-session (nightly Hermes distiller). Replaces `knowledge-compound.ts`. Check: `scripts/check-learning-tap.mjs`. |
| Impact tracing | `extensions/impact-trace.ts`, `extensions/lib/graph-lookup.ts`, `scripts/check-impact-trace.mjs` | After every successful edit/write, looks the file up in `graphify-out/graph.json` and injects its INBOUND cross-file dependents (`fileA:line (references)`, capped at 10) so cross-file impact is visible without asking; appends a staleness note when the graph predates the edit or `needs_update` is set. Debounced once per file per session; follow-through reminder at agent_end for flagged dependents never subsequently edited. Silent on no-refs / not-in-graph / any error — never wedges an edit. |
| Graph lookup lib | `extensions/lib/graph-lookup.ts` | Shared, pi-package-free graph.json access (findGraphRoot, mtime-cached loadGraph, inboundRefs, markSeen debounce, isGraphStale) for graph-first + impact-trace; handles both `links` and `edges` keys. Follows the `lib/config-paths.ts` pattern (not auto-loaded). |
| Graphify bridge | `extensions/graphify-bridge.ts`, `.pi-vcs/hooks/post-commit` | Native knowledge-graph integration: injects a compact graph block (absolute graph path/root, size/hubs/staleness) into the system prompt, registers a cwd-independent `graph` tool (nearest project graph; falls back to the pi agent config graph) and a `/graph` command (status / AST rebuild+recluster); post-commit hook auto-rebuilds the graph on code commits and flags doc changes as `needs_update`; session-start `reflect --if-stale` keeps query lessons fresh. |
| Void harness (test) | `extensions/_void_harness.mts` | Drives `void-blackhole.ts`'s fake registration to unit-test its component factory. |
| Chat title | `extensions/chat-title.ts` | Sets the terminal tab/window title to project + condensed last prompt, prefixed with a live session timer. |
| Custom header | `extensions/custom-header.ts` | Replaces pi's built-in header with a figlet "harimo" banner + greeting/cwd/aphorism subtitle lines; bows out when Harimo familiar is enabled. |
| Familiar persona | `extensions/familiar.ts`, `extensions/void-blackhole.ts`, `.familiar-enabled` | Optional `/familiar` Harimo persona: the void still owns startup splash; when the flag exists, Harimo owns the post-splash header + below-editor status widget. |
| Focus chime | `extensions/focus-chime.ts` | macOS-only notification (osascript) when an agent turn runs longer than 25s; `/chime` toggles it. |
| Minimal UI | `extensions/minimal-ui.ts` | Companion to the "porcelain" theme: quiet one-line footer + grayscale breathing working-indicator; `/minimal-ui` toggles. |
| Model awareness | `extensions/model-awareness.ts` | Keeps the LLM's system prompt aware of the live active model so the Delegation Gate model checks stay accurate across mid-session switches. |
| Model usage menu | `extensions/model-usage.ts` | Adds `/usage` and `/model-usage`: a TUI scope menu plus per-model token/cost table for current branch, current project, today, or all stored pi sessions; includes subagent usage persisted in subagent tool-result details. |
| Model-aware lead profiles | `extensions/lead-config.ts`, `config/lead-profiles.json`, `schema/lead-profiles.schema.json`, `schema/lead-config-stats.schema.json`, `scripts/check-lead-config.mjs` | Mechanizes the AGENTS.md Delegation Gate per-model: `before_agent_start` reads the active model id (`ctx.model.id`), first-matches `config/lead-profiles.json` (fable = confirm-only, no duplication; direct = catch-all `.*` for every other model incl. `claude-opus-4-8`, which works directly — no subagents), and appends that profile's doctrine to the system prompt under an auto-detected header. Unknown/garbage id or any error injects nothing (fail open; static AGENTS.md stands); profiles cached by mtime; applies to `PI_SUBAGENT` children. Does NOT change enforcement (`read-only-default.ts`'s fable edit-block). Self-improving: per-session `{models, profiles, fallbacks, fallbackModels}` appended to `graphify-out/.lead_config_stats.json` (atomic temp+rename, ~50 records); `audit-pipelines.py:check_lead_profile_coverage()` WARNs when a model id resolves to the fallback profile across ≥5 sessions (roster drift). |
| Model cycle | `extensions/model-cycle.ts` | Shift+Tab cycles a fixed pinned-model list (sonnet-5 → opus-4-8 → fable-5 → gemini-3.5-flash → gpt-5.5); frees Shift+Tab by rebinding `app.thinking.cycle` to Option+Tab. |
| pi-vcs breadcrumb | `extensions/pi-vcs-breadcrumb.ts` | Logs each pi tool-use touching a file to a breadcrumb log, folded into `.pi-vcs` autocommit messages. |
| Write-gate default | `extensions/read-only-default.ts` | New sessions start in "confirm" mode; `/write`, `/confirm`, `/read-only` (or Ctrl+\`) switch write-access modes; auto-write approvals (`/write`, `pi --write`, confirm-mode "allow all") only skip prompts under `~/.pi`; hard-blocks `edit`/`write` tool calls whenever the lead model is fable, in all gate modes, exempting spawned children via `PI_SUBAGENT=1`. |
| Session receipt | `extensions/session-receipt.ts` | Narrow "shop receipt" summary (duration, turns, tokens, cost, tool tally, files touched); `/receipt` toggles it. |
| Task tracker | `extensions/task-tracker.ts` | `task` tool + `/tasks` command with a persistent TUI widget/status; state lives in cloned tool-result details so reloads/branching stay correct. |
| Void blackhole | `extensions/void-blackhole.ts` | Animated ASCII black-hole TUI landing page / `/void` screensaver with a Newtonian accretion-disk simulation; on startup it hands post-splash chrome to Harimo when `.familiar-enabled` exists. |
| Shared format helpers | `extensions/lib/format.ts` | Duration/token/cwd formatting helpers shared by several extensions; not auto-loaded (lives outside `extensions/*.ts`). |
| Continuous-learning design doc | `extensions/heuristics/DESIGN.md` | Authoritative v2 spec for the heuristics extension (storage, capture, injection, scoring, `/heuristics` command). |
| Heuristics `/heuristics` command | `extensions/heuristics/command.ts` | Implements the `/heuristics` command (list/edit/delete/promote) per DESIGN.md §10. |
| Heuristics entry point | `extensions/heuristics/index.ts` | Wires the `learn_heuristic` tool, `before_agent_start` injection, `agent_end`/`tool_result` nudges, and the `/heuristics` command together. |
| Heuristics injection | `extensions/heuristics/inject.ts` | Pure builder for the "Learned heuristics" system-prompt block from already-loaded heuristic lists (DESIGN.md §8). |
| Heuristics sanitize | `extensions/heuristics/sanitize.ts` | Save-pipeline text processing: sanitize, secret redaction, generality rewrite + lint (DESIGN.md §4–§5). |
| Heuristics schema | `extensions/heuristics/schema.ts` | Shared types/constants and dedup/scoring primitives for the heuristic entry schema (DESIGN.md §1, §6, §7, §11). |
| Heuristics store | `extensions/heuristics/store.ts` | Path resolution, JSONL read, locked read-modify-write mutations, and the full capture pipeline (DESIGN.md §1–§2, §4, §6–§7). |
| Subagent tool | `extensions/subagent/index.ts` | Spawns isolated `pi` subprocesses per delegated task; supports single/parallel/chain modes via JSON-mode structured output; auto-appends `STANDING_CONTRACT_FOOTER` to every dispatched task, and `finalizeQaOutput` verdict-normalizes peer returns (`[VERDICT: ...]`) with a session-level consecutive-FAIL loop budget of 3. |
| Subagent agents helper (symlink) | `extensions/subagent/agents.ts` | Symlink into the installed `pi-coding-agent` examples package; not repo-local logic. |
| Agent role set | `agents/worker.md`, `agents/fable-engineer.md`, `agents/lawyer.md`, `agents/peer.md`, `agents/scout.md`, `agents/engineer.md`, `agents/doctor.md` | Seven-role roster dispatched per the AGENTS.md scale-first routing table. `engineer` (renamed from `solo-engineer`) is the default workhorse (whole bounded tasks end-to-end; also design-only dispatches when 2+ implementers consume the design — there is no standing architect). `worker` (renamed from `builder`) handles fully-specified mechanical edits and ships after review passes. `scout` is read-only investigation; `doctor` (sonnet, read/run-only) runs the acceptance path and returns PASS/FAIL, only when something is runnable. `peer` (renamed from `reviewer`, itself renamed from `qa-reviewer`; gpt-5.5:xhigh, pinned xhigh) is the deep-reasoning gate for existing-behavior/high-risk changes. `lawyer` (renamed from `peer-engineer`, gpt-5.5:xhigh) gives blind second opinions; `fable-engineer` is opt-in only (explicit user approval), the sole orchestrator-tier subagent. Scope ambiguity is resolved by interviewing the user (`scope-planner` deleted). |
| Prompt templates | `prompts/build.md`, `prompts/design.md`, `prompts/feature.md`, `prompts/ship.md` | `/design`, `/build`, `/ship`, `/feature` slash-command prompt templates. |
| Themes | `themes/porcelain.json`, `themes/porcelain-light.json` | "Porcelain" quiet theme (dark + light variants), paired with the Minimal UI extension. |
| Schema validation | `schema/*.schema.json`, `schema/manifest.json`, `scripts/validate-config.py` | Manifest-driven validator: schema conformance, heuristics scope drift, credential leakage, gitignore coverage, dangling skill symlinks, layout conformance. |
| pi-tui scrollback fix | `patches/pi-tui-scrollback-fix.md`, `patches/pi-tui-scrollback-fix-harness.mjs` | Documents + regression-tests a manual patch to the installed `pi-tui` dist that stops scrollback-wiping full-redraws when content above the viewport changes; must be re-applied after pi package updates (per-machine — the dist is not synced). Harness resolves the dist via PI_TUI_PATH / `npm root -g`. |
| Rework loop doc | `docs/rework-loop.md` | Defines the `peer` verdict contract (PASS / FAIL:implementation / FAIL:design) and the bounded rework/retry mechanics for any peer-gated build (fan-out or solo); documents the automatic verdict normalization + 3-FAIL session budget enforced by `extensions/subagent/index.ts`. |
| Delegation contract template | `docs/delegation-contract.md` | Canonical skeleton (read-first, bounded problem, return contract, verification, constraints) that every dispatched task is authored against; the hygiene/return footer is auto-appended, never restated. |
| Autocommit + peer-sync infra | `.pi-vcs/sync.sh` (supersedes `autocommit.sh`), `.pi-vcs/hooks/pre-commit`, `.gitattributes`, `scripts/bootstrap-peer.sh`, `docs/sync.md` | Scheduler-triggered (launchd on macOS, cron on Linux) git auto-snapshot of config changes PLUS two-way peer sync via origin (fetch → rebase → push; union-merge for append-only jsonl; offline-safe; lock-guarded), gated by a pre-commit hook that runs the validator. |
| Global settings | `settings.json` | Default provider/model/thinking level, enabled model list (feeds `model-cycle.ts`), quiet-startup flag, installed packages. |
| Keybindings | `keybindings.json` | User keybinding overrides (currently: `app.thinking.cycle` → Option+Tab to free Shift+Tab for model-cycle; session rename → Option+R). |
| Global agent doctrine | `AGENTS.md` | The Delegation Gate, write-gate pre-flight, intent interview, scale-first routing table, seven-role roster, fable budget invariants, rework loop, and config-maintenance checklist governing how this harness is used across sessions. |

## Changelog

**Void splash + Harimo chrome can coexist.**
User-directed. `/familiar` no longer suppresses the void landing page: on startup,
`void-blackhole.ts` always shows the void splash, then installs Harimo header/status when
`.familiar-enabled` exists; `familiar.ts` skips its own startup splash and exports the chrome
installer for that handoff. Verified with void/familiar harnesses + config validator. Files:
`extensions/void-blackhole.ts`, `extensions/familiar.ts`, `docs/config-index.md`. Why: user
wanted both the void landing page and the Harimo persona.

**Subagent thinking pins no longer inherit from the lead.**
User-directed. `extensions/subagent/index.ts` now pins Opus/GPT-5.5 children to `:xhigh`
and Sonnet/Gemini Flash children to `:high`, overriding any trailing suffix for those families
and never reading the lead's live thinking level. Unknown model families keep their configured
suffix unchanged. Updated AGENTS.md Defaults plus current docs/wiki references. Files:
`extensions/subagent/index.ts`, `AGENTS.md`, `docs/config-index.md`,
`wiki/components/subagent-extension.md`, `wiki/concepts/routing-and-roles.md`. Why: subagent
effort is a per-model policy, not an orchestration inheritance rule.

**Removed the `opus-lead` profile: opus is now just a direct-work lead.**
User-directed: dropped the delegation-biased Opus orchestration doctrine. `claude-opus-4-8`
no longer gets a tailored profile — it falls through the catch-all `.*` to `direct` (work
directly, no subagents/pipeline), same as every non-fable model. Only `claude-fable-5`
orchestrates now. Edits: removed the `opus-lead` object from `config/lead-profiles.json`
(2 profiles remain: `fable`, `direct`); AGENTS.md Delegation Gate collapsed to "fable
orchestrates; any other model incl. opus works directly" + the mechanization sentence
(`fable / direct`); `extensions/lead-config.ts` header comment; `scripts/check-lead-config.mjs`
(opus → direct, ≥2 profiles); the live feature-index row above; and the wiki concept/component
pages. Verified: validate-config clean, check-lead-config green. Note: `direct` is a plain
`.*` match (not `fallback: true`), so opus resolving to it does NOT trip
`check_lead_profile_coverage()` roster-drift. Files: `config/lead-profiles.json`, `AGENTS.md`,
`extensions/lead-config.ts`, `scripts/check-lead-config.mjs`, `docs/config-index.md`,
`wiki/concepts/delegation-gate.md`, `wiki/components/lead-config-extension.md`,
`wiki/index.md`, `wiki/synthesis/orchestration-lessons.md`. Why: opus should be just opus
when active.

**Peer/doctor model repin (superseded by the 2026-07-09 thinking pins): `peer` → `openai/gpt-5.5:xhigh`, `doctor` → `anthropic/claude-sonnet-5:high`.**
User-directed. `peer` (gate-tier verification) moved from `google/gemini-3.5-flash:high` to
`openai/gpt-5.5`; current behavior pins GPT-5.5 subagents to `:xhigh` directly in
`withThinking`, so the suffix is no longer a lead-effort fallback. `doctor` (acceptance-path runner)
moved from `google/gemini-3.5-flash:high` to `anthropic/claude-sonnet-5:high` (the mechanical tier).
Updated the `model:` frontmatter in `agents/peer.md` and `agents/doctor.md`, plus doctrine references:
AGENTS.md Defaults tiers, `config/lead-profiles.json` opus-lead doctrine, and
`wiki/concepts/routing-and-roles.md` role table.

**Peer/reviewer model swap: `reviewer` → `openai/gpt-5.5:xhigh`, `peer` → `google/gemini-3.5-flash:high`.**
User-directed: the two model pins on the second-opinion roles were exchanged. `reviewer`
(blind independent second opinion) moves from `gemini-3.5-flash:high` to `openai/gpt-5.5:xhigh`;
`peer` (gate-tier verification) moves from `openai/gpt-5.5:xhigh` to `google/gemini-3.5-flash:high`
(`:high` per the gemini-3.5-flash thinking heuristic). Updated the `model:` frontmatter in
`agents/reviewer.md` and `agents/peer.md`, plus every doctrine reference: AGENTS.md roles
table (reviewer tier model) and defaults line (peer tier model), `config/lead-profiles.json`
(opus-lead doctrine tier list), and this file's roster description. No behavior/charter
change — only the backing model per role. Files: `agents/reviewer.md`, `agents/peer.md`,
`AGENTS.md`, `config/lead-profiles.json`, `docs/config-index.md`.

> Append a new entry at the top whenever a config feature is added, changed,
> or removed. Format: date, summary, files touched, why. Keep entries to
> 2–4 lines.

### 2026-07-04

**Model usage menu.** Added `extensions/model-usage.ts`, registering `/usage` and `/model-usage` with a simple scope picker (current branch/current project/today/all/clear) and a width-safe widget table grouped by provider/model. It reads persisted pi session JSONL usage, includes subagent tool-result usage, and reports turns, input/output/cache tokens, cost share, and last-used time. Verified with extension smoke + config validator. Files: `extensions/model-usage.ts`, `docs/config-index.md`. Why: user wanted a comprehensive pi menu showing usage breakdown for each model.

**Cwd-independent wiki + graph session links.** `wiki-first.ts` now injects absolute active-wiki and pi-wiki links into every prompt, so `wiki-query` has the right vault context from any cwd. `graphify-bridge.ts` now prints the absolute graph path/root and documents the nearest-project-graph → pi-agent-graph fallback; `knowledge-compound.ts` uses the same fallback when flushing `graphify save-result`, so graph answers still feed reflections from `$HOME` or unrelated projects. Files: `extensions/wiki-first.ts`, `extensions/graphify-bridge.ts`, `extensions/knowledge-compound.ts`, `docs/config-index.md`.

**Wiki-first mechanized + query-compounding mechanized: `extensions/wiki-first.ts` +
`extensions/knowledge-compound.ts`.** `wiki-first.ts` mirrors `graph-first.ts` for the
WIKI-FIRST doctrine: reads of pi's own docs (README/docs/examples under the installed
package) before an wiki consult get a first-offense nudge, then a block with an
identical-retry bypass; active only when the wiki vault and `~/.obsidian-wiki/config.wiki`
exist; fail-open. `knowledge-compound.ts` mechanizes query-compounding: it buffers
substantive `graph` tool query/explain outcomes during the session and on
`session_shutdown` runs `graphify save-result --outcome` plus stages draft synthesis notes
into `wiki/_raw/` (≤3/session, deduped, no LLM calls, never blocks shutdown, fail-open).
Both peer-reviewed: PASS. Files: `extensions/wiki-first.ts` (new),
`extensions/knowledge-compound.ts` (new), `AGENTS.md`, `docs/config-index.md`.

**Incident + restore: knowledge-graph giant-component collapse (0.79→0.24), semantic
layer fragmented by an out-of-band full doc re-extraction.** `audit-pipelines.py`'s
connectivity ratchet ERRORed (blocking config snapshots) and a `graph` query returned only
vendored-ponytail nodes. Root cause: a manual full graphify doc-update run (`cost.json` 2nd
run: 93 files, 0 tokens — absent from the 06:40 backup) structurally re-extracted docs,
replacing the LLM semantic layer per graph-maintenance invariant #1; the config-repo's own
596 nodes (extensions/themes/config) dropped out of the giant component. NOT a machinery
fault — the post-commit hook filters docs and the bridge's `/graph update` is code-only
(both verified sound: they reproduce a config-repo-bridged graph). Restore: reinstated the
last healthy pre-incident graph (`graphify-out/2026-07-04/graph.json`, giant 0.689) as
`graph.json`/`.graphify_labels.json`/`GRAPH_REPORT.md`; `graphify-out/` is now untracked so
the restore neither churns commits nor fires a rebuild. One-off operational mistake → this
note (no code change). Reminder: refresh code via the guarded paths only; never run a bare
`graphify` / `graphify --update` that re-extracts docs. Residual: ~41% of graph nodes are
the vendored 3rd-party `git/github.com/DietrichGebert/ponytail` repo, whose bridge to the
config-repo hangs on a shared `path` import — a FULL code re-extraction (`/graph update`)
can detach it and drop the fraction to ~0.48, re-tripping the ratchet (the automatic
incremental post-commit does not). Files: none (graph artifacts are untracked).

**Ratchet scoped to config-repo nodes (peer NIT follow-up to the incident above).**
`audit-pipelines.py`'s giant-component ratchet now excludes the vendored `git/` subtree
from the fraction (`GIANT_SCOPE = "config-repo-v1"`), so a full re-extraction that detaches
ponytail can no longer spuriously tank it (the ~0.48 residual noted above); the recorded
best-ever was recalibrated from the incomparable pre-scoping 0.79 to the current scoped
0.66. Files: `scripts/audit-pipelines.py`.

**Model-aware lead profiles: the Delegation Gate is now mechanized per active model.**
Added `extensions/lead-config.ts`: on `before_agent_start` (every prompt — the model can
switch mid-session via shift+tab) it reads the active model id (`ctx.model.id`, the field
`read-only-default.ts` and `model-awareness.ts` already use), first-matches it against
`config/lead-profiles.json`, and appends the matched profile's doctrine block to the
system prompt under `## Lead profile (auto-detected: <model> → <profile>)`. Three profiles
(data, not code): `fable` (match `fable`) — a one-line confirmation only, since AGENTS.md IS
the fable doctrine and duplication drifts; `opus-lead` (match `opus`) — the port, a compact
≤1717-byte block letting an Opus lead implement directly at Micro/Standard scale and
requiring orchestration at Large (the complexity test verbatim), with the SAME roles/tiers,
dispatch contract, graph-first mandate, reviewer-final rule, verdict vocabulary, and 3-FAIL
rework budget as AGENTS.md; `direct` (fallback) — any other model works directly. First-match
is regex with substring fallback; non-fallback profiles tried first, then the `fallback`
catch-all. Unusable id (empty / no word char) or any error injects NOTHING (fail open;
static AGENTS.md stands); profiles cached by mtime; applies to `PI_SUBAGENT` children (a
child may be an opus/sonnet lead of its own sub-work). Enforcement (`read-only-default.ts`'s
fable edit-block) is untouched. Self-improving closure: per-session
`{models, profiles, fallbacks, fallbackModels}` are appended to
`graphify-out/.lead_config_stats.json` (atomic temp+rename, ~50-record ring — the
graph-first stats pattern) at `agent_end`; new `audit-pipelines.py:check_lead_profile_coverage()`
(fast local read) WARNs when a model id resolves to the fallback profile across ≥5 recorded
sessions (roster drift — add a profile or extend a match pattern), silent when absent.
Schema-registered both new config files (`config/lead-profiles.json` required,
`graphify-out/.lead_config_stats.json` optional) + `config/` in `layout.known`. Runnable
check `scripts/check-lead-config.mjs` jiti-imports the real pure functions and asserts the
full matching contract incl. mid-session swap and malformed-JSON fail-open. Verified:
20/20 extension smoke, validate-config clean, audit-pipelines clean, check-lead-config green,
all four existing check-*.mjs green. Files: `extensions/lead-config.ts` (new),
`config/lead-profiles.json` (new), `schema/lead-profiles.schema.json` (new),
`schema/lead-config-stats.schema.json` (new), `scripts/check-lead-config.mjs` (new),
`schema/manifest.json`, `scripts/audit-pipelines.py`, `AGENTS.md`, `docs/config-index.md`.
Why: the Delegation Gate branched on the lead model as prose the agent had to remember
across mid-session switches; now the correct lead doctrine is injected automatically, and
the Opus-lead pipeline port lives as versioned, schema-checked data.

**Knowledge graph wired natively into the agent loop: graph-first + impact-trace.**
Two new extensions close the loop between the graphify graph and the agent's own
actions. `extensions/graph-first.ts` hooks `tool_call` (bash): structure-shaped
`grep`/`rg` (keyword-anchored def/class/function/interface/type/const/import/from/require,
or a bare symbol searched repo-wide with `-r`/`--include`) is steered to the `graph`
tool — 1st offense allowed with a nudge, 2nd+ blocked, an identical retry always
bypasses; content greps (log strings, TODOs, values) pass untouched. Per-session
`{nudges,blocks,bypasses}` are appended to `graphify-out/.graph_first_stats.json`
(atomic temp+rename, ~50 records); at agent_end a bypass≥block ratio nudges a re-cache.
`extensions/impact-trace.ts` hooks `tool_result` (successful edit/write): resolves the
file repo-relative, collects INBOUND cross-file refs from the graph, and injects
`<file> is referenced by: <dep>:<line> (<rel>)` (capped 10, staleness-annotated,
debounced once/file); a follow-through reminder at agent_end lists flagged dependents
never subsequently edited. Both are inert/silent without `graphify-out/`, apply to
subagents, and are fully fail-open. Shared parsing factored into
`extensions/lib/graph-lookup.ts` (pi-package-free, `links`/`edges` tolerant). Added
`scripts/audit-pipelines.py:check_graph_first_drift()` (fast local read; WARN when the
recorded bypass ratio >50%; silent when the stats file is absent),
`schema/graph-first-stats.schema.json` + a `schema/manifest.json` target, and runnable
checks `scripts/check-graph-first.mjs` (detector + escalation ladder) and
`scripts/check-impact-trace.mjs` (inbound extraction on both `links`/`edges` fixtures +
debounce). Verified: 19/19 extension smoke, validate-config clean, audit-pipelines clean,
both checks green; drift WARN confirmed on a high-bypass fixture. Files:
`extensions/graph-first.ts` (new), `extensions/impact-trace.ts` (new),
`extensions/lib/graph-lookup.ts` (new), `schema/graph-first-stats.schema.json` (new),
`schema/manifest.json`, `scripts/audit-pipelines.py`, `scripts/check-graph-first.mjs` (new),
`scripts/check-impact-trace.mjs` (new), `AGENTS.md`, `docs/config-index.md`. Why: the
harness already retrieves knowledge about itself from the graph; now the graph also
guides searches away from grep and pushes edit-impact into view — the map acts on the
agent, not just when asked.


**Agent role swap: `reviewer` ↔ `peer-engineer`; `peer`'s model set to gpt-5.5.**
User-directed rename: the gate-tier verification agent (PASS/FAIL:implementation/
FAIL:design, ships-after-review role) is now called `peer` (was `reviewer`); the
blind-second-opinion agent (never shown the other's answer) is now called `reviewer`
(was `peer-engineer`). Behavior/charter of each agent is unchanged, only the name and
self-identity text moved. `agents/peer.md`'s model bumped from `openai/gpt-5.5-pro:xhigh`
to `openai/gpt-5.5:xhigh` per explicit user request (the `reviewer` agent, formerly
`peer-engineer`, keeps `gpt-5.5-pro`). Updated every doctrine reference: AGENTS.md
(routing table, roles table, budget invariants, rework-loop section), `docs/rework-loop.md`
(entire doc renamed `reviewer`→`peer`), `extensions/subagent/index.ts`
(`finalizeQaOutput`'s hardcoded `agentName !== "reviewer"` gate now checks `"peer"`),
`README.md`, `prompts/build.md`, `prompts/feature.md`. Files:
`agents/peer.md` (renamed from `reviewer.md`), `agents/reviewer.md` (renamed from
`peer-engineer.md`), `AGENTS.md`, `docs/rework-loop.md`, `extensions/subagent/index.ts`,
`README.md`, `prompts/build.md`, `prompts/feature.md`, `docs/config-index.md`. Why: user
directive to rename the two roles (swap), plus a model change for the renamed `peer`.


**Concurrency guard: concurrent pi sessions across shells are now safe on ~/.pi/agent.**
Added `extensions/concurrency-guard.ts`: (1) before_agent_start compares HEAD to the
session's last-known and, when new commits touch files the session did NOT edit,
injects a re-read notice with the commit range and file list — own-edit autocommit
snapshots are filtered so the common case stays silent; (2) edit/write tool calls
targeting an agent-repo file that is git-dirty but untouched by this session get a
one-time `[concurrency-guard]` warning before clobbering another shell's uncommitted
work. Smoke-tested all four paths (silent/warn/once/ignore). Archived the now-enforced
lesson h_mr5v4okp (silent wipe by concurrent session). Existing protections noted:
heuristics store file locking, graphify rebuild flock, autocommit snapshot cadence.
Files: `extensions/concurrency-guard.ts` (new), `AGENTS.md`, `docs/config-index.md`,
`heuristics/heuristics.jsonl`. Why: user directive — handle pi config edits from
concurrent sessions across different shells; the failure mode was silent, now it
prompts.


**Orchestration pipeline made graph-aware; 27 heuristics distilled into canon.**
Graph-first is now doctrine at every dispatch point: AGENTS.md budget invariant
(query the `graph` tool before scout/reads), `agents/scout.md` + `agents/engineer.md`
role cards, `docs/delegation-contract.md` read-first item, and
`extensions/subagent/index.ts` STANDING_CONTRACT_FOOTER (every dispatched task told
to orient via the graph). Heuristics sweep per user directive ("any heuristic that
can be distilled into appropriate canon source, should"): 27 store entries distilled
into AGENTS.md (probe-suite prohibition, doctrine-prose-is-behavior,
mechanical-enforcement principle, graph-first), README.md (UTC-vs-local timestamps,
`.pi/` project-store row), `docs/delegation-contract.md` (evidence-reconstruction
QA rule), `extensions/heuristics/DESIGN.md` (scope bound to store file), the
pre-existing canon that already covered them (worker shipping git-status rule,
write-gate preflight, scout thresholds, model-awareness, scrollback patch doc,
config-index rows), and NEW `docs/graph-maintenance.md` (graphify operational canon —
also rescues two lessons destroyed when `git rm .pi/` deleted the project heuristics
store mid-session). Distilled entries moved to `heuristics/archive.jsonl` (append-only)
rather than deleted. Files: `AGENTS.md`, `agents/scout.md`, `agents/engineer.md`,
`docs/delegation-contract.md`, `docs/graph-maintenance.md` (new), `README.md`,
`extensions/heuristics/DESIGN.md`, `extensions/subagent/index.ts`,
`heuristics/heuristics.jsonl`, `.pi/heuristics/heuristics.jsonl`,
`docs/config-index.md`. Why: canon is injected structurally and versioned; memory
should hold only what has no canonical home — and the injection budget goes further.


**Adaptability layer: the harness survives pi itself changing.**
Added `scripts/smoke-extensions.mjs`: loads all 15 auto-loaded extensions
(`extensions/*.ts` + `extensions/*/index.ts`) with the jiti loader shipped INSIDE the
installed pi package (loader fidelity; native strip-types choked on the symlinked
subagent import) against a Proxy-based fake pi that no-ops every method — tolerant of
API growth, so only real load failures report. Self-provisions its module env
(gitignored `node_modules` symlinks, re-created each run so a moved pi install heals).
`scripts/audit-pipelines.py` gained toolchain version tracking (pi/graphifyy/node in
the baseline; changes WARN once with a re-verification list: pi-tui patch, extension
smoke, hook doc-filter) in fast mode, and the extension smoke in `--full`.
Negative-tested: canary extension with a broken import reports ERROR; simulated pi
upgrade warns once then goes silent. Files: `scripts/smoke-extensions.mjs` (new),
`scripts/audit-pipelines.py`, `AGENTS.md`, `docs/config-index.md`. Why: user directive —
the harness must adapt as pi changes; upgrades are now audited events with automated
load verification instead of silent breakage at the next session start.


**Pipeline meta-audit: the audit layer now audits the pipelines themselves.**
Added `scripts/audit-pipelines.py` — dynamics checks the static validator cannot see:
graph freshness vs last code commit (silent async hook failure), needs_update flag
staleness (>24h = doc semantics rotting), autocommit liveness (dirty tree + old
snapshot = launchd dead), reflection drift, semantic-cache drift (`--full` mode,
via the pinned graphify python), and a graph-connectivity RATCHET — best-ever
giant-component fraction persisted in `graphify-out/.pipeline_baseline.json`; a >20%
drop below best is an ERROR (would have caught today's 615→126 semantic wipe
automatically). `extensions/self-audit.ts` now runs both auditors in parallel at
session start and merges their ERROR/WARN lines into one injected block; `/audit`
runs the full suite. Negative-tested: ratchet fires on regression and never lowers
its best. Files: `scripts/audit-pipelines.py` (new), `extensions/self-audit.ts`,
`AGENTS.md`, `docs/config-index.md`. Why: user directive — an audit layer on top of
everything that maintains and improves the pipelines themselves; machinery
regressions now become prompts exactly like config errors.


**Error-integration signal S5: repeated tool errors nudge downstream persistence.**
`extensions/heuristics/{index.ts,schema.ts}`: non-subagent tool errors are counted per
run; ≥3 in one run fires a nudge (generic rate limiter, priority orchestration > S5 >
correction) telling the agent to root-cause and integrate the fix downstream — a
learn_heuristic lesson, a validate-config.py guard, a hook fix, or a graph re-cache.
`DESIGN.md` §9 and `AGENTS.md` → Self-Audit Loop codify the rule ("errors are never
just worked around"). Files: `extensions/heuristics/index.ts`,
`extensions/heuristics/schema.ts`, `extensions/heuristics/DESIGN.md`, `AGENTS.md`,
`docs/config-index.md`. Why: user directive — any error the agent encounters must be
solved and integrated downstream; this makes the pressure automatic.

**Self-audit loop made structural; graph hubs fixed; stray `.pi/` duplicate removed.**
Added `extensions/self-audit.ts`: runs `scripts/validate-config.py` at session start and
injects failures into the system prompt (zero cost when clean); `/audit` re-runs on
demand. Validator gained `check_installed_integrity()` guarding the three fixes that
live outside tracked config: the graphify post-commit doc filter (ERROR if regenerated
without it), absence of a graphify post-checkout hook (ERROR), and the pi-tui scrollback
patch markers in the installed dist (WARN after `pi update` overwrites). AGENTS.md →
Config Maintenance gained a "Self-Audit Loop (standing)" subsection codifying
validator-as-prompt, graph-as-map, and lessons-close-the-loop. `graphify-bridge.ts` hub
picker now ignores `contains` tree edges and dedupes labels (hubs were theme-JSON noise:
"colors, colors, store.ts" → "Config Index, Orchestration Doctrine, ..."). Deleted the
stray `.pi/agent/skills/graphify/` nested duplicate (12 files, byte-identical to
`skills/graphify/`) and pruned its nodes from the graph. Files: `extensions/self-audit.ts`
(new), `scripts/validate-config.py`, `extensions/graphify-bridge.ts`, `AGENTS.md`,
`docs/config-index.md`, `.pi/` (deleted). Why: user directive — self-improvement and
self-audit are paramount to pi's function; every fragile fix now has a code guard that
turns silent regressions into visible prompts.


**Graphify native integration: self-auditing knowledge graph of the harness.**
Built a graphify knowledge graph of `~/.pi/agent` (1,123 nodes / 1,564 edges, AST +
inline semantic extraction, fable-only) into `graphify-out/` (gitignored — derived).
Added `extensions/graphify-bridge.ts`: system-prompt graph block (~600 chars: counts,
top hubs, staleness), a `graph` tool (query/explain/path/status via the pinned graphify
Python), `/graph` + `/graph update`, and session-start `graphify reflect --if-stale`.
`graphify hook install` wired a post-commit hook into `.pi-vcs/hooks/` (AST re-extract
+ recluster on every autocommit snapshot, no LLM), hardened with a harness-local
doc-extension filter: graphify's .md structural extractor otherwise REPLACES the
semantic (LLM-authored) doc layer via replace-on-re-extract (observed live — 22 edges
lost, giant component 615→126; re-apply the filter if `graphify hook install` is re-run).
The generated post-checkout hook was deleted for the same reason (its full-rebuild path
re-extracts .md; this repo is linear, no branch switching). A doc-flag section touches
`graphify-out/needs_update` when .md/image files change so the bridge surfaces
"STALE — run /graphify --update"; `/graph update` likewise passes an explicit code-only
changed_paths list so it can never touch doc semantics. `schema/manifest.json`
layout.known += `graphify-out`, `git`, `npm`; `.gitignore` += `graphify-out/`. Files:
`extensions/graphify-bridge.ts` (new), `.pi-vcs/hooks/post-commit` (new),
`.gitignore`, `schema/manifest.json`,
`docs/config-index.md`. Why: the harness now retrieves knowledge about itself from a
~30x-cheaper graph instead of re-reading files, keeps that graph current
automatically, and audits its own structure (hubs, staleness, query lessons).


**Role rename: `solo-engineer` → `engineer`, `builder` → `worker`; peer-engineer bumped to gpt-5.5-pro.**
`agents/solo-engineer.md` renamed to `agents/engineer.md` and `agents/builder.md` renamed
to `agents/worker.md` (frontmatter `name:` and internal self-references updated to match);
`agents/peer-engineer.md` model bumped from `openai/gpt-5.5:xhigh` to
`openai/gpt-5.5-pro:xhigh`. All role-name references (exact names and prose/plural forms:
`builder`/`builders`/`builder-tier`, `solo-engineer`) swept across `AGENTS.md` (routing
table, roster table, escalation, rework loop, defaults), `docs/rework-loop.md`,
`docs/config-index.md` (Feature index only), `README.md`, `prompts/{build,design,feature,ship}.md`,
`extensions/subagent/index.ts`, `extensions/read-only-default.ts`, and
`extensions/heuristics/{sanitize.ts,DESIGN.md}` (prose/comments only). Files:
`agents/engineer.md` (was `solo-engineer.md`), `agents/worker.md` (was `builder.md`),
`agents/peer-engineer.md`, `AGENTS.md`, `docs/rework-loop.md`, `docs/config-index.md`,
`README.md`, `prompts/build.md`, `prompts/design.md`, `prompts/feature.md`,
`prompts/ship.md`, `extensions/subagent/index.ts`, `extensions/read-only-default.ts`,
`extensions/heuristics/sanitize.ts`, `extensions/heuristics/DESIGN.md`. Not touched:
TS identifiers/constants tied to the old name (`extensions/heuristics/schema.ts`
`BUILDER_WATCH_CALLS`/`matchesBuilderRole`, `extensions/heuristics/index.ts`
`builderWatch`) and the unrelated generic-English "builder" in
`extensions/heuristics/inject.ts` ("Injection block builder for...") — out of scope,
since retargeting the S4 role-detection regex to also match `worker` is a design
decision, not a mechanical rename. Why: shorter, less overloaded role names
(`engineer`/`worker` vs. `solo-engineer`/`builder`) and the newer, stronger
`gpt-5.5-pro` catalog model for the peer role.

**Doctrine rewrite: lean scale-first AGENTS.md; roster cut to seven roles; `qa-reviewer` → `reviewer`.**
`AGENTS.md` rewritten from scratch (~416 → ~140 lines): philosophy (fable touches each task
exactly twice — dispatch and judge), Delegation Gate, write-gate pre-flight, intent
interview (user interview replaces scope-planner), a scale-first routing table
(micro → one builder; standard single-session chain as THE DEFAULT; large → interview +
optional design-only solo-engineer + fan-out + reviewer gate), seven-role table, fable
budget invariants (≤1 read ≤50 lines, front-loaded spec quality, batched dispatch, blind
fan-out), escalation, dispatch contract, rework loop, defaults, and enforced-in-code
one-liners. `agents/scope-planner.md` and `agents/architect.md` deleted (architect →
design-only `solo-engineer` dispatch; scope → user interview); `agents/qa-reviewer.md`
renamed to `agents/reviewer.md` (same charter, verdict pinned to PASS / FAIL:
implementation / FAIL: design); `finalizeQaOutput` in `extensions/subagent/index.ts` now
keys on agent name `reviewer`. Files: `AGENTS.md`, `agents/*` (7 remain), `extensions/subagent/index.ts`,
`docs/rework-loop.md`, `docs/config-index.md`, `README.md`, `prompts/{build,design,feature}.md`.
Why: leaner doctrine — the single chain is the default that gets escalated up, not a
pipeline pruned down.

**Fable token economy: `verifier` role added; `fable-engineer` demoted to opt-in.**
Added `agents/verifier.md` (sonnet, read/run-only): the cheap post-build spot-check tier
that runs the acceptance path plus targeted reads and returns a first-line PASS/FAIL with
`file:line` evidence, never editing — distinct from the `qa-reviewer` deep-review gate
(its name stays hardcoded in `finalizeQaOutput`, untouched). `agents/fable-engineer.md`
is now opt-in only (description + charter): dispatched solely with explicit user approval,
since it is the only subagent spending orchestrator-tier tokens. `AGENTS.md` reworked to
minimize fable read/turn cost: Delegation Gate micro/single-session/full-pipeline bullets
(single-session is now a `solo-engineer` → `verifier`/`qa-reviewer` chain; escalation to
fable now requires user approval, no auto-escalation), new "Fable Token Economy" subsection
(read ≤50 lines then `scout`, never verify by reading, batch all dispatch into one
parallel/chain call, rework is one chain), Role Split table (nine roles; verifier row +
fable opt-in note), Routing Rules (verification split gate-tier/spot-check-tier), Hard
Delegation Thresholds (scout read-budget 100+ → ≤50 lines), Rework Loop (each iteration is
one chain), and Defaults (parallel/chain mandates, verification never spends lead tokens,
fable opt-in). Files: `agents/verifier.md` (new), `agents/fable-engineer.md`, `AGENTS.md`,
`docs/config-index.md`. Why: the lead is the only orchestrator-tier context in play, so its
reads, serial dispatches, and self-verification were the session's most expensive tokens.
No extension/schema/settings changes.

**Enforcement catches up to doctrine; architect narrowed; shipper folded into builder.**
`extensions/subagent/index.ts` now auto-appends a standing hygiene/return-contract footer
(`STANDING_CONTRACT_FOOTER`) to every dispatched task, and normalizes qa-reviewer returns
with a `[VERDICT: ...]` first line plus a session-level consecutive-FAIL loop budget of 3
(`finalizeQaOutput`; ceiling: per-session and consecutive only, mid-chain qa steps not
counted). `extensions/read-only-default.ts` hard-blocks `edit`/`write` tool calls whenever
the lead model is fable, in all gate modes, exempting spawned children via `PI_SUBAGENT=1`.
`agents/architect.md` narrowed to exactly three dispatch cases (design fanning to 2+
builders, `FAIL: design` bounce, blind fan-out with peer-engineer); `agents/shipper.md`
deleted, its duties folded into a new "Shipping" section in `agents/builder.md` (the
implementing builder ships after review passes). Added `docs/delegation-contract.md`
(canonical dispatch template). `AGENTS.md` and `docs/rework-loop.md` synced throughout
(Delegation Gate pipeline list, Role Split table, Routing Rules, Rework Loop, Delegation
Contracts, Standing Orders). Files: `extensions/subagent/index.ts`,
`extensions/read-only-default.ts`, `agents/architect.md`, `agents/builder.md`,
`agents/shipper.md` (deleted), `docs/delegation-contract.md`, `docs/rework-loop.md`,
`AGENTS.md`, `docs/config-index.md`. Why: code shipped ahead of docs; this closes the gap
and prunes a redundant role. Follow-up same day: parallel-mode result assembly in
`extensions/subagent/index.ts` no longer runs `finalizeQaOutput` on failed subprocess
results (a crashed qa-reviewer's error text could mutate the FAIL counter); `prompts/ship.md`,
`prompts/build.md`, `prompts/feature.md` updated to delegate shipping to "builder" instead
of the deleted "shipper" role.

**Doctrine suite is manual-only, not routine validation.** `AGENTS.md` →
Config Maintenance no longer tells the agent to auto-run
`~/orch-bench/probes/run_probes.py` after doctrine edits; it now spends real
tokens only when the user explicitly asks. Files: `AGENTS.md`. Why: the
probe suite makes live model calls ($1–$8/run) and was being triggered
automatically as part of the post-edit flow.

**Read-only `scout` agent for investigation at volume.** Added
`agents/scout.md` (sonnet, read-only fact-finding, returns `file:line`
findings); `AGENTS.md` routing/Context Hygiene now name `scout` as the
concrete dispatch target and close the "targeted reads" loophole. Why: the
fable lead was doing bulk exploration itself — no mechanical read-only agent
existed to trigger. Follow-up same day: routing rule now allows parallel
scout fan-out for independent questions (single coherent trace stays with
one scout).

### 2026-07-03

**Orchestrator realignment: lead context hygiene.** `AGENTS.md` (Philosophy,
Orchestrator tier row, Routing Rules, scoping rule, new "Context Hygiene" MUST
block, Defaults). Why: user flagged fable-lead drift — doing bulk
reading/investigation itself; per the "Use Fable 5 where it pays for itself"
paradigm the lead now delegates heavy reading too and consumes only compressed
findings, keeping benchmarked solo-first routing intact.

**QA gate relaxed: any new feature is QA-mandatory.** `AGENTS.md` (Hard Delegation
Thresholds + micro-dispatch rule + Rework Loop heading), `docs/rework-loop.md` (loop now
covers solo builds; "implementing agent" replaces builder-only routing). Why: user
directive — run the qa-reviewer/rework loop after any newly implemented feature,
regardless of scale or a runnable acceptance path; spot-check now covers only
non-feature changes.

**~22:55 — Changelog backfilled (this entry).** Reconstructed the full
pre-index history below from `~/.pi/agent/sessions/` logs, ~370 auto-snapshot commits
(point-in-time count), file birth times, and the heuristics store. Files: `docs/config-index.md`.
Why: git history only begins 2026-07-03 15:41 (repo init), but the config was
built across ~2 days of sessions — the semantic arc needed to be auditable.

**~22:52 — Workflow heuristic: review git status before autocommit.** Captured via
`learn_heuristic` to `~/.pi/heuristics/heuristics.jsonl` — "Always run git status and
review changes before making an automatic commit." No code change; `.pi-vcs/autocommit.sh`
itself was not modified. Session: "always check git status before auto commit".

**~22:50 — Config index created (baseline).** `docs/config-index.md` — the
feature→files→purpose map plus this changelog, per AGENTS.md → Config Maintenance.
Session: "create some sort of index/mapping so future sessions can fully audit".
All entries dated below this one are reconstructed after the fact **(backfilled)** —
not written contemporaneously; use `git log` in ~/.pi/agent for the raw diffs.

**~22:44 — Model-cycle order finalized + rework-loop doc.** (backfilled)
Shift+Tab cycle pinned to sonnet-5 → opus-4-8 → fable-5 → gemini-3.5-flash → gpt-5.5
(`settings.json` `enabledModels`, `extensions/model-cycle.ts`); `docs/rework-loop.md`
formalized the qa-reviewer PASS / FAIL:implementation / FAIL:design verdict contract.

**~22:34 — Task tracker extension.** (backfilled) `extensions/task-tracker.ts` —
demo `task` tool + `/tasks` command; state lives in tool-result details so branch/rewind
stays correct. Session: "add task tracker to pi tui".

**~21:16–22:16 — Solo/fable engineer roles added.** (backfilled)
`agents/solo-engineer.md` (renamed from a short-lived `opus-engineer.md`) and
`agents/fable-engineer.md`; `AGENTS.md` tiers updated. Why: a single-session
whole-task tier and a highest-stakes orchestrator-tier solo tier, beyond the
scope-planner→…→shipper pipeline. Surfaced during the "fix scrollbar jumping" work.

**~21:28–22:21 — pi-tui scrollback fix documented + harness.** (backfilled)
`patches/pi-tui-scrollback-fix.md` + `…-harness.mjs` / `….harness.mjs`. Documents and
regression-tests a manual patch to the installed `pi-tui` dist that stops
scrollback-wiping full redraws when content above the viewport changes; must be
re-applied after pi updates. Session: "fix entirely with claude fable (bypass pipeline)".

**~18:58 — Shared format helpers extracted.** (backfilled) `extensions/lib/format.ts` —
duration/token/cwd formatters shared by several extensions (kept outside `extensions/*.ts`
so it isn't auto-loaded as an extension). Extracted during the "fable should never manually write code" session.

**~17:43 — Model-awareness extension.** (backfilled) `extensions/model-awareness.ts` —
injects the live active model into the system prompt so the Delegation Gate's model
checks stay correct after a mid-session Shift+Tab switch. Session: "pi should always
recognize current model … subagent orchestration does not trigger when fable is selected".

**~17:13–17:37 — Config governance: schema + validator + README.** (backfilled)
`schema/*.schema.json`, `schema/manifest.json`, `scripts/validate-config.py`, `README.md`,
`.gitignore`, and a validator-gating `.pi-vcs/hooks/pre-commit`; heuristics store/command/index
reworked to harness scope; `agents/peer-engineer.md` added. Why: standardize the directory
layout and enforce malleable, manifest-driven schema validation for auditability. Session:
"initialize and organize pi configuration. standardize directory and enforce malleable schema".

**~15:52–16:25 — Continuous-learning heuristics extension.** (backfilled)
`extensions/heuristics/{DESIGN.md,schema.ts,sanitize.ts,store.ts,inject.ts,index.ts,command.ts}`
+ `heuristics/heuristics.jsonl`. `learn_heuristic` tool, before-agent injection of a
"Learned heuristics" block, capture/sanitize/dedup pipeline, and the `/heuristics` command.
DESIGN.md spec came first (~15:21). Session: "I want pi to continuously learn and improve".

**~16:16–17:05 — Chat-title header extension.** (backfilled) `extensions/chat-title.ts`
(evolved from a short-lived `chat-descriptor.ts`) — sets the iTerm2 tab/window title to
project + condensed last prompt, prefixed with a live session timer. Sessions: "add summary
descriptor of chat to iterm2 window header", "add session running timer to window header".

**~14:32–17:47 — Write-gate (confirm-by-default) extension.** (backfilled)
`extensions/read-only-default.ts` (consolidated from earlier `confirm-edits.ts` /
`edit-mode.ts` / `read-edit-mode.ts` experiments). New sessions start in confirm mode;
`/write` `/confirm` `/read-only` (and Ctrl+\`) switch modes; confirm mode still allows
read-only bash. Sessions: "how to stop pi auto edit", "default pi mode should be full
read + confirm write", "allow confirm mode to use read only bash commands".

**~15:41 — Version-control infra: git + launchd autocommit.** (backfilled)
`.pi-vcs/autocommit.sh`, `.pi-vcs/hooks/pre-commit`, `extensions/pi-vcs-breadcrumb.ts`.
Set up git tracking of `~/.pi/agent` (remote `github.com/hari3mo/pi`, commits authored by the
user), launchd-triggered auto-snapshots, and a breadcrumb log of tool-touched files folded
into commit messages. Initial snapshot committed 15:41. No logged session captured the request; files born 15:41 (initial snapshot cf16e55).

**~14:51 → evening — Minimal UI + Porcelain themes.** (backfilled)
`extensions/minimal-ui.ts`, `themes/porcelain.json`, `themes/porcelain-light.json`.
Quiet one-line footer + grayscale breathing working-indicator, `/minimal-ui` toggle; later
revisions added thinking-level display, session time, and softened/then removed the prompt-bar
thinking animation. Session: "comprehensive redesign of pi tui. award-winning, minimal design".

**~14:50 — Model-cycle extension + keybinding rebinds.** (backfilled)
`extensions/model-cycle.ts`, `keybindings.json`. Shift+Tab cycles the pinned model list;
`app.thinking.cycle` rebound to Option+Tab (and later `app.session.rename` to Option+R) to
free Shift+Tab and resolve a Ctrl+R built-in conflict. Session: "remove rainbow from hari3mo,
change to harimo everywhere".

**~14:36 → evening — Delegation doctrine: AGENTS.md + roles + prompts.** (backfilled)
`AGENTS.md`, `agents/{scope-planner,architect,builder,qa-reviewer,shipper}.md`,
`prompts/{design,build,ship,feature}.md`, and the `extensions/subagent/` tool. Model-tier
hierarchy from the "Fable 5 where it pays" article; the Delegation Gate (pipeline only when
lead is fable, or opus past a complexity test), model-switch order, read/write-mode rules, and
a request-write-mode selection prompt were layered in across the day.

**~00:06 → ~21:00 — Void black-hole landing page.** (backfilled)
`extensions/void-blackhole.ts` (+ `extensions/_void_harness.mts` test harness). Animated ASCII
black-hole / accretion-disk `/void` screensaver + starfield with a "harimo" wordmark; many
refinements (constellations, keypress-to-quit, realism, 3D wordmark, shimmer, contrast).
Session: "add animated black hole from void to pi cli".

**by ~15:41 — Focus chime + session receipt (approx).** (backfilled)
`extensions/focus-chime.ts` (macOS notification when a turn exceeds 25s; `/chime`) and
`extensions/session-receipt.ts` ("shop receipt" summary; `/receipt`, later extended to include
subagent cost). Both present in the initial 15:41 snapshot; exact creation session not isolated.

### 2026-07-02

**~22:40 — Custom header banner.** (backfilled) `extensions/custom-header.ts` — replaces pi's
built-in header with a figlet "harimo" banner + greeting/cwd/aphorism subtitle (later extended
to hide the startup [Skills]/[Prompts]/[Extensions]/[Themes] sections). Earliest surviving
custom extension. Sessions: "add ascii art of pi symbol to start page", "creative custom touches to pi".

**~20:49 — First pi customizations (approx).** (backfilled) `settings.json` (ASCII-art launch,
provider/model defaults) plus early experiment extensions `claude-statusline.ts` and `effort.ts`
(both later removed). The starting point of the config. Sessions: "hi" (~20:49) and "set pi ascii art on launch" (~21:57).
