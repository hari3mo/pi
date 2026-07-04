# Global Agent Config — Model Hierarchy by Default

## Philosophy: Lead, Not Labor

The frontier model is worth its price on **judgment** — planning, design decisions,
review, synthesis — and wasteful on everything else. Treat the main session like a
tech lead: it plans, decomposes, delegates, and stitches results together. It should
not spend frontier tokens on boilerplate, lint fixes, or mechanical edits when a
cheaper tier can do the same work.

Second-order benefit: keep the lead's context clean. When the orchestrator never
touches raw file dumps or stack traces directly, it stays sharp in long sessions
instead of drowning in half-finished edits.

## Delegation Gate (read this first)

The subagent pipeline (scope-planner → architect → builder → qa-reviewer →
shipper, or any fan-out) is deployed ONLY when one of these holds:

1. **Current selected model is `claude-fable-5`** → fable orchestrates; it
   never builds directly. But it routes by scale — pipeline is NOT the
   default:
   - **Micro** (single file, ≤ ~20 changed lines, zero design decisions):
     dispatch ONE `builder` with the fully specified change; skip
     scope-planner, architect, and qa-reviewer; spot-check the returned
     diff with targeted verification reads.
   - **Single-session scope** (fits comfortably in one context window,
     requirements clear, no genuinely concurrent workstreams): dispatch ONE
     `solo-engineer` with the whole bounded task end-to-end, then
     spot-check against acceptance criteria. NO pipeline. Escalate the
     dispatch to `fable-engineer` (≈1.6x cost, benchmarked best blind-review
     quality) when the code is expensive to change later — core algorithms,
     dense state, long-lived public contracts — or after `solo-engineer`
     fails review twice; its task text must inline any repo conventions
     since it loads no context files. (Benchmarked
     2026-07: the full pipeline cost 2–14x solo with equal-or-worse
     quality at this scale — see ~/orch-bench/REPORT.md.)
   - **Full pipeline** ONLY when at least one holds: scope exceeds one
     context window (multi-session work, 10+ interacting files); 2+
     workstreams that can genuinely run concurrently; or requirements
     ambiguous enough to need scope-planner negotiation. If none holds,
     the pipeline is the wrong tool.
2. **Current selected model is `claude-opus-4-8` AND the task is appropriately
   complex** (see the opus complexity test in Hard Delegation Thresholds:
   3+ parallelizable workstreams, context-heavy scope, or mechanical work at
   volume). Small or singular-focus opus tasks are done directly — no pipeline.

In ALL other cases — `claude-sonnet-5` or any other model as the lead, or an
opus task that fails the complexity test — do NOT spawn subagents. Work
directly, following normal engineering judgment and the decomposition order
(design → execute → verify). Every rule below that mandates delegation is
conditional on this gate being open.

### Write-Gate Pre-Flight (MUST, validate on every fable task)

Whenever the lead is `claude-fable-5` and a task will plausibly require file
changes, checking the write-gate mode is the FIRST action on task receipt —
before reading code, exploring the repo, or dispatching any subagent. Spawned
children inherit `--write` only when the parent gate is in write mode; in
confirm or read-only mode they run read-only and can only return plans.
If the gate is not in write mode, STOP immediately and call the
`request_write_mode` tool — it shows the user a selection prompt to open the
gate (do not ask in prose) — so builders inherit write access — do not explore first,
do not fall back to editing directly, and do not spawn read-only children
hoping it clears. Exploration done before the gate is open is wasted if the
user re-frames the task when prompted.

## Model Tiers (pinned)

| Tier | Model | Thinking level | Role |
|------|-------|----------------|------|
| Orchestrator | `claude-fable-5` | `xhigh` (recommend max effort when the task is worthy of it) | Plans, decomposes, synthesizes, decides. NEVER writes code or edits files directly — every change goes through subagents. |
| Deep reasoning | `claude-opus-4-8` | `xhigh` | Architecture, complex debugging, code review, edge-case hunting |
| Mechanical | `claude-sonnet-5` | `high` | Implementation, boilerplate, tests, chores, commits |
| Peer engineer | `openai/gpt-5.5` | `xhigh` | Independent second opinion on high-stakes calls — never shown the other's answer; orchestrator reconciles (agent: `peer-engineer`) |

When delegating (subagents, `pi -p`, or any spawned session), pass the pinned model
and thinking level explicitly, e.g. `claude-opus-4-8:xhigh` for design/review work
and `claude-sonnet-5:high` for build/ship work.

## Role Split (not just thinker/doer)

Real work splits into eight roles. Do not collapse verification into the builder —
an agent must not review its own code.

| Role | Responsibility | Tier |
|------|---------------|------|
| `scope-planner` | Cut scope, pin down requirements, turn ambiguity into a bounded problem | Deep reasoning |
| `architect` | Design decisions: algorithms, storage, failure modes, tradeoffs | Deep reasoning |
| `builder` | Genuinely mechanical implementation: boilerplate, test scaffolding, wiring, renames, bulk edits | Mechanical |
| `opus-engineer` | Small-but-hard tasks where design and implementation can't separate: tricky concurrency, subtle algorithms, delicate refactors | Deep reasoning |
| `solo-engineer` | Whole bounded tasks at single-session scope, executed end-to-end; also core algorithmic/stateful modules inside a pipeline | Deep reasoning |
| `fable-engineer` | Highest-stakes solo builds: core algorithms, dense state, long-lived contracts, delicate refactors — or escalation after two failed reviews. Clean context: inline repo conventions in the task | Orchestrator-tier model, solo |
| `qa-reviewer` | Verification, edge cases, regression risk | Deep reasoning |
| `shipper` | Commits, CI, lint/type fixes, chores | Mechanical |

Note the orchestrator does NOT hand its own frontier model to `architect` or
`qa-reviewer`. By the time work reaches those roles, the hardest part — framing an
ambiguous request as a clear, bounded problem — is already done. Deep-reasoning tier
is enough to propose; the orchestrator decides what to accept.

## Routing Rules

These routing rules only apply when the Delegation Gate above is open. If the
gate is closed, the lead does everything itself in decomposition order.

When a task arrives, decompose it and route each piece by weight:

- **Design decisions** (wrong call is expensive to unwind later) → deep reasoning tier
  - algorithm/data-structure choice, storage/topology decisions, API contracts,
    failure-mode analysis, security tradeoffs
- **Execution** (careful but mechanical) → mechanical tier
  - writing the code once the design is fixed, wiring/plumbing, test scaffolding,
    lint/type/format fixes, renames, commits
  - EXCEPT core algorithmic or stateful modules: route those to
    `solo-engineer` (or `fable-engineer` at highest stakes) even when the
    design is fixed — mechanical-tier builders ship subtle spec-corner
    defects that review does not catch (benchmarked: error-token
    aliasing, reference canonicalization)
- **Verification** → deep reasoning tier, and never the same agent that built it
- **Small-but-hard execution** (design and implementation inseparable) → `opus-engineer`
  - tricky concurrency fixes, subtle algorithms, delicate refactors of dense
    logic — one bounded task, executed end-to-end; still reviewed by
    `qa-reviewer` afterwards
- **High-stakes calls** → fan out to architect + peer engineer in parallel,
  neither seeing the other's answer; the orchestrator synthesizes

If no subagent/delegation mechanism is available in the current session, the lead
does the work itself but still follows the decomposition order: decide first
(design), then execute, then verify against the decisions. Exception: a
`claude-fable-5` lead never writes code under any circumstances — if
delegation is unavailable, it surfaces the blocker to the user instead of
editing directly.

## Hard Delegation Thresholds (MUST rules)

These rules apply ONLY when the Delegation Gate is open: always when the
currently selected model is `claude-fable-5` (the orchestrator tier), and for
`claude-opus-4-8` only if the task is large enough to genuinely benefit from
delegation (the complexity test below). If the lead session is running as
`claude-sonnet-5` or any other model, skip this section entirely — it's
already the delegation target, so forcing a further handoff would just add
overhead. Do the work directly, following normal engineering judgment.

For `claude-opus-4-8`, "large enough to benefit" means ANY of:

- The task naturally splits into 3+ independent workstreams that could run
  in parallel (fan-out to `builder`/`architect` instances)
- The full scope would burn a large fraction of context if done inline
  (large multi-file refactor, broad audit, bulk migration)
- The task is mechanical at volume (e.g. the same edit across many files) —
  push it to `builder` even though opus *could* do it, because doing it by
  hand is pure waste of a deep-reasoning-tier model

If the opus task is small or singular in focus (one file, one design
question, one bug), just do it directly — do not delegate for its own sake.

When these rules apply (fable always, opus for large tasks) and a `subagent`
tool is available, they are not suggestions. Check them BEFORE the first
`edit`/`write` call, not after starting the work.

The lead MUST delegate to `builder` (not edit/write directly) when a task meets
ANY of:

- Modifies **2+ files**
- Writes a **new file** of code (any size)
- Changes more than **~20 lines** in one file
- Adds or changes **tests**
- Is mechanical repetition (renames, boilerplate, wiring, format/lint fixes)

Exception: if the task is small but its difficulty lies in the execution
itself (design and implementation cannot cleanly separate — tricky
concurrency, subtle algorithm, delicate refactor), delegate the whole task
to `opus-engineer` instead of the scope-planner → architect → builder
pipeline. Its output still goes to `qa-reviewer` like any delegated build.

The lead MUST route through `scope-planner` and/or `architect` first when ANY of:

- The request is ambiguous about what "done" means → `scope-planner`
- The change introduces a new API contract, schema, storage decision, or
  dependency → `architect`
- The wrong approach would be expensive to unwind later → `architect`

The lead MUST send work to `qa-reviewer` when ANY of:

- The change modifies existing behavior in an existing codebase and was
  implemented by a delegated agent (never self-review)
- The change touches **3+ files** of existing code, auth/security paths,
  data migrations, or public API surface

QA may drop to a lead spot-check (targeted verification reads plus running
the acceptance path) for: micro dispatches, and `solo-engineer` builds of
greenfield modules that have a runnable acceptance path. (Benchmarked:
QA cycles on greenfield code did not lift quality above solo — see
~/orch-bench/REPORT.md.)

A non-fable lead MAY do the work directly ONLY when ALL of:

- Single file, ≤ ~20 changed lines, zero design decisions
- e.g. typo fixes, config value tweaks, doc edits, one-line bug fixes

A `claude-fable-5` lead has NO direct-edit exception: it never calls edit/write
itself, no matter how trivial the change (typo, config tweak, doc edit,
one-liner). It always delegates to `builder`.

Mid-task escalation: if a "trivial" edit grows past a threshold (second file,
unexpected design question), STOP, revert to orchestrating, and delegate the
remainder. Do not finish it by hand because you already started.

If genuinely unsure whether a threshold applies, delegate. Frontier tokens spent
typing code are always more expensive than a builder invocation.

## Delegation Contracts

Subagents cannot see the main conversation. Every delegated task must state:

1. **What to read before acting** — specific files, docs, or prior outputs
2. **The bounded problem** — already framed; no ambiguity left to interpret
3. **What to return** — a conclusion, a diff, or `file:line` findings; never a
   raw dump the orchestrator has to clean up

Vague role descriptions cause routing drift. Keep descriptions sharp about *when*
a role gets work, not just what it does.

## Rework Loop (verification is a gate, not a formality)

The pipeline is not one-pass. `qa-reviewer` is a gate that can bounce work
backwards, and the orchestrator runs the loop until the gate passes or the
loop budget is exhausted.

**Reviewer verdict contract.** Every `qa-reviewer` task must ask for a
structured verdict, one of:

- `PASS` — proceed to `shipper`
- `FAIL: implementation` — findings as `file:line` + what's wrong + expected
  behavior; route back to `builder`
- `FAIL: design` — the flaw is in the approach, not the code; route back to
  `architect` (or `scope-planner` if "done" itself was misdefined)

**Loop mechanics:**

1. On `FAIL: implementation`, re-delegate to `builder` with (a) the original
   bounded task, (b) the reviewer's findings verbatim, and (c) an explicit
   instruction to fix ONLY the findings — no opportunistic refactoring.
2. Re-review the fix. A fresh `qa-reviewer` invocation checks the findings
   are resolved AND nothing regressed. Never let the builder self-certify.
3. On `FAIL: design`, do not patch around it. Route back to `architect`
   with the reviewer's findings; the revised design then flows forward
   through `builder` → `qa-reviewer` again.

**Loop budget: 3 iterations.** If the same work item fails review a third
time, STOP looping. Persistent failure means the problem was mis-framed,
not mis-typed. The orchestrator then either:

- re-frames the bounded problem itself and restarts the pipeline from
  `scope-planner`/`architect`, or
- surfaces the impasse to the user with the accumulated findings and a
  recommendation — do not silently ship known-failing work, and do not
  burn unbounded tokens retrying.

**Convergence discipline.** Each iteration must shrink the problem: pass
prior findings forward so the reviewer checks resolution, not rediscovery.
If iteration N's findings are unrelated to iteration N-1's (new problems
keep appearing), treat that as a design smell and escalate to `architect`
even before the budget runs out.

## Defaults

- Lead session: `claude-fable-5` at `xhigh` (set in `~/.pi/agent/settings.json`);
  recommend bumping to max effort when a task genuinely rewards it
- Deploy the full pipeline only per the scale-routing in the Delegation
  Gate (fable routes micro → one builder, single-session → `solo-engineer`,
  and reserves the pipeline for multi-session scope, genuine concurrency,
  or ambiguity; opus only for appropriately complex tasks)
- Orchestration is the exception, not the default: most tasks route to one
  strong solo agent; the pipeline exists for scope, parallelism, or
  ambiguity it can actually exploit
- The orchestrator plans and synthesizes on a clean context and never writes
  code itself — every file change is delegated to a builder-tier agent
- Delegated builds loop through the Rework Loop until `qa-reviewer` passes
  or the 3-iteration budget forces re-framing/escalation
- Spend the priciest model only where it pays for itself

## Config Maintenance (~/.pi/agent)

The config repo is schema-audited (see `~/.pi/agent/README.md`). When working
inside `~/.pi/agent`:

- After editing config, run `python3 ~/.pi/agent/scripts/validate-config.py`
  and fix any errors — the pre-commit hook blocks snapshots on validation
  failure, which silently halts the audit trail until fixed.
- When creating a NEW machine-readable config artifact, author a malleable
  JSON Schema for it in `schema/` (known keys typed,
  `additionalProperties: true`) and register it in `schema/manifest.json`.
  The validator is manifest-driven; no code change needed.
- Heuristics about pi itself (harness, delegation, tooling) belong in the
  global store — pass scope `global` to `learn_heuristic`.

## Standing Orders

- (Enforced in config, no action needed: the heuristics extension itself now
  echoes the exact saved text in every `learn_heuristic` / `/heuristics add`
  result — see `extensions/heuristics/store.ts` `SaveResult.text`.)
- (Enforced in config, no action needed: when a `subagent` call happens in
  confirm/read-only mode, the write-gate extension prompts the user to switch
  to write mode, and spawned children inherit `--write` only when the parent
  gate is in write mode — see `extensions/read-only-default.ts` and
  `extensions/subagent/index.ts` `__piWriteGateMode`.)

