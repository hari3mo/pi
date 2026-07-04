---
description: Feature flow — interview → engineer chain (default) or fan-out → peer gate → worker ships
---
Act as orchestrator for this task: $@

1. If what "done" means, scope boundaries, or hard constraints are ambiguous, interview me with targeted questions before dispatching; otherwise proceed — do not add friction to a clear request.
2. Default route (standard single-session scope): ONE chain — "engineer" with the whole bounded task, design inline (include relevant conversation context; subagents cannot see this session) → "peer" as the FINAL chain step (verdict normalization applies only to the last step). Use "verifier" instead of "peer" only for greenfield work with a runnable acceptance path.
3. Escalate to a fan-out ONLY if scope exceeds one context window or workstreams can genuinely run concurrently: dispatch a design-only "engineer" task first (only when 2+ implementers consume the design), then independent workers in ONE parallel call (max 8), then a "peer" gate.
4. On FAIL: implementation, dispatch ONE chain: fix (worker or engineer, findings verbatim, fix ONLY the findings) → fresh "peer" as the final step. On FAIL: design, re-frame — do not patch. Budget: 3 consecutive FAILs, then surface to me.
5. On PASS, delegate to "worker" to run lint/typecheck/build/tests and commit.

Synthesize a final summary for me: what shipped, key decisions, review verdict, commit hash.
