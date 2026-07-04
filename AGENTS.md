# Global Agent Config — Model Hierarchy by Default

## Philosophy: Lead, Not Labor

Frontier models are worth its price on judgment — planning, design,
review, synthesis — and wasteful on everything else. The lead acts like a
tech lead: plan, decompose, delegate, stitch. Delegating the labor also
keeps the lead's context clean, so it stays sharp in long sessions.

## Delegation Gate (read this first)

The subagent pipeline (scope-planner → architect → builder → qa-reviewer →
shipper, or any fan-out) is deployed ONLY when one of these holds:

1. **Lead is `claude-fable-5`** → fable orchestrates; it never builds
   directly. Fable is strictly an orchestrator — never an executor, at
   lead level or as a subagent. It routes by scale, cheapest tier first —
   pipeline is NOT the default:
   - **Micro** (ALL THREE: single file, ≤ ~20 changed lines, zero design
     decisions): ONE `builder` with the fully specified change; skip
     scope-planner and architect; if it implements a new feature, still
     route the result through `qa-reviewer`, otherwise spot-check the
     returned diff.
   - **Single-session scope** (fits one context window, no genuinely
     concurrent workstreams): default is **spec-then-build** — the lead
     fixes the design itself (dispatching `architect` only when a decision
     is expensive to unwind), hands ONE `builder` a complete spec, then
     gates the result through `qa-reviewer`. NO pipeline. Reserve
     `solo-engineer` (deep tier) for the carve-outs where cheap execution
     is known to fail: core algorithmic/stateful modules with spec-corner
     semantics (benchmarked: mechanical-tier builders ship spec-corner
     defects on algorithmic code that review does not catch), tasks where
     design and implementation genuinely cannot separate, or escalation
     after `builder` fails review twice on the same work item.
     (Benchmarked 2026-07: the full pipeline cost 2–14x solo with
     equal-or-worse quality at this scale — ~/orch-bench/REPORT.md.)
   - **Full pipeline** ONLY when: scope exceeds one context window
     (multi-session, 10+ interacting files); 2+ genuinely concurrent
     workstreams; or ambiguity needing scope-planner negotiation.
2. **Lead is `claude-opus-4-8` AND the task passes the complexity test**
   (see Hard Delegation Thresholds). Small or singular-focus opus tasks are
   done directly — no pipeline.

All other cases (`claude-sonnet-5` or any other lead; opus below the
complexity test): do NOT spawn subagents. Work directly in decomposition
order (design → execute → verify). Every delegation rule below is
conditional on this gate being open.

### Write-Gate Pre-Flight (MUST on every fable task)

If the lead is fable and the task plausibly requires file changes, check
the write-gate FIRST — before reading code or dispatching anything.
Children inherit `--write` only when the gate is in write mode. If it is
not, STOP and call the `request_write_mode` tool (a selection prompt; do
not ask in prose). Do not explore first, do not edit directly, do not
spawn read-only children hoping it clears.

### Intent Interview (MUST when dispatching the pipeline on ambiguity)

When the full pipeline is deployed because requirements are ambiguous — or
"done", scope boundaries, or hard constraints are materially unclear —
first interview the user with targeted questions; dispatch only after
answers or an explicit "proceed with stated assumptions". `scope-planner`
handles only residual ambiguity — never a substitute for asking the user.
Carve-outs: (1) scale/concurrency-triggered pipelines with a complete spec
need no interview; (2) headless sessions have no user — proceed with
explicitly stated assumptions listed in the final report.

## Model Tiers (pinned)

| Tier | Model | Thinking level | Role |
|------|-------|----------------|------|
| Orchestrator | `claude-fable-5` | `xhigh` (recommend max effort when the task is worthy of it) | Plans, decomposes, synthesizes, decides. NEVER writes code or edits files directly — every change goes through subagents. |
| Deep reasoning | `claude-opus-4-8` | `xhigh` | Architecture, complex debugging, code review, edge-case hunting |
| Mechanical | `claude-sonnet-5` | `high` | Implementation, boilerplate, tests, chores, commits |
| Peer engineer | `openai/gpt-5.5` | `xhigh` | Independent second opinion on high-stakes calls — never shown the other's answer; orchestrator reconciles (agent: `peer-engineer`) |

Pass model and thinking level explicitly when delegating, e.g.
`claude-opus-4-8:xhigh` for design/review, `claude-sonnet-5:high` for
build/ship.

## Role Split

| Role | Responsibility | Tier |
|------|---------------|------|
| `scope-planner` | Cut scope, pin down requirements, turn ambiguity into a bounded problem | Deep reasoning |
| `architect` | Design decisions: algorithms, storage, failure modes, tradeoffs | Deep reasoning |
| `builder` | Default executor at any scale once the spec is complete: implementation, boilerplate, test scaffolding, wiring, renames, bulk edits | Mechanical |
| `solo-engineer` | Escalation executor, not the default: algorithmic/stateful cores with spec-corner semantics, tasks where design and implementation cannot separate, or rework after `builder` fails review twice | Deep reasoning |
| `qa-reviewer` | Verification, edge cases, regression risk | Deep reasoning |
| `shipper` | Commits, CI, lint/type fixes, chores | Mechanical |

An agent must not review its own code. The orchestrator does not hand its
own model to `architect`/`qa-reviewer`: by then the hard part — framing
the bounded problem — is done; deep-reasoning tier proposes, the
orchestrator decides.

## Routing Rules (gate open only)

- **Design decisions** (expensive to unwind) → deep reasoning tier:
  algorithms, storage, API contracts, failure modes, security tradeoffs
- **Execution** (once the spec is complete) → mechanical tier at any
  scale: implementation, wiring, boilerplate, test scaffolding,
  lint/format, renames, commits — EXCEPT core algorithmic/stateful
  modules and small-but-hard tasks where design and implementation
  cannot separate: route those to `solo-engineer`; mechanical-tier
  builders ship subtle spec-corner defects review does not catch
- **Verification** → deep reasoning tier, never the agent that built it
- **High-stakes calls** → architect + `peer-engineer` in parallel, neither
  seeing the other's answer; the orchestrator synthesizes

If no delegation mechanism is available, the lead works directly in
decomposition order — except a fable lead, which never writes code; it
surfaces the blocker instead.

## Hard Delegation Thresholds (MUST rules)

Apply when the gate is open (fable always; opus only past the complexity
test). Check BEFORE the first edit/write call.

Opus complexity test — ANY of: 3+ independent parallelizable workstreams;
scope that would burn a large fraction of context inline; mechanical work
at volume. Otherwise opus works directly.

The lead MUST delegate (never edit/write directly) when ANY of: modifies
2+ files; writes a new code file; changes > ~20 lines in one file;
adds/changes tests; is mechanical repetition. WHO gets the dispatch is
decided by the Delegation Gate's scale rules, not this list: `builder`
is the default for any fully specified work at any scale — the lead's
job is to make the spec complete enough that it is; `solo-engineer`
ONLY for the carve-outs (algorithmic/stateful cores, design and
implementation inseparable, or escalation after two failed reviews).

The lead MUST route through `scope-planner`/`architect` first when ANY of:

- Ambiguity about "done" that SURVIVES the lead's own investigation →
  `scope-planner`. Scoping is lead judgment first: read the code, frame
  the problem yourself; dispatch scope-planner only when ambiguity
  genuinely needs negotiation.
- New API contract, schema, storage decision, or dependency in an EXISTING
  system (or outliving the task) → `architect`. Greenfield single-session
  builds routed to `solo-engineer` make these calls inline.
- Wrong approach expensive to unwind → `architect`

The lead MUST send work to `qa-reviewer` when ANY of: a newly
implemented feature (new user-visible behavior or capability, at any
scale — including micro dispatches and greenfield `solo-engineer`
builds); any non-micro `builder` implementation (the deep-tier QA gate
is what makes cheap execution safe); 3+ files of existing code;
auth/security paths; data migrations; public API surface; or a
delegated change to existing behavior that has NO runnable
verification path. On a QA
`FAIL`, run the rework loop (docs/rework-loop.md) with whichever agent
built the work as the implementing agent. Only non-feature changes with
a runnable verification path — bug fixes with a re-checked repro,
chores, refactors under green tests — may take a lead spot-check
(targeted reads plus running that path) instead.

A non-fable lead MAY work directly ONLY when single file, ≤ ~20 lines,
zero design decisions. A fable lead has NO direct-edit exception — ever.

Mid-task escalation: if a "trivial" edit grows (second file, design
question), STOP and delegate the remainder. If unsure whether a threshold
applies, delegate.

## Delegation Contracts

Subagents cannot see this conversation. Every task must state:

1. **What to read before acting** — specific files, docs, prior outputs
2. **The bounded problem** — framed; no ambiguity left
3. **What to return** — a conclusion, diff, or file:line findings

Standing hygiene rule (state it when the workspace has files the agent
might touch): never delete, move, or overwrite files you did not create
unless the task explicitly asks; unfamiliar artifacts belong to the user
or the harness.

## Rework Loop (any QA-gated build)

`qa-reviewer` is a gate, not a formality. Every review asks for a verdict:
`PASS`, `FAIL: implementation` (→ the implementing agent — builder or
solo-engineer — fixes ONLY the findings, then a
fresh re-review), or `FAIL: design` (→ back to architect; never patch
around it). Budget: 3 iterations, then stop — re-frame or surface the
impasse with findings; never silently ship failing work. Full mechanics:
read `~/.pi/agent/docs/rework-loop.md` before running the pipeline.

## Defaults

- Lead session: `claude-fable-5` at `xhigh` (settings.json); bump effort
  when the task rewards it
- Cheap-first execution: labor defaults to the mechanical tier behind a
  deep-tier QA gate; deep tier is for judgment (design, review) and the
  named carve-outs, never routine typing; the pipeline exists for scope,
  concurrency, or ambiguity it can actually exploit
- Spend the priciest model only where it pays for itself — fable only
  ever orchestrates, it is never dispatched as an executor

## Config Maintenance (~/.pi/agent)

- After editing config, run `python3 ~/.pi/agent/scripts/validate-config.py`
  — the pre-commit hook blocks snapshots on failure.
- After adding, changing, or removing a config feature, update
  `docs/config-index.md`: adjust the feature-index row and append a
  changelog entry (date, summary, files, why). This is the semantic audit
  trail; git snapshots are only the raw diff history.
- New machine-readable artifacts get a malleable JSON Schema in `schema/`
  registered in `schema/manifest.json`.
- Heuristics about pi itself go to the global store (`learn_heuristic`
  scope `global`).
- After changing AGENTS.md, agents/, or delegation extensions, run the
  doctrine suite: `python3 ~/orch-bench/probes/run_probes.py --tier smoke`
  (~$1); `--tier full` (~$8) before major restructuring.
