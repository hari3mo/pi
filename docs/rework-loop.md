# Rework Loop (verification is a gate, not a formality)

Reviewer-gated work is not one-pass — this loop applies to any build that goes
through `reviewer`, whether from a fan-out or a solo build
(`solo-engineer`/`fable-engineer`). `reviewer` is a gate that can bounce
work backwards, and the orchestrator runs the loop until the gate passes or
the loop budget is exhausted. "Implementing agent" below means whichever
agent built the work.

**Reviewer verdict contract.** Every `reviewer` task must ask for a
structured verdict, one of:

- `PASS` — proceed to ship (the implementing agent commits)
- `FAIL: implementation` — findings as `file:line` + what's wrong + expected
  behavior; route back to the implementing agent
- `FAIL: design` — the flaw is in the approach, not the code; do not patch
  around it — the orchestrator re-frames the problem (interviewing the user
  if "done" itself was misdefined, or dispatching a design-only
  `solo-engineer` task for the revised approach)

**Loop mechanics:**

1. On `FAIL: implementation`, dispatch the iteration as ONE chain call: the
   implementing agent (builder or solo-engineer) given (a) the original
   bounded task, (b) the reviewer's findings verbatim, and (c) an explicit
   instruction to fix ONLY the findings — no opportunistic refactoring —
   followed by a fresh `reviewer` as the FINAL chain step.
2. The chain's closing `reviewer` checks the findings are resolved AND
   nothing regressed; verdict normalization applies because it is the last
   step. Never let the implementing agent self-certify.
3. On `FAIL: design`, re-frame: the revised design (from the user interview
   or a design-only `solo-engineer` dispatch) then flows forward through
   implementation → `reviewer` again.

**Loop budget: 3 iterations.** If the same work item fails review a third
time, STOP looping. Persistent failure means the problem was mis-framed,
not mis-typed. The orchestrator then either:

- re-frames the bounded problem itself (interviewing the user where "done"
  is in question) and restarts, or
- surfaces the impasse to the user with the accumulated findings and a
  recommendation — do not silently ship known-failing work, and do not
  burn unbounded tokens retrying.

**Convergence discipline.** Each iteration must shrink the problem: pass
prior findings forward so the reviewer checks resolution, not rediscovery.
If iteration N's findings are unrelated to iteration N-1's (new problems
keep appearing), treat that as a design smell and re-frame early — even
before the budget runs out.

**Enforcement.** The verdict contract above is not just convention: `extensions/subagent/index.ts`
`finalizeQaOutput` normalizes every reviewer return with a `[VERDICT: ...]` first line
(inserting a `MISSING` notice if the agent omitted one) and annotates the session-level
consecutive-FAIL loop budget of 3 automatically. Ceilings: the counter is per-session and
consecutive, not per-work-item, and mid-chain reviewer steps inside a chain dispatch are not counted.
