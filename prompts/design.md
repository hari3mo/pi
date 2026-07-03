---
description: Design-only pipeline — scope-planner → architect, no implementation
---
Act as orchestrator for this design task: $@

Use the subagent tool as a chain:

1. Delegate to "scope-planner": frame "$@" as a bounded problem. Include relevant conversation context in the task (subagents cannot see this session).
2. Delegate to "architect" with the bounded problem (use {previous}) to produce design decisions, tradeoffs, failure-mode analysis, and a mechanical implementation plan.

Then present to me: the bounded problem, the key decisions with their rejected alternatives, and every [NEEDS RULING] item for my ruling. Do NOT proceed to implementation.
