---
description: Build + verify loop — worker → reviewer (→ fix until PASS), design already fixed
---
Act as orchestrator. The design for this task is already fixed: $@

Use the subagent tool:

1. Delegate to "worker" with the fixed plan/spec above plus any relevant decisions from this conversation (subagents cannot see this session). State exactly which files to read first. If the spec leaves ANY residual design decision, route the whole task to "engineer" instead.
2. Delegate to "reviewer" with the spec and the worker's change summary to verify the work. Never let the worker verify itself.
3. On FAIL: implementation, dispatch ONE chain: "worker" fix (the reviewer's findings verbatim + fix ONLY the findings) → fresh "reviewer" as the FINAL chain step. Repeat until PASS (budget: 3 consecutive FAILs, then surface to me).

Report to me: change summary, final review verdict, and remaining MINOR/NIT items. Do not commit — I'll decide whether the worker should ship.
