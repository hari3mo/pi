---
description: Full tiered pipeline — scope-planner → architect → builder → qa-reviewer → shipper
---
Act as orchestrator for this task: $@

Run the full role pipeline using the subagent tool. Between stages, you review the output, decide what to accept, and frame the next stage's task — do not blindly forward.

1. Delegate to "scope-planner": frame the request "$@" as a bounded problem. Include any relevant context from this conversation in the task (subagents cannot see it).
2. Review the bounded problem. Resolve any open questions yourself or with me. Then delegate to "architect" with the bounded problem to produce design decisions and a mechanical implementation plan.
3. Rule on any [NEEDS RULING] items. Then delegate to "builder" with the fixed plan.
4. Delegate to "qa-reviewer" with the design decisions plus the builder's change summary. The reviewer must not be told anything the builder claimed beyond what changed.
5. If the reviewer finds BLOCKER/MAJOR issues, route the specific findings back to "builder" to fix, then re-verify with "qa-reviewer". Repeat until PASS.
6. Delegate to "shipper" to run lint/typecheck/build/tests and commit.

Every delegated task must state: what to read before acting, the bounded problem, and what to return. Synthesize a final summary for me: what shipped, key decisions, review verdict, commit hash.
