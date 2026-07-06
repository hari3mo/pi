---
title: Orchestration & Delegation Lessons
category: synthesis
source_layer: learned
sources:
  - /Users/harissaif/.pi/heuristics/heuristics.jsonl
  - /Users/harissaif/.pi/agent/heuristics/heuristics.jsonl
tags: [pi, orchestration, synthesis]
aliases: ["delegation lessons", "peer-fail convergence", "subagent verification"]
summary: Cross-session delegation lessons — converge peer-FAILs by re-framing not patching, re-verify subagent claims, live-fire QA extensions in the subagent, and pay for model tier over pipeline depth.
relationships:
  - target: "[[components/subagent-extension]]"
    type: derived_from
  - target: "[[concepts/delegation-gate]]"
    type: related_to
  - target: "[[concepts/rework-loop]]"
    type: related_to
base_confidence: 0.8
lifecycle: draft
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Orchestration & Delegation Lessons

Lessons about running the [[components/subagent-extension|subagent]] pipeline and the
[[concepts/delegation-gate|delegation gate]] — earned across sessions, and mostly about
what the doctrine *doesn't* say.

## Converge peer-FAILs by re-framing the design, not patching around it

When consecutive peer FAILs converge on the **same root cause** (e.g. a missing platform
hook), stop patching and re-dispatch with an **explicitly mandated design re-frame in the
task spec**. In the observed case the third round passed only after the dispatch *prescribed*
a `session_shutdown`-based lifecycle instead of letting the engineer improvise yet another
heartbeat (heuristic `h_mr6e8a3u_3dk5o96f`). This is the [[concepts/rework-loop|rework loop]]'s
`FAIL: design` verdict in practice: repeated convergence on one cause is a design smell, so
name the fix in the spec rather than hoping the next worker guesses it.

## Re-verify subagent claims against the actual file — lead memory goes stale

When a subagent reports file state that conflicts with the lead's earlier read, **re-verify
the actual file content directly before ruling.** Files change mid-session, and the lead's
remembered snapshot of a file goes stale (heuristic `h_mr5lmluz_jv9hxdhc`). Never adjudicate
a disagreement from memory.

## `request_write_mode` "not found" → dispatch anyway, never ask in prose

If `request_write_mode` reports *"not found"* but the function exists in the extension file
on disk, the pi process loaded a **stale copy** (extensions load at session start — see
[[synthesis/pi-extension-api-gotchas]]). Dispatch the subagent call anyway: the write-gate's
`subagent` `tool_call` hook still pops the UI menu to switch to write mode. Never fall back
to asking for write mode in prose (heuristic `h_mr5p7pws_jw73u37k`; write-gate mechanics in
[[synthesis/write-gate-and-read-only-mode]]).

## Live-fire QA of extensions inside the subagent's own session

When QA'ing pi extensions, have the QA subagent **live-fire them in its own session** —
extensions load in spawned subagent sessions too, so the dispatch *itself* becomes the
integration test. In one run a graph-first block was observed firing live inside the child's
run this way (heuristic `h_mr6dj5qf_yjq91q97`). The corollary: subagents inherit the graph
tool, so dispatched tasks may assume it (see [[synthesis/graphify-query-craft]]).

## Pay for model tier, not pipeline depth (up to single-session scope)

Benchmarked at ~500-line multi-workstream scale (spreadsheet engine, 68 hidden tests): all
four configs passed 68/68 including integration tests, and blind review ranked **fable-solo
(9/10) above the full pipeline (8/10) at half the cost ($2.76 vs $5.68)**. Quality tracked
**model tier, not orchestration** — sonnet had real spec-corner defects at 5/10. So up to
single-session task sizes, pay for a **strong model** rather than more pipeline
(heuristic `h_mr5uv3so_n918xniy`). This is the empirical backing for the
[[concepts/delegation-gate|delegation gate]]'s "single chain is the default that gets
escalated up, not a pipeline pruned down."

## Pin thinking to `high` for weaker subagent models

When spawning pi subagents on `claude-sonnet-5` or `gemini-3.5-flash`, pin thinking to
`high` instead of inheriting the parent's effort level (heuristic `h_mr6dru62_qwyqi0lr`).

## Don't narrate delegate-vs-direct when the gate doesn't apply

When the active lead model is `claude-sonnet-5` (or any non-fable / non-opus model), the
[[concepts/delegation-gate|Delegation Gate]] section **doesn't apply at all** — so don't
narrate a delegate-vs-direct decision or mention subagents; just do the work
(heuristic `h_mr5tyavr_bvs1e5qx`).

## Quote the agent `description` frontmatter or deadlock all delegation

When authoring agent frontmatter, **always double-quote the `description` value.** An
unquoted `": "` inside it breaks YAML parsing and poisons the entire subagent loader,
deadlocking *all* delegation until manually repaired (heuristic `h_mr5uus41_wlt6jw37`). A
single bad agent file takes down the whole pipeline, so treat this as a trust-boundary
validation rule.

## See also

- [[components/subagent-extension]] · [[concepts/delegation-gate]] · [[concepts/rework-loop]]
- [[synthesis/write-gate-and-read-only-mode]] — the write-gate inheritance mechanics
- [[synthesis/pi-extension-api-gotchas]] — why the stale-copy trap bites request_write_mode
