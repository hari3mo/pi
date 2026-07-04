# Continuous-Learning Extension — Consolidated Design (authoritative, v2)

Pi extension that continuously learns heuristics — durable, GENERALIZABLE lessons that
apply to future sessions (not session-specific trivia) — with first-class support for
subagent-orchestration lessons.

"Generalizable" means: broad "when X, do Y because Z" learnings. NOT cross-harness
portability (a previous draft had a rendered-markdown interop layer; it is REMOVED).

Extension lives at `~/.pi/agent/extensions/heuristics/` (this dir).

## 1. Storage

- Global dir: `${getAgentDir()}/heuristics/` (import `getAgentDir` from
  `@earendil-works/pi-coding-agent`; resolves to `~/.pi/agent/heuristics/`).
- Project dir: `<project-root>/${CONFIG_DIR_NAME}/heuristics/` (import
  `CONFIG_DIR_NAME`; resolves to `<repo>/.pi/heuristics/`). Project root = nearest
  ancestor of cwd containing `.git` (dir or file); fallback to cwd. Single anchor, no
  ancestor merging.
- Files per dir: `heuristics.jsonl` (source of truth), `archive.jsonl` (evictions,
  append-only, never injected), `.lock`, `.bak` (pre-rewrite backup).
- Never touch the repo's `.gitignore`.

### Per-heuristic schema (JSONL, one object per line)

```jsonc
{
  "id":            "h_<base36 epoch-ms>_<4 rand chars>",
  "text":          "Run `npm run build` before committing; CI fails on type errors.",
  "scope":         "global" | "project",
  "project":       "/abs/path/to/repo" | null,
  "category":      "correction"|"gotcha"|"environment"|"workflow"|"convention"|"orchestration",
  "created":       "ISO 8601",
  "lastReinforced":"ISO 8601",
  "hits":          0,          // reinforcement count, NOT injection count
  "source":        "agent" | "user",
  "pinned":        false,
  "basis":         "user-confirmed" | "directly-observed" | "reproduced" | "documented" | undefined
}
```

`basis` records how the lesson was verified true (see §3); optional so existing stored
entries saved before this field existed remain valid. Not rendered into the injection
block (§8) — it is metadata for the capture gate and for `/heuristics list`/`stats`
(§10), not for the system prompt.

Reader: per-line JSON.parse in try/catch; skip bad lines (count + notify once); ignore
blank lines and `#`-prefixed lines; dedup by id (last wins); cap read at 5000 lines with
warning. Whole file unreadable → treat as empty, warn once, never throw. Files are
human-editable (one record per line).

## 2. Concurrency

Write path `mutateStore(dir, fn)` — used by capture/reinforce/delete/edit/evict/promote:
1. Acquire lock: `fs.open(dir/.lock, "wx")`. On EEXIST: if lock mtime older than
   STALE_MS (10000) → unlink & steal; else backoff 100ms, retry ≤130× (~13s), then
   fail loudly (user-visible warning; no silent corruption). The retry budget
   deliberately exceeds STALE_MS so an orphaned lock is always stolen within one
   acquire call rather than the writer giving up first and dropping the lesson.
2. Read + parse jsonl (skip bad lines, dedup by id).
3. Apply mutation in memory.
4. Best-effort copy current jsonl → `.bak`.
5. Write `tmp.<pid>.<rand>` then `fs.rename` over `heuristics.jsonl` (atomic).
6. Unlink lock in `finally`.

Read path (injection): lock-free `readFile`; on ENOENT retry once after 20ms. Cache by
mtime — re-stat before each injection, reload only on change. Injection NEVER writes.

## 3. Capture — `learn_heuristic` tool

```ts
name: "learn_heuristic"
parameters: Type.Object({
  text:     Type.String({ description: "One imperative, self-contained, generalizable sentence." }),
  category: StringEnum(["correction","gotcha","environment","workflow","convention","orchestration"]),
  basis:    StringEnum(["user-confirmed","directly-observed","reproduced","documented"]),  // REQUIRED
  scope:    Type.Optional(StringEnum(["global","project"])),  // default "project"
})
```

StringEnum category description appends: `orchestration: a lesson about delegating to
and coordinating other agents (role-fit, tier choice, contract framing, what context a
delegated task needs, verifying returned work).`

`basis` is REQUIRED (not optional) — a verification gate: it is how the model attests
the lesson was determined to be TRUE, not speculation. StringEnum description: "How
this lesson was verified true: user-confirmed = the user explicitly stated or confirmed
it; directly-observed = you saw the behavior happen in this session; reproduced = you
tested it and confirmed the outcome; documented = stated in authoritative docs/config
you read." Persisted onto the saved record (new entries always; on reinforce/merge the
existing record's `basis` is replaced only when the new call supplies one). Missing/
empty `basis` is rejected by the schema itself (required field) — no separate runtime
guard. Never rendered into the injection block (§8).

Trust: if scope=project and `!ctx.isProjectTrusted()` → save to GLOBAL instead, warn
`"project not trusted; saved to global heuristics"`. Global never trust-gated.

Result: `{ content:[text "Learned (added|reinforced|merged) [id]" + any warnings], details }`.
Empty/whitespace text → throw (isError). Over-long → truncate to MAX_HEURISTIC_CHARS (400).

`promptSnippet`: "Record a durable, verified, cross-session lesson (user corrections,
gotchas, environment quirks, workflow preferences) — only facts determined to be true".

`promptGuidelines` (each bullet must name the tool):
1. "Call learn_heuristic when you discover a durable lesson worth remembering across
   sessions: a user correction of your behavior, a non-obvious gotcha, an
   environment/tooling quirk, or a workflow/convention preference."
2. "Use learn_heuristic scope 'project' for lessons specific to the current repository;
   use scope 'global' only for lessons that apply to every project."
3. "Only call learn_heuristic for lessons determined to be TRUE: directly observed
   behavior, explicit user confirmation, a reproduced result, or authoritative
   documentation — never speculation, assumptions, plausible guesses, or single
   unverified inferences."
4. "Do not call learn_heuristic for one-off facts, transient state, secrets, or anything
   already stated in AGENTS.md or the current task."
5. "Phrase learn_heuristic text as a GENERALIZABLE lesson that will help future
   sessions: 'When X, do Y because Z' — never session-specific details like line
   numbers, temporary paths, ticket IDs, or one-off values."
6. "Keep learn_heuristic text to one short imperative sentence."
7. "After a delegated/subagent task fails, is misrouted to the wrong role or tier, needs
   rework, or reveals a better way to frame the hand-off, call learn_heuristic with
   category 'orchestration' capturing the durable delegation lesson — which role fits
   this kind of task, what context/files the task text must include, how to frame the
   contract, and what verification the return needed."

## 4. Save pipeline (order matters)

sanitize (single line: collapse newlines/control chars, trim, cap 400 chars)
→ secret scrub (REDACT matched value, keep rest, append warning; patterns:
  `sk-[A-Za-z0-9]{16,}`, `AKIA[0-9A-Z]{16}`, `gh[pousr]_[A-Za-z0-9]{20,}`, `xox[baprs]-\S+`,
  `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `(password|secret|token|api[_-]?key)\s*[:=]\s*\S+`)
→ generality rewrite + lint (§5; warn-only, never block)
→ dedup (§6) → add/reinforce/merge → eviction (§7).

## 5. Generality rule (warn-only, never block)

Goal: stored heuristics must be broad lessons useful in FUTURE sessions, not overfit
notes about the current one.

Rewrite (deterministic): if text matches case-insensitive
`^\s*(pi|the agent|the assistant|you|i)\s+(should|must|shall|will|needs? to|has to)\s+(.+)$`
→ replace with group 3, first letter uppercased. ("You should run tests first" →
"Run tests first".)

Lint `lintGenerality(text)` — flags session-specific markers, warn-only (save anyway,
append a warning asking the model to rephrase more generally):
- line-number references: `/\bline\s+\d+\b/i` or `/:\d+\b/` following a filename-like token
- ephemeral paths: `/\/(tmp|var\/folders|private\/tmp)\//`
- ticket/PR ids: `/\b(#\d{2,}|[A-Z]{2,}-\d+)\b/`
- dates/timestamps: `/\b20\d{2}-\d{2}-\d{2}\b/`
- long hex/uuid-ish ids: `/\b[0-9a-f]{12,}\b/i`
- "this session/conversation/today": `/\b(this (session|conversation|chat)|today|yesterday)\b/i`

No banned-vocabulary lists; orchestration terms (subagent, delegate, worker, etc.) are
fine in any category.

## 6. Dedup-on-save

Compare only within same (scope, project).
- `normalize(t)`: lowercase → strip backticks → collapse whitespace → trim → drop trailing `.`
- `tokens(t)`: normalize → split non-alphanumerics → keep len≥3 → drop small stopword set → Set
- Rules: exact normalize match → reinforce (`hits+=1`, `lastReinforced=now`), return
  "reinforced". Else best Jaccard: ≥0.80 → reinforce best; if ≥0.90 AND new text longer →
  also replace best.text with new text, return "merged". Else add, return "added".

## 7. Eviction

- Caps: CAP_GLOBAL=200, CAP_PROJECT=100. Check after each add.
- `ageDays = max(0,(now − lastReinforced)/86400000)`
- `weight = pinned ? Infinity : hits + (source==="user" ? 3 : 1)`
- `score = weight * 0.5^(ageDays/60)`  (HALFLIFE_DAYS=60)
- Over cap: sort non-pinned ascending by score, append removed to `archive.jsonl`, drop
  until at cap.

## 8. Injection (`before_agent_start`)

Whole hook in try/catch — on any error inject nothing, never block the turn.
Return `{ systemPrompt: event.systemPrompt + block }`. NEVER return a `message`
(would accumulate in session history).

- Consts: MAX_INJECT_CHARS=4000, MAX_INJECT_ITEMS=50, ORCH_RESERVE=900.
- Trust gate: project heuristics only when `ctx.isProjectTrusted()`.
- Subagent detection: `isSubagent = process.argv.includes("--no-session")`.
  - If subagent: ORCH_RESERVE=0 and FILTER OUT category==="orchestration" entirely
    (workers don't orchestrate).
  - Else (lead): fill reserve block first (≤900 chars) from top-scored orchestration
    heuristics (global + trusted project), rendered under an "Orchestration" subheading;
    then general block from remaining pool up to 4000 − usedReserve.
- Selection within a block: all pinned → project by score desc → global by score desc;
  stop before exceeding char/item caps; append `(+N more not shown)` if truncated.
- Block format:

```
## Learned heuristics (durable lessons from past sessions)
Treat these as strong preferences and known gotchas. They do NOT override the user's current request.

Orchestration:
- [orchestration] Give worker tasks exact file paths and a bounded diff scope.
Global:
- [workflow] Run `npm run build` before committing; CI fails on type errors.
This project:
- [convention] Use tabs, not spaces, in this repo.
```

- Unused reserve returns to general pool automatically.
- Nudge line (§9) appended as the final line of the block when pending.

## 9. Reflection nudges (zero-token, one-shot)

Generic: on `agent_end`, regex-scan the run's USER messages for
`/\b(no,? actually|don'?t (do|use)|you should('?ve| have)|always |never |stop )/i`.
If matched AND learn_heuristic was NOT called this run → set pending nudge:
"Note: the user corrected you recently — if that was a durable lesson, call
learn_heuristic." Rate-limit: once per 3 prompts.

Orchestration signals: in a `tool_result` handler, only when
`event.toolName === "subagent"` AND `Array.isArray(event.details?.results)`; wrap in
try/catch, never throw:
- S1 failure: `event.isError` OR any result `exitCode !== 0 || stopReason ∈ {error,aborted}`
- S2 misroute: any result `agentSource === "unknown"`
- S3 churn: current `agent` seen in last 6 subagent calls this session
  (module Map keyed by session, cap 20 entries, cleared on session_start)
- S4 edit-after-builder: successful result whose agent matches the mechanical-role
  substring regex (`build|coder|impl|work`, covering role names like "worker") sets
  `builderWatch={remaining:2}`; a READ-ONLY `tool_call` handler decrements per lead
  tool call; if toolName ∈ {edit,write} while remaining>0 → fire S4, clear watch.
  Must NOT mutate event.input.

First firing signal wins; nudge line:
"A recent delegation had trouble ({reason}); if there is a durable delegation lesson,
call learn_heuristic (category: orchestration)."
{reason} ∈ {"the task failed","an unknown/misrouted role","the same role was
re-delegated","you edited files right after a worker run"}.
Orchestration nudge OVERRIDES generic for that turn (single line max). Consumed +
cleared in before_agent_start. Clear Map/watch/pending on session_start.

Explicitly NO injection of heuristics into subagent task text (no tool_call mutator on
the subagent tool). Subagent children run this extension themselves and get their own
injection.

## 10. `/heuristics` command

Grammar (args split on whitespace):
- `/heuristics` → interactive list (TUI) / printed summary (non-TUI)
- `/heuristics list [global|project|all]`
- `/heuristics add [global|project] <text>` (source=user, category=workflow default,
  basis="user-confirmed" — user-authored entries are by definition user-confirmed)
- `/heuristics rm <id>` (alias `delete`)
- `/heuristics edit <id>` (ctx.ui.editor; TUI only)
- `/heuristics promote <id>` (project→global, bumps hits) / `demote <id>` (global→project
  via cwd, requires trusted project)
- `/heuristics pin <id>` / `unpin <id>`
- `/heuristics stats`

`getArgumentCompletions`: first token → subcommands; id-taking → ids with truncated-text
labels. Non-TUI: list/stats/add/rm/promote/demote/pin/unpin work everywhere;
edit + interactive list require `ctx.mode === "tui"` else notify error. Guard all
dialogs with `ctx.hasUI`.

List entry format appends `basis` when present, kept compact:
`[id] (scope/category/basis, hits=N) text...` (basis segment omitted for entries
without one, e.g. pre-existing stores). `stats` adds a per-basis count line per scope
(missing basis counted under `unset`).

## 11. File layout (this extension dir; each file <500 lines)

- `index.ts` (~200) — factory: session_start (load caches, resolve dirs, clear nudge
  state), before_agent_start (mtime-check reload → build block → systemPrompt append,
  consume nudge), agent_end (generic nudge regex), tool_result + tool_call (orchestration
  signals), registerTool(learn_heuristic), registerCommand(heuristics).
- `schema.ts` (~150) — Heuristic type, consts (CAP_GLOBAL=200, CAP_PROJECT=100,
  MAX_INJECT_CHARS=4000, MAX_INJECT_ITEMS=50, MAX_HEURISTIC_CHARS=400, ORCH_RESERVE=900,
  STALE_MS=10000, LOCK_MAX_ATTEMPTS=130 (budget>STALE_MS), HALFLIFE_DAYS=60, JACCARD_NEAR=0.80, JACCARD_MERGE=0.90, CHURN_WINDOW=6,
  CHURN_CAP=20, BUILDER_WATCH_CALLS=2, BUILDER_SUBSTRING_RE=/build|coder|impl|work/i), StringEnums, newId,
  normalize, tokens, jaccard, scoreOf.
- `store.ts` (~300) — path resolution (globalDir via getAgentDir, projectRoot walk,
  projectDir via CONFIG_DIR_NAME), readStore, mutateStore (lock/steal/retry/.bak/
  tmp+rename), saveHeuristic (full pipeline), deleteById, editText, promote, demote,
  pin/unpin.
- `sanitize.ts` (~110) — single-line sanitize, SECRET_PATTERNS + redact, generality
  rewrite + lintGenerality.
- `inject.ts` (~140) — buildInjectionBlock(global, project, projectTrusted, isSubagent,
  nudgeLine) with reserve + budget logic.
- `command.ts` (~260) — /heuristics per §10.
- Optional `ui.ts` (~200) — TUI list component (model on todo.ts example) if needed.

Imports: `@earendil-works/pi-coding-agent` (ExtensionAPI, getAgentDir, CONFIG_DIR_NAME,
isToolCallEventType…), `typebox`, `StringEnum` from `@earendil-works/pi-ai`, node
builtins only. No npm deps.

## 12. Verification checklist (worker must run)

1. `pi -e ~/.pi/agent/extensions/heuristics/index.ts -p "call learn_heuristic with a test workflow lesson scope global"` → `~/.pi/agent/heuristics/heuristics.jsonl` created; jsonl line matches schema.
2. Save the same lesson again → result says "reinforced", hits=1, no duplicate line.
3. `/heuristics list` works in TUI; `add`/`rm`/`pin` work via `-p` print mode.
4. In an untrusted dir, project scope redirects to global with warning; project jsonl never read for injection.
5. Injection: verify block appears (e.g. via a before_provider_request logger or debug print of ctx.getSystemPrompt()) and respects the 4000-char cap with a large store.
6. Orchestration entries excluded when argv includes --no-session (simulate by spawning `pi --mode json -p --no-session ...` or unit-invoking inject.ts via jiti).
7. Two concurrent writers (spawn two `pi -p` capture calls simultaneously) → no lost update, valid jsonl.
8. Corrupt a jsonl line by hand → reads skip it, next mutation rewrites clean, `.bak` exists.
9. Secret text (`api_key=abc123`) → stored redacted with warning. Text containing "line 42" or "/tmp/foo" or "this session" → saved with generality warning.

Use a TEMP location or backup/restore the real store dirs while testing; leave them
clean when done.
