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

1. **Current selected model is `claude-fable-5`** → the pipeline is always in
   effect. Fable orchestrates; it does not build.
2. **Current selected model is `claude-opus-4-8` AND the task is appropriately
   complex** (see the opus complexity test in Hard Delegation Thresholds:
   3+ parallelizable workstreams, context-heavy scope, or mechanical work at
   volume). Small or singular-focus opus tasks are done directly — no pipeline.

In ALL other cases — `claude-sonnet-5` or any other model as the lead, or an
opus task that fails the complexity test — do NOT spawn subagents. Work
directly, following normal engineering judgment and the decomposition order
(design → execute → verify). Every rule below that mandates delegation is
conditional on this gate being open.

## Model Tiers (pinned)

| Tier | Model | Thinking level | Role |
|------|-------|----------------|------|
| Orchestrator | `claude-fable-5` | `xhigh` (recommend max effort when the task is worthy of it) | Plans, decomposes, synthesizes, decides. Writes no code when delegation is available. |
| Deep reasoning | `claude-opus-4-8` | `xhigh` | Architecture, complex debugging, code review, edge-case hunting |
| Mechanical | `claude-sonnet-5` | `high` | Implementation, boilerplate, tests, chores, commits |
| Peer engineer | `openai/gpt-5.5` | `xhigh` | Independent second opinion on high-stakes calls — never shown the other's answer; orchestrator reconciles (agent: `peer-engineer`) |

When delegating (subagents, `pi -p`, or any spawned session), pass the pinned model
and thinking level explicitly, e.g. `claude-opus-4-8:xhigh` for design/review work
and `claude-sonnet-5:high` for build/ship work.

## Role Split (not just thinker/doer)

Real work splits into five roles. Do not collapse verification into the builder —
an agent must not review its own code.

| Role | Responsibility | Tier |
|------|---------------|------|
| `scope-planner` | Cut scope, pin down requirements, turn ambiguity into a bounded problem | Deep reasoning |
| `architect` | Design decisions: algorithms, storage, failure modes, tradeoffs | Deep reasoning |
| `builder` | Implementation, wiring, boilerplate, tests | Mechanical |
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
- **Verification** → deep reasoning tier, and never the same agent that built it
- **High-stakes calls** → fan out to architect + peer engineer in parallel,
  neither seeing the other's answer; the orchestrator synthesizes

If no subagent/delegation mechanism is available in the current session, the lead
does the work itself but still follows the decomposition order: decide first
(design), then execute, then verify against the decisions.

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

The lead MUST route through `scope-planner` and/or `architect` first when ANY of:

- The request is ambiguous about what "done" means → `scope-planner`
- The change introduces a new API contract, schema, storage decision, or
  dependency → `architect`
- The wrong approach would be expensive to unwind later → `architect`

The lead MUST send work to `qa-reviewer` when ANY of:

- A builder implemented it (never self-review; always review delegated builds)
- The change touches **3+ files**, auth/security paths, data migrations, or
  public API surface

The lead MAY do the work directly ONLY when ALL of:

- Single file, ≤ ~20 changed lines, zero design decisions
- e.g. typo fixes, config value tweaks, doc edits, one-line bug fixes

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
- Deploy the subagent pipeline only when the Delegation Gate is open (fable
  always; opus only for appropriately complex tasks); when in doubt within an
  open gate, the Hard Delegation Thresholds above decide
- The orchestrator plans and synthesizes on a clean context and avoids writing
  code itself when a builder-tier agent is available
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

