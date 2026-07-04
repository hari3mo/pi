---
title: Oracle Index
---

# Oracle Index

*Content catalog for the pi knowledge map, organized by provenance layer. Rebuilt by the
integration pass from `_fragments/index-*.md`. See [[SCHEMA]] for conventions.*

## Upstream

*Knowledge distilled from the pi installation (README/docs/examples). Every page carries `pi_version:`.*

- [[components/extension-system]] — ExtensionAPI: TypeScript factory registers tools/commands/shortcuts/providers and subscribes to a rich cancellable event lifecycle ( #pi #extensions #component)
- [[components/keybindings]] — Namespaced action ids (tui.editor.*, app.*) customizable in keybindings.json, one-or-more keys each, /reload to apply ( #pi #tui #component)
- [[components/pi-packages]] — Bundle extensions/skills/prompts/themes for npm/git/local sharing via package.json's pi manifest or convention dirs ( #pi #config #component)
- [[components/prompt-templates]] — Markdown prompts expanded via /name with positional args ($1, $@, ${1:-default}) and argument-hint autocomplete ( #pi #prompts #component)
- [[components/providers-and-models]] — Curated per-provider model lists, /login OAuth or API-key auth, and models.json to add/override providers/models for supported APIs ( #pi #providers #component)
- [[components/settings]] — JSON settings where project (.pi/settings.json) deep-merges over global (~/.pi/agent/settings.json) across model/UI/compaction/retry/delivery/resources ( #pi #config #component)
- [[components/skills-system]] — On-demand SKILL.md capability packages (Agent Skills standard) with progressive disclosure: descriptions in context, instructions load on match or /skill:name ( #pi #skills #component)
- [[components/themes]] — JSON theme files defining all 51 color tokens (plus vars/export); dark/light built-ins, custom themes hot-reload ( #pi #tui #component)
- [[components/tools]] — Built-in read/write/edit/bash/grep/find/ls plus custom tools via pi.registerTool (typebox params, streaming, override, rendering) and CLI allowlisting ( #pi #extensions #component)
- [[components/tui-components]] — pi-tui Component interface, built-ins (Text/Box/Container/Spacer/Markdown/Image), overlays, and Focusable IME cursor support for extension UI ( #pi #tui #extensions #component)
- [[concepts/extensibility-philosophy]] — Why the core is minimal: no MCP/sub-agents/plan-mode/permission-popups/to-dos/background-bash by design, built with extensions instead ( #pi #extensions #concept)
- [[concepts/message-queue]] — Steering (Enter, after current tool batch) vs follow-up (Alt+Enter, after all work) message queueing while the agent works ( #pi #tui #concept)
- [[concepts/project-trust]] — Project trust is an input-loading guard (not a sandbox); pi runs with full user permissions so real isolation comes from containers ( #pi #config #concept)
- [[concepts/session-model]] — Sessions are single JSONL trees: /tree branches in place, /fork and /clone spin off files, compaction summarizes old context losslessly ( #pi #concept)
- [[concepts/what-is-pi]] — Pi is a minimal terminal coding harness with a small four-tool core, extended via TypeScript instead of forking, running in four modes ( #pi #concept)
- [[references/cli-reference]] — Distilled catalog of pi's CLI flags (modes/model/session/tool/resource), interactive slash commands, and environment variables ( #pi #config #reference)
- [[references/examples-catalog]] — Map of the install's examples/ tree: 70+ themed extension examples plus a 13-step SDK ladder, with what each demonstrates ( #pi #extensions #reference)
- [[references/rpc-mode]] — pi --mode rpc: strict LF-delimited JSONL protocol (commands in, responses + streamed events out) for non-Node integrations ( #pi #sdk #reference)
- [[references/session-format]] — Versioned JSONL session trees (v3), entry types, buildSessionContext leaf→root walk, and the SessionManager API ( #pi #sdk #reference)
- [[workflows/add-a-model]] — Add providers/models for supported APIs via ~/.pi/agent/models.json (local models need only an id); reloads each /model open ( #pi #providers #workflow)
- [[workflows/add-custom-provider]] — Register custom-API/OAuth/streaming providers from an extension via pi.registerProvider (async factory for remote model discovery) ( #pi #providers #extensions #workflow)
- [[workflows/create-a-pi-package]] — Add a pi manifest + pi-package keyword to package.json, list resources with globs, put pi cores in peerDependencies, share via npm/git ( #pi #config #workflow)
- [[workflows/create-a-skill]] — Make a SKILL.md dir with name + a specific description, add scripts/references, place in a skills location, invoke via /skill:name or auto-load ( #pi #skills #workflow)
- [[workflows/embed-pi-with-sdk]] — Embed pi in Node with createAgentSession() (single session) or createAgentSessionRuntime() (session replacement); subscribe then prompt() ( #pi #sdk #workflow)
- [[workflows/write-an-extension]] — Create a default-export ExtensionAPI factory, drop in extensions/ (or pi -e), register tools/commands, subscribe to events, /reload ( #pi #extensions #workflow)

## Local

*Knowledge about the local harness config (`~/.pi/agent`: doctrine, extensions, skills, scripts, schemas).*

- [[components/concurrency-guard-extension]] — Detects HEAD advances, content-checks files this session edited, emits config-repo-advanced, provides /refresh. Fail-open on git errors. ( #pi #extensions #config)
- [[components/config-validation]] — The self-audit machinery: manifest-driven static validator, pipeline-dynamics auditor, and the self-audit extension that runs both and injects failures. ( #pi #config #component)
- [[components/graph-first-extension]] — Redirects structure-shaped grep/rg to the graph tool with a nudge→block→identical-retry-bypass ladder; content greps pass untouched. ( #pi #extensions #graph)
- [[components/graphify-bridge-extension]] — Exposes the graph tool + /graph, injects a compact graph block each prompt, keeps query-lessons fresh; cwd-then-agent-dir root resolution. ( #pi #extensions #graph)
- [[components/impact-trace-extension]] — After every edit surfaces the file's inbound graph dependents so cross-file impact is visible; debounced, with an agent_end follow-through reminder. ( #pi #extensions #graph)
- [[components/lead-config-extension]] — Mechanizes the delegation gate: reads the active model id each prompt, matches a lead profile, appends its doctrine. Fail-open. ( #pi #extensions #orchestration)
- [[components/skills-catalog]] — Catalog of skill families available to the harness: LLM-wiki, history-ingest, graphify/meta, ponytail lazy-coding, and general workflow skills. ( #pi #skills #component)
- [[components/subagent-extension]] — Spawns isolated pi subprocesses (single/parallel/chain) and mechanizes the doctrine: thinking-lock, gate inheritance, standing footer, peer verdict normalization, sonnet self-disable. ( #pi #extensions #orchestration)
- [[components/write-gate-extension]] — Gates writes by mode (confirm/write/read-only), hard-blocks fable edits in every mode, publishes the gate so subagents inherit it, offers request_write_mode. ( #pi #extensions #orchestration)
- [[concepts/concurrency-model]] — How concurrent sessions stay safe on ~/.pi/agent: autocommit daemon, concurrency guard, pre-commit gate + its launchd PATH caveat. ( #pi #config #concept)
- [[concepts/delegation-gate]] — The per-model rule (fable/opus/direct) deciding orchestrate-vs-work-directly, plus the write-gate + intent-interview pre-flights. ( #pi #orchestration #concept)
- [[concepts/fable-budget-invariants]] — The MUST token-spend rules: one read before dispatch, never verify by reading, batch dispatches, front-load spec quality, blind fan-out, graph-first, oracle-first. ( #pi #orchestration #concept)
- [[concepts/knowledge-graph-integration]] — Graph-first over grep (~30x cheaper), the strict Oracle-vs-graph division of labor, and the cwd-resolution gotcha. ( #pi #graph #concept)
- [[concepts/orchestration-doctrine]] — Fable's judgment-at-decision-points philosophy: a lead touches each task twice (dispatch + judge) and delegates everything between. ( #pi #orchestration #concept)
- [[concepts/rework-loop]] — Verification as a bounce-back gate: peer returns PASS / FAIL:implementation / FAIL:design, looped to a session-level 3-FAIL ceiling. ( #pi #orchestration #concept)
- [[concepts/routing-and-roles]] — Scale-first routing (Micro/Standard/Large) and the role roster with pinned model tiers (scout/worker/engineer/verifier/peer/reviewer/fable-engineer). ( #pi #orchestration #concept)
- [[concepts/self-audit-loop]] — The harness audits itself every session and turns its own problems into prompts: validator + pipeline audit, prose→code, errors integrated downstream. ( #pi #config #concept)
- [[synthesis/prose-to-code-promotion]] — The unifying pattern: standing prose rules are promoted to extensions/validator-checks/hooks because prompts drift and enforcement does not. ( #pi #extensions #synthesis)

## Learned

*Distilled accumulated lessons (heuristics.jsonl, reflections/LESSONS.md).*

- [[synthesis/graphify-query-craft]] — Driving the graph tool: prefer explain over lexically-anchored query, and know graphify-out resolves from cwd not the intended project. ( #pi #graph #synthesis)
- [[synthesis/harness-environment-quirks]] — Harness traps: launchd autocommit daemon, jsonschema-PATH degradation of the pre-commit gate, validate-config blind spots, packaged-app relaunch. ( #pi #config #synthesis)
- [[synthesis/orchestration-lessons]] — Delegation lessons: converge peer-FAILs by re-framing, re-verify subagent claims, live-fire QA extensions, pay for model tier over pipeline depth. ( #pi #orchestration #synthesis)
- [[synthesis/pi-extension-api-gotchas]] — Extension API limits: no programmatic slash-command dispatch, sendUserMessage can't run /cmd, extensions load once per session. ( #pi #extensions #synthesis)
- [[synthesis/pi-tui-rendering-gotchas]] — TUI layout model (viewport pinned to bottom N rows) plus width-guard and truncateToWidth rules that stop setHeader components crashing the terminal. ( #pi #tui #synthesis)
- [[synthesis/pi-workflow-conventions]] — Standing habits & user vocabulary: refresh after editing loaded resources, use the task tool, preserve message-queue steering keys, "the void" / "status bar" meanings. ( #pi #config #synthesis)
- [[synthesis/write-gate-and-read-only-mode]] — read-only-default & write-gate behavior: pass --write for programmatic sessions, avoid > redirects in read-only, dispatch-anyway to trigger the write-mode menu. ( #pi #extensions #synthesis)
