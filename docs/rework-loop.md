# Rework Loop (verification is a gate, not a formality)

QA-gated work is not one-pass — this loop applies to any build that goes
through `qa-reviewer`, whether from the full pipeline or a solo build
(`solo-engineer`/`fable-engineer`). `qa-reviewer` is a gate that can bounce
work backwards, and the orchestrator runs the loop until the gate passes or
the loop budget is exhausted. "Implementing agent" below means whichever
agent built the work.

**Reviewer verdict contract.** Every `qa-reviewer` task must ask for a
structured verdict, one of:

- `PASS` — proceed to `shipper`
- `FAIL: implementation` — findings as `file:line` + what's wrong + expected
  behavior; route back to the implementing agent
- `FAIL: design` — the flaw is in the approach, not the code; route back to
  `architect` (or `scope-planner` if "done" itself was misdefined)

**Loop mechanics:**

1. On `FAIL: implementation`, re-delegate to the implementing agent with (a) the original
   bounded task, (b) the reviewer's findings verbatim, and (c) an explicit
   instruction to fix ONLY the findings — no opportunistic refactoring.
2. Re-review the fix. A fresh `qa-reviewer` invocation checks the findings
   are resolved AND nothing regressed. Never let the implementing agent
   self-certify.
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
