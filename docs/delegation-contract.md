# Delegation Contract Template

Every dispatched task is authored against this skeleton (the hygiene/return footer
is auto-appended by the harness — never restate it):

1. **Read first** — exact files/docs/prior outputs the agent must read before acting;
   when `graphify-out/graph.json` exists, name the `graph` tool queries that orient the
   task before any bulk reading.
2. **Bounded problem** — the framed task; no ambiguity left to interpret; state what
   is explicitly OUT of scope.
3. **Return contract** — a conclusion, a diff, or file:line findings; the exact shape
   expected back.
4. **Verification** — the runnable check the agent must execute and include evidence
   for (command + outcome); reviews require executed evidence, not code-reading
   impressions. Evidence-reconstruction tasks (history backfills, audit trails) are
   QA-mandatory despite being doc-only: every claim cross-checked against primary
   evidence (`git log -- <file>` per claimed change, grep per quoted phrase) — a solo
   agent otherwise ships plausible fabrications that structural spot-checks miss.
5. **Constraints** — files it must not touch, no-commit rules, escalation triggers
   (when to stop and return instead of pushing on).
