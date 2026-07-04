---
description: Build + verify loop — builder → qa-reviewer (→ builder until PASS), design already fixed
---
Act as orchestrator. The design for this task is already fixed: $@

Use the subagent tool:

1. Delegate to "builder" with the fixed plan/spec above plus any relevant decisions from this conversation (subagents cannot see this session). State exactly which files to read first.
2. Delegate to "qa-reviewer" with the spec and the builder's change summary to verify the work. Never let the builder verify itself.
3. If the verdict has BLOCKER/MAJOR findings, send the specific `file:line` findings back to "builder" to fix, then re-verify with "qa-reviewer". Repeat until PASS.

Report to me: change summary, final review verdict, and remaining MINOR/NIT items. Do not commit — I'll decide whether the builder should ship.
