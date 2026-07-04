# Delegation Contract Template

Every dispatched task is authored against this skeleton (the hygiene/return footer
is auto-appended by the harness — never restate it):

1. **Read first** — exact files/docs/prior outputs the agent must read before acting.
2. **Bounded problem** — the framed task; no ambiguity left to interpret; state what
   is explicitly OUT of scope.
3. **Return contract** — a conclusion, a diff, or file:line findings; the exact shape
   expected back.
4. **Verification** — the runnable check the agent must execute and include evidence
   for (command + outcome); reviews require executed evidence, not code-reading
   impressions.
5. **Constraints** — files it must not touch, no-commit rules, escalation triggers
   (when to stop and return instead of pushing on).
