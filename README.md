# ~/.pi/agent — pi configuration

Git-tracked, schema-audited pi harness configuration. Snapshots are committed
automatically (launchd → `.pi-vcs/autocommit.sh`), so every config change has
an audit trail; `git log` is the change history.

## Directory standard

| Path | Contents | Tracked |
|------|----------|---------|
| `agents/` | Subagent role definitions (scope-planner, architect, builder, qa-reviewer, shipper) | yes |
| `extensions/` | TUI/tool extensions (heuristics, subagent, write-gate, UI) | yes |
| `prompts/` | Prompt templates (`/design`, `/build`, `/ship`, `/feature`) | yes |
| `schema/` | JSON Schemas + `manifest.json` (validation registry) | yes |
| `scripts/` | Maintenance tooling (`validate-config.py`) | yes |
| `skills/` | Skills (symlinks into the obsidian_wiki package) | yes (as links) |
| `themes/` | Theme JSON | yes |
| `heuristics/` | **Global** heuristics store (`heuristics.jsonl`) — injected into every session | yes |
| `sessions/` | Conversation logs | **no** (may contain pasted secrets) |
| `bin/` | Third-party binaries (rg, fd) | **no** (reproducible via brew) |
| `auth.json`, `trust.json` | Credentials / machine-local state | **no** (fail-closed `.gitignore`) |
| `settings.json`, `keybindings.json` | Portable preferences | yes |

Project-scoped heuristics live outside this repo at `<git-root>/.pi/heuristics/`
per project (the home directory acts as the fallback "project" → `~/.pi/heuristics/`).
Harness-level lessons belong in the **global** store — the validator flags drift.

## Schema policy (malleable by design)

Every machine-readable config artifact is registered in `schema/manifest.json`
and validated by `scripts/validate-config.py`. Schemas are **malleable**:

- Known keys are type-checked; invariants are enforced (enums, scope/project
  coherence, entry caps).
- `additionalProperties: true` everywhere — pi upgrades and extension growth
  never break validation.
- **pi creates new schemas as needed**: when a new config artifact appears,
  any pi session should author a malleable schema for it in `schema/` and add
  a target entry to `schema/manifest.json`. The validator is manifest-driven —
  no code change required.

## Auditing

```sh
python3 ~/.pi/agent/scripts/validate-config.py            # report
python3 ~/.pi/agent/scripts/validate-config.py --strict   # warnings fail too
```

Checks: schema conformance (json + jsonl), heuristics scope drift, credential
patterns in tracked files, gitignore coverage of sensitive paths, dangling
skill symlinks, and layout conformance. Errors exit 1; the layout check only
reports unrecognized directories as info (add them to `manifest.json` →
`layout` when intentional).
