# Graph Report - agent  (2026-07-04)

## Corpus Check
- 190 files · ~152,874 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1161 nodes · 1638 edges · 62 communities (57 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf6a5f55`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Heuristics Extension|Heuristics Extension]]
- [[_COMMUNITY_Porcelain Dark Palette|Porcelain Dark Palette]]
- [[_COMMUNITY_Porcelain Light Palette|Porcelain Light Palette]]
- [[_COMMUNITY_TUI Extensions & Config Index|TUI Extensions & Config Index]]
- [[_COMMUNITY_Ponytail Ruleset & Mirrors|Ponytail Ruleset & Mirrors]]
- [[_COMMUNITY_Subagent Dispatch Tool|Subagent Dispatch Tool]]
- [[_COMMUNITY_Heuristic Entry Schema|Heuristic Entry Schema]]
- [[_COMMUNITY_Ponytail Benchmarks & Ladder|Ponytail Benchmarks & Ladder]]
- [[_COMMUNITY_Email Robustness Scripts|Email Robustness Scripts]]
- [[_COMMUNITY_Agentic Benchmark Tasks|Agentic Benchmark Tasks]]
- [[_COMMUNITY_Ponytail Activation Hooks|Ponytail Activation Hooks]]
- [[_COMMUNITY_Agentic Benchmark Harness|Agentic Benchmark Harness]]
- [[_COMMUNITY_Ponytail npm Package|Ponytail npm Package]]
- [[_COMMUNITY_Settings Schema|Settings Schema]]
- [[_COMMUNITY_Ponytail Hook Tests|Ponytail Hook Tests]]
- [[_COMMUNITY_Void Black-Hole TUI|Void Black-Hole TUI]]
- [[_COMMUNITY_Porcelain Light Theme|Porcelain Light Theme]]
- [[_COMMUNITY_Hermes Plugin|Hermes Plugin]]
- [[_COMMUNITY_Brand & Chart Assets|Brand & Chart Assets]]
- [[_COMMUNITY_Correctness Gate|Correctness Gate]]
- [[_COMMUNITY_Graphify Skill (nested copy)|Graphify Skill (nested copy)]]
- [[_COMMUNITY_Orchestration Doctrine & Roles|Orchestration Doctrine & Roles]]
- [[_COMMUNITY_Completeness Judge|Completeness Judge]]
- [[_COMMUNITY_Ponytail Mode Resolution|Ponytail Mode Resolution]]
- [[_COMMUNITY_Uninstall Script Tests|Uninstall Script Tests]]
- [[_COMMUNITY_Ponytail Config Loader|Ponytail Config Loader]]
- [[_COMMUNITY_Porcelain Theme Variables|Porcelain Theme Variables]]
- [[_COMMUNITY_OpenClaw Skill Builder|OpenClaw Skill Builder]]
- [[_COMMUNITY_Example Generator & LOC Metric|Example Generator & LOC Metric]]
- [[_COMMUNITY_Task Tracker Extension|Task Tracker Extension]]
- [[_COMMUNITY_Ponytail MCP Package|Ponytail MCP Package]]
- [[_COMMUNITY_Rule-Copy Checker|Rule-Copy Checker]]
- [[_COMMUNITY_Gemini Extension Tests|Gemini Extension Tests]]
- [[_COMMUNITY_Keybindings Schema|Keybindings Schema]]
- [[_COMMUNITY_Ponytail MCP Server|Ponytail MCP Server]]
- [[_COMMUNITY_OpenClaw Skill Publisher|OpenClaw Skill Publisher]]
- [[_COMMUNITY_OpenCode Plugin Tests|OpenCode Plugin Tests]]
- [[_COMMUNITY_Trust Schema|Trust Schema]]
- [[_COMMUNITY_Behavior Gates|Behavior Gates]]
- [[_COMMUNITY_Windows Hook Tests|Windows Hook Tests]]
- [[_COMMUNITY_Local Ollama Benchmark|Local Ollama Benchmark]]
- [[_COMMUNITY_Plugin Marketplace Manifest|Plugin Marketplace Manifest]]
- [[_COMMUNITY_OpenCode Plugin|OpenCode Plugin]]
- [[_COMMUNITY_porcelain.json|porcelain.json]]
- [[_COMMUNITY_Copilot Plugin Tests|Copilot Plugin Tests]]
- [[_COMMUNITY_Schema Manifest|Schema Manifest]]
- [[_COMMUNITY_Porcelain Dark Theme|Porcelain Dark Theme]]
- [[_COMMUNITY_Pi Extension (Ponytail)|Pi Extension (Ponytail)]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_Pi Rewind Package|Pi Rewind Package]]
- [[_COMMUNITY_Scrollback Fix Harness|Scrollback Fix Harness]]
- [[_COMMUNITY_claude-email.js|claude-email.js]]
- [[_COMMUNITY_Ponytail Arm|Ponytail Arm]]
- [[_COMMUNITY_Scrollback Harness Copy|Scrollback Harness Copy]]
- [[_COMMUNITY_Statusline Script|Statusline Script]]
- [[_COMMUNITY_Autocommit Script|Autocommit Script]]
- [[_COMMUNITY_Publish Workflow|Publish Workflow]]
- [[_COMMUNITY_execute|execute]]
- [[_COMMUNITY_graphify-bridge.ts|graphify-bridge.ts]]
- [[_COMMUNITY_ponytail-statusline.sh script|ponytail-statusline.sh script]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 52 edges
2. `colors` - 52 edges
3. `Config Index (semantic audit map)` - 27 edges
4. `Single-shot benchmark (promptfoo, 5 tasks x 3 models)` - 18 edges
5. `vars` - 17 edges
6. `vars` - 17 edges
7. `Orchestration Doctrine (AGENTS.md)` - 15 edges
8. `mutateStore()` - 14 edges
9. `The Ladder (YAGNI→reuse→stdlib→native→dep→one line→minimum)` - 14 edges
10. `_fail()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Ponytail project (lazy senior dev skill)` --conceptually_related_to--> `~/.pi/agent config repo overview`  [INFERRED]
  git/github.com/DietrichGebert/ponytail/README.md → README.md
- `fable-engineer role card — Opt-in orchestrator-tier solo executor` --implements--> `Orchestration Doctrine (AGENTS.md)`  [EXTRACTED]
  agents/fable-engineer.md → AGENTS.md
- `Orchestration Doctrine (AGENTS.md)` --references--> `Delegation Contract Template`  [EXTRACTED]
  AGENTS.md → docs/delegation-contract.md
- `peer-engineer role card — Blind second opinion (GPT lineage)` --implements--> `Orchestration Doctrine (AGENTS.md)`  [EXTRACTED]
  agents/peer-engineer.md → AGENTS.md
- `reviewer role card — Deep-reasoning gate: PASS / FAIL:implementation / FAIL:design` --implements--> `Orchestration Doctrine (AGENTS.md)`  [EXTRACTED]
  agents/reviewer.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Seven-role subagent roster** — agents_engineer_role, agents_worker_role, agents_scout_role, agents_verifier_role, agents_reviewer_role, agents_peer_engineer_role, agents_fable_engineer_role [EXTRACTED 1.00]
- **Benchmark honesty arc (single-shot → critique → agentic → verification)** — git_github_com_dietrichgebert_ponytail_benchmarks_readme_single_shot, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_17_agentic_safety_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_18_agentic_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_17_cost_verification_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_22_issue_245_217_comprehension_result [INFERRED 0.85]
- **Cross-agent rule distribution (aligned mirrors)** — git_github_com_dietrichgebert_ponytail_agents_rules_ponytail_rules, git_github_com_dietrichgebert_ponytail_clinerules_ponytail_rules, git_github_com_dietrichgebert_ponytail_github_copilot_instructions_rules, git_github_com_dietrichgebert_ponytail_kiro_steering_ponytail_rules, git_github_com_dietrichgebert_ponytail_windsurf_rules_ponytail_rules, git_github_com_dietrichgebert_ponytail_agents_ruleset [EXTRACTED 1.00]
- **Graphify pipeline documentation set** — skills_graphify_skill_skill, skills_graphify_references_add_watch_ref, skills_graphify_references_exports_ref, skills_graphify_references_extraction_spec_ref, skills_graphify_references_github_and_merge_ref, skills_graphify_references_hooks_ref, skills_graphify_references_query_ref, skills_graphify_references_transcribe_ref, skills_graphify_references_update_ref [EXTRACTED 1.00]

## Communities (62 total, 5 thin omitted)

### Community 0 - "Heuristics Extension"
Cohesion: 0.06
Nodes (81): findEntry(), formatEntry(), handleAdd(), handleDemote(), handleEdit(), handlePin(), handlePromote(), handleRm() (+73 more)

### Community 1 - "Porcelain Dark Palette"
Cohesion: 0.04
Nodes (52): colors, accent, bashMode, border, borderAccent, borderMuted, customMessageBg, customMessageLabel (+44 more)

### Community 2 - "Porcelain Light Palette"
Cohesion: 0.04
Nodes (52): colors, accent, bashMode, border, borderAccent, borderMuted, customMessageBg, customMessageLabel (+44 more)

### Community 3 - "TUI Extensions & Config Index"
Cohesion: 0.08
Nodes (38): fmtDuration(), AgentScopeSchema, ChainItem, DisplayItem, execute(), finalizeQaOutput(), formatTokens(), formatToolCall() (+30 more)

### Community 4 - "Ponytail Ruleset & Mirrors"
Cohesion: 0.09
Nodes (31): autocommit.sh script, Autocommit snapshot infra (launchd + pre-commit), ~/.pi/agent config repo overview, Malleable schema policy, check_git_hygiene(), check_heuristics_hygiene(), check_installed_integrity(), check_layout() (+23 more)

### Community 5 - "Subagent Dispatch Tool"
Cohesion: 0.06
Nodes (37): Hermes after-install notes, ponytail: ceiling-comment convention, Bug fix = root cause, not symptom (grep every caller), Ruleset mirror for agents, Compact always-on ruleset (AGENTS.md), Never-lazy floor (validation, data loss, security, a11y), Benchmark result: v4 hardening: test reflex + ceiling comments, no bloat creep, Benchmark result: parseaddr email slip is provider-specific (OpenAI), Claude 100% (+29 more)

### Community 6 - "Heuristic Entry Schema"
Cohesion: 0.08
Nodes (25): { checkPy, pyBlock, TASKS }, email, fs, kv, MODELS, path, skill, { checkPy, pyBlock, TASKS } (+17 more)

### Community 7 - "Ponytail Benchmarks & Ladder"
Cohesion: 0.17
Nodes (28): _contained(), _fail(), _find(), _find_class(), _import(), _import_pkg(), _ok(), Path (+20 more)

### Community 8 - "Email Robustness Scripts"
Cohesion: 0.10
Nodes (26): claudeDir, {
  clearMode,
  isCodex,
  isCopilot,
  setMode,
  writeHookOutput,
}, fs, { getDefaultMode, getClaudeDir, isShellSafe }, { getPonytailInstructions }, mode, output, path (+18 more)

### Community 9 - "Agentic Benchmark Tasks"
Cohesion: 0.14
Nodes (27): aggregate(), chat_code_loc(), _claude_version(), code_stats(), _count(), _git(), git_diff_stats(), _git_snapshot() (+19 more)

### Community 10 - "Ponytail Activation Hooks"
Cohesion: 0.13
Nodes (27): The Ladder (YAGNI→reuse→stdlib→native→dep→one line→minimum), Chart: median LOC per arm (518/116/39 Haiku etc.), Vendored caveman skill (terse-prose control arm), benchmark config: Behavior gates (hardware/explanation/one-check probes), benchmark config: Claude 3-arm config, benchmark config: Gemini config, benchmark config: GPT-mini issue-65 repro config, benchmark config: Newest-OpenAI config (+19 more)

### Community 11 - "Agentic Benchmark Harness"
Cohesion: 0.07
Nodes (26): npm publish workflow (OIDC trusted publishing), author, name, url, bugs, url, description, exports (+18 more)

### Community 12 - "Ponytail npm Package"
Cohesion: 0.08
Nodes (25): additionalProperties, type, type, enum, type, description, items, type (+17 more)

### Community 13 - "Settings Schema"
Cohesion: 0.08
Nodes (23): assert, claudeEnv, codexData, codexEnv, codexState, copilotData, customConfigDir, fs (+15 more)

### Community 14 - "Ponytail Hook Tests"
Cohesion: 0.11
Nodes (11): BlackHoleComponent, COMET_DEFS, CometDef, Constellation, CONSTELLATIONS, COS_T, DeepGalaxy, PLANETS (+3 more)

### Community 15 - "Void Black-Hole TUI"
Cohesion: 0.12
Nodes (17): vars, amber, bgRaise, bgSelect, bgTool, bgToolErr, bgToolOk, bronze (+9 more)

### Community 16 - "Porcelain Light Theme"
Cohesion: 0.19
Nodes (21): Any, build_injected_context(), _config_dir(), _default_mode(), _fallback_instructions(), _filter_skill_body_for_mode(), _handle_mode_command(), _make_skill_command_handler() (+13 more)

### Community 17 - "Hermes Plugin"
Cohesion: 0.10
Nodes (22): Chart: agentic metrics vs baseline (LOC 46%, tokens 78%), Mascot logo, dark-mode variant, Mascot dark logo (SVG source), GreenPT sponsor logo (dark), GreenPT sponsor logo, Ponytail mascot: hand-drawn ink portrait, ponytail + oval glasses, unimpressed stare, Social preview: 'He says nothing. He writes one line. It works.' + mascot, Waitlist banner: 'He's building something' terminal card (+14 more)

### Community 18 - "Brand & Chart Assets"
Cohesion: 0.10
Nodes (16): CHECKS, exec(), { execSync }, fs, os, path, python(), assert (+8 more)

### Community 19 - "Correctness Gate"
Cohesion: 0.12
Nodes (21): Blind Fan-Out (peer second opinion), Delegation Gate, engineer role card — THE DEFAULT WORKHORSE: whole bounded tasks end-to-end, Fable Budget Invariants, fable-engineer role card — Opt-in orchestrator-tier solo executor, Intent Interview, Orchestration Doctrine (AGENTS.md), peer-engineer role card — Blind second opinion (GPT lineage) (+13 more)

### Community 20 - "Graphify Skill (nested copy)"
Cohesion: 0.20
Nodes (19): main(), parse_complete(), _rank_ok(), scores: {(task_id, label): {SCORE_KEY: int}}. For each task the 'complete' label, Live: the judge model must rank each complete ref above its stub., No API, no key: prove the GATE catches under-delivery. A well-ordered matrix mus, run(), selftest() (+11 more)

### Community 21 - "Orchestration Doctrine & Roles"
Cohesion: 0.18
Nodes (18): normalizeConfigMode(), normalizeMode(), normalizePersistedMode(), writeDefaultMode(), { DEFAULT_MODE, normalizeMode, normalizePersistedMode }, filterSkillBodyForMode(), fs, getFallbackInstructions() (+10 more)

### Community 22 - "Completeness Judge"
Cohesion: 0.10
Nodes (18): assert, claudeDir, configDir, configPath, env, flagPath, fs, home (+10 more)

### Community 23 - "Ponytail Mode Resolution"
Cohesion: 0.14
Nodes (15): fs, getClaudeDir(), getConfigDir(), getConfigPath(), getDefaultMode(), isShellSafe(), os, path (+7 more)

### Community 24 - "Uninstall Script Tests"
Cohesion: 0.08
Nodes (23): export, cardBg, infoBg, pageBg, name, $schema, vars, ash (+15 more)

### Community 25 - "Ponytail Config Loader"
Cohesion: 0.21
Nodes (12): DESCRIPTIONS, fs, NAMES, outPath(), path, render(), ROOT, sourceBody() (+4 more)

### Community 26 - "Porcelain Theme Variables"
Cohesion: 0.06
Nodes (33): enum, type, enum, type, format, type, minimum, type (+25 more)

### Community 27 - "OpenClaw Skill Builder"
Cohesion: 0.17
Nodes (8): j, meta, rows, tbl, assert, cases, loc, score()

### Community 28 - "Example Generator & LOC Metric"
Cohesion: 0.05
Nodes (35): Config Index (semantic audit map), Config changelog (backfilled history), applyTitle(), formatElapsed(), APHORISMS, BANNER_LINES, BANNER_WIDTH, computeContextLine() (+27 more)

### Community 29 - "Task Tracker Extension"
Cohesion: 0.17
Nodes (4): Task, TaskDetails, TaskListComponent, TaskParams

### Community 30 - "Ponytail MCP Package"
Cohesion: 0.17
Nodes (11): dependencies, @modelcontextprotocol/sdk, zod, description, license, name, private, scripts (+3 more)

### Community 31 - "Rule-Copy Checker"
Cohesion: 0.17
Nodes (9): agents, canonical, copies, fs, INVARIANTS, path, root, skill (+1 more)

### Community 32 - "Gemini Extension Tests"
Cohesion: 0.18
Nodes (11): assert, fs, loadManifest(), path, read(), REUSED_COMMANDS, REUSED_SKILLS, root (+3 more)

### Community 33 - "Keybindings Schema"
Cohesion: 0.05
Nodes (35): additionalProperties, allOf, description, $id, required, $schema, title, type (+27 more)

### Community 34 - "Ponytail MCP Server"
Cohesion: 0.29
Nodes (6): export, cardBg, infoBg, pageBg, name, $schema

### Community 36 - "OpenClaw Skill Publisher"
Cohesion: 0.31
Nodes (8): modeArg, server, buildInstructions(), { getDefaultMode, normalizeMode }, { getPonytailInstructions }, MODES, require, resolveMode()

### Community 37 - "OpenCode Plugin Tests"
Cohesion: 0.18
Nodes (9): assert, commands, fs, os, path, root, skillCommands, { spawnSync } (+1 more)

### Community 38 - "Trust Schema"
Cohesion: 0.20
Nodes (7): fs, passthrough, path, root, skillsDir, slugs, { spawnSync }

### Community 39 - "Behavior Gates"
Cohesion: 0.20
Nodes (8): assert, fs, os, path, { pathToFileURL }, statePath, test, tmp

### Community 40 - "Windows Hook Tests"
Cohesion: 0.36
Nodes (7): execute(), findGraphRoot(), fmtAge(), GraphParams, GraphStats, runGraphify(), statusText()

### Community 41 - "Local Ollama Benchmark"
Cohesion: 0.36
Nodes (7): AgentConfig, AgentDiscoveryResult, AgentScope, discoverAgents(), findNearestProjectAgentsDir(), isDirectory(), loadAgentsFromDir()

### Community 42 - "Plugin Marketplace Manifest"
Cohesion: 0.25
Nodes (5): CHECKS, assert, behavior, check(), test

### Community 43 - "OpenCode Plugin"
Cohesion: 0.22
Nodes (7): assert, fs, HOST_PLUGIN_MANIFESTS, path, root, { spawn }, test

### Community 44 - "porcelain.json"
Cohesion: 0.44
Nodes (8): check_autocommit_liveness(), check_connectivity_ratchet(), check_flag_staleness(), check_graph_freshness(), check_reflection_drift(), check_semantic_cache_drift(), git(), main()

### Community 46 - "Copilot Plugin Tests"
Cohesion: 0.39
Nodes (7): call_ollama(), count_loc(), load_arms(), main(), Ponytail local benchmark — runs the same 5 tasks against any Ollama model. No pr, Non-blank, non-comment lines of code: fenced blocks, or the whole     response w, run()

### Community 47 - "Schema Manifest"
Cohesion: 0.25
Nodes (7): description, name, owner, name, url, plugins, $schema

### Community 48 - "Porcelain Dark Theme"
Cohesion: 0.25
Nodes (5): __dirname, { getDefaultMode, normalizePersistedMode }, { getPonytailInstructions }, require, statePath

### Community 49 - "Pi Extension (Ponytail)"
Cohesion: 0.25
Nodes (6): distinct, fs, path, root, VERSION_FILES, versions

### Community 50 - "Package Scripts"
Cohesion: 0.25
Nodes (7): assert, commands, fs, path, piSource, root, test

### Community 51 - "Pi Rewind Package"
Cohesion: 0.25
Nodes (6): assert, fs, path, REQUIRED_COMMAND_FILES, root, test

### Community 52 - "Scrollback Fix Harness"
Cohesion: 0.40
Nodes (5): AuditResult, PIPELINE_AUDIT, runScript(), runValidator(), VALIDATOR

### Community 53 - "claude-email.js"
Cohesion: 0.25
Nodes (5): candidates, extDir, jiti, nm, PKG

### Community 55 - "Scrollback Harness Copy"
Cohesion: 0.33
Nodes (5): name, private, scripts, test, type

### Community 57 - "Statusline Script"
Cohesion: 0.40
Nodes (4): dependencies, pi-rewind, name, private

### Community 60 - "Publish Workflow"
Cohesion: 0.22
Nodes (7): fs, path, system, fs, path, system, Path

## Knowledge Gaps
- **588 isolated node(s):** `PKG`, `nm`, `extDir`, `candidates`, `jiti` (+583 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `Config Index (semantic audit map)` (3× useful, score=2.998295634)
- `~/.pi/agent config repo overview` (3× useful, score=2.998265495)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Config Index (semantic audit map)` connect `Example Generator & LOC Metric` to `Heuristics Extension`, `Keybindings Schema`, `Ponytail MCP Server`, `TUI Extensions & Config Index`, `Ponytail Ruleset & Mirrors`, `Windows Hook Tests`, `Ponytail Hook Tests`, `Correctness Gate`, `Uninstall Script Tests`, `Task Tracker Extension`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `~/.pi/agent config repo overview` connect `Ponytail Ruleset & Mirrors` to `Example Generator & LOC Metric`, `Subagent Dispatch Tool`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `Ponytail project (lazy senior dev skill)` connect `Subagent Dispatch Tool` to `Hermes Plugin`, `Ponytail Ruleset & Mirrors`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `PKG`, `nm`, `extDir` to the rest of the system?**
  _621 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Heuristics Extension` be split into smaller, more focused modules?**
  _Cohesion score 0.057967313585291114 - nodes in this community are weakly interconnected._
- **Should `Porcelain Dark Palette` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `Porcelain Light Palette` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._