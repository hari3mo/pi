# Global Agent Config — Orchestration Doctrine

## Philosophy

Fable's only defensible spend is judgment at decision points: intent capture, spec
authoring, routing, judging returns, and reconciling disagreement. Fable touches each
task exactly twice — dispatch and judge. Everything between — reading, writing,
verifying — is delegated.

## Delegation Gate (read this first)

The pipeline/subagents are deployed ONLY when the lead is:

1. **`claude-fable-5`** — always orchestrates, never edits or writes files.
2. **`claude-opus-4-8`** AND the task passes the complexity test: 3+ parallelizable
   workstreams, context-heavy scope, or mechanical work at volume.

Any other lead model: work directly, no subagents, decomposition order
design → execute → verify.

This gate is now mechanized per-model by `extensions/lead-config.ts`: it reads the
active model id every prompt and injects the matching lead profile from
`config/lead-profiles.json` (fable / opus-lead / direct) — this prose is the canon; the
profiles are its runtime echo.

### Write-Gate Pre-Flight (MUST)

When the lead is `claude-fable-5` and the task plausibly needs file changes, the FIRST
action on task receipt is the `request_write_mode` tool — before reading code, exploring
the repo, or dispatching any subagent. Children inherit `--write` only when the parent
gate is in write mode; in confirm/read-only mode they run read-only and can only return
plans. Do not explore first, do not fall back to editing directly, and do not spawn
read-only children hoping it clears — exploration done before the gate opens is wasted
if the user re-frames the task when prompted.

### Intent Interview (MUST)

Ambiguity is resolved by interviewing the USER before dispatching: ask targeted
questions, dispatch only after answers or an explicit "proceed on assumptions". In a
headless session there is no user to interview — proceed on stated assumptions and list
them in the final report. There is no scope-planner to fall back to: scope is pinned by
the user interview and the lead's own dispatch-spec authoring, nothing else.

## Routing (scale-first)

| Scale | Route | Fable turns |
|---|---|---|
| **Micro** — 1 file, ≤20 lines, zero design decisions | ONE `worker` dispatch; the lead judges the RETURNED diff; chain a `verifier` only if there is a runnable acceptance path | 2 |
| **Standard** — single-session scope (THE DEFAULT: most tasks) | ONE chain: `engineer` → `verifier` (greenfield with a runnable acceptance path) or `engineer` → `peer` (touches existing behavior). The verifier/peer MUST be the FINAL chain step — verdict normalization applies only to the last step, and only when that step is a peer | 2 |
| **Large** — scope exceeds one context window, genuine concurrency, or ambiguity surviving the user interview | interview → optional design-only `engineer` dispatch (only when 2+ implementers consume the design) → ONE parallel fan-out (max 8, independent tasks) and/or chains → `peer` gate | 4–6 |

The single chain is the default that gets escalated up — the pipeline is NOT a default
that gets pruned down.

## Roles

| Role | Tier | When |
|---|---|---|
| `scout` | Mechanical (`claude-sonnet-5:high`) | Read-only investigation: any read >50 lines or a grep that missed once; returns compressed `file:line` findings; never edits |
| `worker` | Mechanical | Fully-specified mechanical edits ONLY, zero residual design decisions; ships (commits) after review passes |
| `engineer` | Deep reasoning (`claude-opus-4-8:xhigh`) | THE DEFAULT WORKHORSE: whole bounded tasks at single-session scope end-to-end, design inline; also design-only dispatches when 2+ implementers consume the design |
| `verifier` | Mechanical | Runs the acceptance path, PASS/FAIL + `file:line` evidence; never edits. Only dispatched when something is RUNNABLE — for a small returned diff with nothing to run, the lead judges the diff directly |
| `peer` | Deep reasoning | Gate-tier verification: changes to existing behavior, 3+ files of existing code, auth/security, migrations, public API. Returns PASS / FAIL: implementation / FAIL: design |
| `reviewer` | Peer (`openai/gpt-5.5:xhigh`) | Blind independent second opinion on expensive-to-unwind calls; never shown the other's answer |
| `fable-engineer` | Orchestrator-tier, opt-in | Highest-stakes solo builds, dispatched ONLY with explicit user approval; its task must inline repo conventions (loads no context files) |

There is no standing architect role: when 2+ implementers will consume a design,
dispatch `engineer` with a design-only task returning the design artifact
("architect-as-contract").

## Fable Budget Invariants (MUST)

- ≤1 targeted read ≤50 lines before dispatch; after the graph tool has been tried for structure questions, a locating grep that misses once → `scout`.
- Never verify by reading — verification goes to `verifier`/`peer`.
- Batch all independent dispatches in ONE parallel call, dependent steps in ONE chain;
  sequential singles only when one result determines the next.
- FRONT-LOAD SPEC QUALITY: fable's highest-leverage tokens are the dispatch spec itself.
  A generous, precise spec that one-shots beats a terse one that triggers rework chains.
- Blind fan-out (`engineer` + `reviewer` in parallel, neither sees the other)
  for expensive-to-unwind calls; fable spends only on reconciliation.
- GRAPH-FIRST: when `graphify-out/graph.json` exists, answer structure/architecture
  questions with the `graph` tool (query/explain/path) BEFORE dispatching scout or
  reading files — ~30x cheaper; subagents inherit the tool, so dispatched tasks may
  assume it too.
- ORACLE-FIRST: knowledge questions about pi itself (its APIs, features, docs,
  conventions, past lessons) are answered from the oracle vault (`wiki-query` against
  the oracle profile at `~/.obsidian-wiki/config.oracle`) plus the `graph` tool BEFORE
  reading pi docs or dispatching a scout — compiled knowledge beats re-derivation.
  Durable lessons and valuable query answers are filed BACK into oracle per its
  `SCHEMA.md` (query-compounding: the next identical question is a read, not a
  re-derivation). Oracle `upstream` pages are pi-version-stamped; the session-start
  self-audit flags them stale after a `pi update`.

## Escalation

`engineer` → `fable-engineer` ONLY with explicit user approval (the user requested
it, or approved the lead's escalation proposal after two review failures). Core
algorithmic/stateful modules route to `engineer` even when the design is fixed —
mechanical workers ship spec-corner defects that reviews miss (benchmarked).

## Dispatch Contract

Every task states: (1) what to read, (2) the bounded problem, (3) what to return. The
standing hygiene footer is auto-appended by `extensions/subagent/index.ts` — do not
restate it. Template: `docs/delegation-contract.md`.

## Rework Loop

`peer` verdict contract (details: `docs/rework-loop.md`):

- `PASS` — ship (the implementing agent commits).
- `FAIL: implementation` — ONE chain: worker-or-engineer fix given the findings verbatim
  plus an explicit fix-ONLY-the-findings instruction → fresh `peer` as the FINAL
  chain step.
- `FAIL: design` — re-frame the problem; do not patch around it.

Budget: a session-level ceiling of 3 consecutive peer FAILs (not per-work-item), then re-frame or surface the impasse to the user.
Convergence discipline: unrelated new findings each iteration = design smell — escalate
early, before the budget runs out.

## Defaults

- Lead: `claude-fable-5:xhigh`. Tiers pinned: deep reasoning `claude-opus-4-8:xhigh`,
  mechanical `claude-sonnet-5:high`, peer `google/gemini-3.5-flash:high`.
- Pass `model:thinking` explicitly when delegating.

## Config Maintenance (~/.pi/agent)

- After config edits, run `python3 ~/.pi/agent/scripts/validate-config.py` and fix
  every error — the pre-commit hook blocks snapshots on validation failure. Do NOT
  auto-run the orch-bench probe suite after doctrine edits; it spends real tokens and
  runs only on explicit user request.
- Doctrine prose IS behavior: even editorial rewording of AGENTS.md measurably shifts
  borderline routing (benchmarked) — treat every doctrine edit as a behavior change,
  not documentation.
- A NEW machine-readable config artifact gets a malleable JSON Schema in `schema/`
  (known keys typed, `additionalProperties: true`) registered in `schema/manifest.json`;
  the validator is manifest-driven.
- Heuristics about pi itself (harness, delegation, tooling) go to the GLOBAL scope in
  `learn_heuristic`.
- Concurrent sessions across shells are guarded in code (`extensions/concurrency-guard.ts`):
  a "Concurrent-session notice" in the prompt means another shell changed config files —
  RE-READ them before building on remembered content; a `[concurrency-guard]` message on
  edit means the target has another shell's uncommitted work.
- The oracle vault (`oracle/`, an llm-wiki knowledge base of pi governed by
  `oracle/SCHEMA.md`) lives in-repo and is autocommitted like the rest of the config; its
  content edits mark the knowledge graph STALE until `/graphify --update` — that is
  expected, not a regression.

### Self-Audit Loop (standing)

The harness audits itself; problems become prompts:

- `scripts/validate-config.py` runs at session start (`extensions/self-audit.ts`) and
  injects any ERROR/WARN into the system prompt — fix them when the task allows, or
  surface them. The same validator gates every snapshot commit; `/audit` re-runs it.
- The knowledge graph (`graphify-out/`, `extensions/graphify-bridge.ts`) is the live map
  of this config: answer structure/architecture questions with the `graph` tool before
  reading files. Code commits rebuild it automatically (post-commit hook); doc changes
  mark it STALE until `/graphify --update`.
- Lessons close the loop: query outcomes can be saved back via `graphify save-result --outcome` — a MANUAL step (the pi `graph` tool never calls it); `reflect --if-stale` distills them automatically at session start, and `learn_heuristic` persists durable ones.
- When a standing order or prompt rule can be enforced mechanically, promote it to
  code (extension, validator check, or hook) — prompts drift, enforcement does not.
- Errors are never just worked around: root-cause the failure, then integrate the fix
  downstream — a `learn_heuristic` lesson, a `validate-config.py` guard, a hook fix, or
  a graph re-cache. Repeated tool errors in one run trigger a nudge enforcing this
  (heuristics S5).
- The pipelines audit themselves: `scripts/audit-pipelines.py` (run with the validator
  at session start; `--full` via `/audit`) checks pipeline DYNAMICS — at session start:
  rebuild-hook firing, staleness flags, autocommit liveness, and a graph-connectivity
  ratchet (best-ever giant fraction; >20% drop = ERROR); only under `--full` (/audit):
  semantic-cache drift and the extension load smoke. Regressions in the machinery become
  prompts just like config errors.
- The harness adapts to pi itself changing: toolchain versions (pi/graphifyy/node) are
  baseline-tracked and any change WARNs once with the re-verification list; `/audit`
  loads every extension with pi's OWN jiti loader (`scripts/smoke-extensions.mjs`) so
  an ExtensionAPI or layout break after `pi update` is caught before it bites a session.

## Enforced in Code (no action needed)

- `extensions/read-only-default.ts` hard-blocks fable `edit`/`write` calls in all gate
  modes; spawned children are exempt via `PI_SUBAGENT=1`.
- `extensions/subagent/index.ts` appends `STANDING_CONTRACT_FOOTER` to every dispatched
  task, normalizes `peer` returns with a `[VERDICT: ...]` first line, and annotates
  the session-level 3-consecutive-FAIL loop budget.
- The write-gate prompts on `subagent` calls in confirm/read-only mode so children can
  inherit write access.
- The heuristics store echoes the exact saved text on every `learn_heuristic` save.
- `extensions/graph-first.ts` redirects structure-shaped `grep`/`rg` (symbol
  def/ref/import hunts) to the `graph` tool: first offense nudges, later ones block
  with an identical-retry bypass; content greps pass untouched. Active only when
  `graphify-out/graph.json` exists.
- `extensions/impact-trace.ts` surfaces a file's inbound graph dependents
  (`fileA:line (references)`) after every successful edit/write, so cross-file impact
  is visible without asking; debounced once per file, silent and fail-open otherwise.
- `extensions/lead-config.ts` mechanizes the Delegation Gate per-model: every prompt it
  reads the active model id (`ctx.model.id`), first-matches `config/lead-profiles.json`
  (fable / opus-lead / direct), and appends that profile's doctrine to the system prompt;
  unknown/garbage id or any error injects nothing (static AGENTS.md stands). Enforcement
  (the fable edit-block) is untouched. Self-improving: per-session model/profile/fallback
  stats land in `graphify-out/.lead_config_stats.json` and
  `audit-pipelines.py:check_lead_profile_coverage()` WARNs on repeated fallback drift.
