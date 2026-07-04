# Graph Report - .  (2026-07-04)

## Corpus Check
- 216 files · ~159,471 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 632 nodes · 745 edges · 73 communities (24 shown, 49 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 52 edges
2. `colors` - 52 edges
3. `Single-shot benchmark (promptfoo, 5 tasks x 3 models)` - 18 edges
4. `vars` - 17 edges
5. `vars` - 17 edges
6. `Orchestration Doctrine (AGENTS.md)` - 15 edges
7. `The Ladder (YAGNI→reuse→stdlib→native→dep→one line→minimum)` - 14 edges
8. `_fail()` - 13 edges
9. `_ok()` - 13 edges
10. `_import()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `graphify SKILL.md (nested duplicate copy)` --semantically_similar_to--> `Graphify skill (knowledge-graph pipeline)`  [INFERRED] [semantically similar]
  .pi/agent/skills/graphify/SKILL.md → skills/graphify/SKILL.md
- `graphify references/add-watch.md (nested duplicate copy)` --semantically_similar_to--> `graphify ref: URL add + folder watch`  [INFERRED] [semantically similar]
  .pi/agent/skills/graphify/references/add-watch.md → skills/graphify/references/add-watch.md
- `graphify references/exports.md (nested duplicate copy)` --semantically_similar_to--> `graphify ref: Extra exports + benchmark`  [INFERRED] [semantically similar]
  .pi/agent/skills/graphify/references/exports.md → skills/graphify/references/exports.md
- `graphify references/extraction-spec.md (nested duplicate copy)` --semantically_similar_to--> `graphify ref: Extraction subagent prompt spec`  [INFERRED] [semantically similar]
  .pi/agent/skills/graphify/references/extraction-spec.md → skills/graphify/references/extraction-spec.md
- `graphify references/github-and-merge.md (nested duplicate copy)` --semantically_similar_to--> `graphify ref: GitHub clone + cross-repo merge`  [INFERRED] [semantically similar]
  .pi/agent/skills/graphify/references/github-and-merge.md → skills/graphify/references/github-and-merge.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Seven-role subagent roster** — agents_engineer_role, agents_worker_role, agents_scout_role, agents_verifier_role, agents_reviewer_role, agents_peer_engineer_role, agents_fable_engineer_role [EXTRACTED 1.00]
- **Benchmark honesty arc (single-shot → critique → agentic → verification)** — git_github_com_dietrichgebert_ponytail_benchmarks_readme_single_shot, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_17_agentic_safety_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_18_agentic_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_17_cost_verification_result, git_github_com_dietrichgebert_ponytail_benchmarks_results_2026_06_22_issue_245_217_comprehension_result [INFERRED 0.85]
- **Cross-agent rule distribution (aligned mirrors)** — git_github_com_dietrichgebert_ponytail_agents_rules_ponytail_rules, git_github_com_dietrichgebert_ponytail_clinerules_ponytail_rules, git_github_com_dietrichgebert_ponytail_github_copilot_instructions_rules, git_github_com_dietrichgebert_ponytail_kiro_steering_ponytail_rules, git_github_com_dietrichgebert_ponytail_windsurf_rules_ponytail_rules, git_github_com_dietrichgebert_ponytail_agents_ruleset [EXTRACTED 1.00]
- **Graphify pipeline documentation set** — skills_graphify_skill_skill, skills_graphify_references_add_watch_ref, skills_graphify_references_exports_ref, skills_graphify_references_extraction_spec_ref, skills_graphify_references_github_and_merge_ref, skills_graphify_references_hooks_ref, skills_graphify_references_query_ref, skills_graphify_references_transcribe_ref, skills_graphify_references_update_ref [EXTRACTED 1.00]

## Communities (73 total, 49 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (52): colors, accent, bashMode, border, borderAccent, borderMuted, customMessageBg, customMessageLabel (+44 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (52): colors, accent, bashMode, border, borderAccent, borderMuted, customMessageBg, customMessageLabel (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (35): additionalProperties, allOf, description, $id, required, $schema, title, type (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (37): Config Index (semantic audit map), Config changelog (backfilled history), learn_heuristic capture pipeline (sanitize→scrub→lint→dedup→evict), Heuristics extension design (v2, authoritative), Eviction scoring (60-day half-life decay), Heuristics injection block (4000-char budget, orch reserve), Zero-token reflection nudges (S1-S4 signals), Q&A: Why does the config index bridge six com (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (37): Hermes after-install notes, ponytail: ceiling-comment convention, Bug fix = root cause, not symptom (grep every caller), Ruleset mirror for agents, Compact always-on ruleset (AGENTS.md), Never-lazy floor (validation, data loss, security, a11y), Benchmark result: v4 hardening: test reflex + ceiling comments, no bloat creep, Benchmark result: parseaddr email slip is provider-specific (OpenAI), Claude 100% (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (33): enum, type, enum, type, format, type, minimum, type (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (28): _contained(), _fail(), _find(), _find_class(), _import(), _import_pkg(), _ok(), Path (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (27): aggregate(), chat_code_loc(), _claude_version(), code_stats(), _count(), _git(), git_diff_stats(), _git_snapshot() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (27): The Ladder (YAGNI→reuse→stdlib→native→dep→one line→minimum), Chart: median LOC per arm (518/116/39 Haiku etc.), Vendored caveman skill (terse-prose control arm), benchmark config: Behavior gates (hardware/explanation/one-check probes), benchmark config: Claude 3-arm config, benchmark config: Gemini config, benchmark config: GPT-mini issue-65 repro config, benchmark config: Newest-OpenAI config (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (26): npm publish workflow (OIDC trusted publishing), author, name, url, bugs, url, description, exports (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (25): additionalProperties, type, type, enum, type, description, items, type (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (23): export, cardBg, infoBg, pageBg, name, $schema, vars, amber (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (21): Any, build_injected_context(), _config_dir(), _default_mode(), _fallback_instructions(), _filter_skill_body_for_mode(), _handle_mode_command(), _make_skill_command_handler() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (22): Chart: agentic metrics vs baseline (LOC 46%, tokens 78%), Mascot logo, dark-mode variant, Mascot dark logo (SVG source), GreenPT sponsor logo (dark), GreenPT sponsor logo, Ponytail mascot: hand-drawn ink portrait, ponytail + oval glasses, unimpressed stare, Social preview: 'He says nothing. He writes one line. It works.' + mascot, Waitlist banner: 'He's building something' terminal card (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (22): graphify references/add-watch.md (nested duplicate copy), graphify references/exports.md (nested duplicate copy), graphify references/extraction-spec.md (nested duplicate copy), graphify references/github-and-merge.md (nested duplicate copy), graphify references/hooks.md (nested duplicate copy), graphify references/query.md (nested duplicate copy), graphify references/transcribe.md (nested duplicate copy), graphify references/update.md (nested duplicate copy) (+14 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (21): Blind Fan-Out (peer second opinion), Delegation Gate, engineer role card — THE DEFAULT WORKHORSE: whole bounded tasks end-to-end, Fable Budget Invariants, fable-engineer role card — Opt-in orchestrator-tier solo executor, Intent Interview, Orchestration Doctrine (AGENTS.md), peer-engineer role card — Blind second opinion (GPT lineage) (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (19): main(), parse_complete(), _rank_ok(), scores: {(task_id, label): {SCORE_KEY: int}}. For each task the 'complete' label, Live: the judge model must rank each complete ref above its stub., No API, no key: prove the GATE catches under-delivery. A well-ordered matrix mus, run(), selftest() (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (16): autocommit.sh script, Autocommit snapshot infra (launchd + pre-commit), ~/.pi/agent config repo overview, Malleable schema policy, check_git_hygiene(), check_heuristics_hygiene(), check_layout(), check_symlinks() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (11): dependencies, @modelcontextprotocol/sdk, zod, description, license, name, private, scripts (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.39
Nodes (7): call_ollama(), count_loc(), load_arms(), main(), Ponytail local benchmark — runs the same 5 tasks against any Ollama model. No pr, Non-blank, non-comment lines of code: fenced blocks, or the whole     response w, run()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): description, name, owner, name, url, plugins, $schema

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (5): name, private, scripts, test, type

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): dependencies, pi-rewind, name, private

## Knowledge Gaps
- **374 isolated node(s):** `autocommit.sh script`, `$schema`, `name`, `description`, `name` (+369 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Config Index (semantic audit map)` connect `Community 3` to `Community 17`, `Community 2`, `Community 11`, `Community 15`?**
  _High betweenness centrality (0.328) - this node is a cross-community bridge._
- **Why does `~/.pi/agent config repo overview` connect `Community 17` to `Community 3`, `Community 4`, `Community 14`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `Ponytail project (lazy senior dev skill)` connect `Community 4` to `Community 17`, `Community 13`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **What connects `autocommit.sh script`, `$schema`, `name` to the rest of the system?**
  _406 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._