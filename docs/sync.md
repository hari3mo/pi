# Multi-Machine Sync (peer <-> peer)

The `~/.pi/agent` repo syncs between machines (Mac laptop + EC2) through
`origin` (github.com/hari3mo/pi). Both machines are **peers**: each runs pi,
each commits, each pushes/pulls the same `main`.

## Moving parts

| Piece | Role |
|---|---|
| `.pi-vcs/sync.sh` | The sync loop: snapshot-commit -> fetch -> rebase -> push. Offline-safe (skips network step), lock-guarded, aborts cleanly on real conflicts. Supersedes `autocommit.sh` (commit-only, macOS-only paths). |
| `.gitattributes` | `merge=union` for append-only runtime logs (`learning/events.jsonl`, `learning/receipts.jsonl`, `heuristics/*.jsonl`) — concurrent appends from two machines merge without conflict. Consumers treat these as unordered event sets keyed by id, so cross-machine line order is irrelevant. |
| `scripts/bootstrap-peer.sh` | One-shot idempotent setup of a new peer (clone, pinned pi install, hooks, cron). |
| macOS trigger | launchd `local.pi-agent-vcs.plist` -> `.pi-vcs/sync.sh` (WatchPaths + 300s interval). |
| Linux trigger | cron `*/5 * * * *` -> `.pi-vcs/sync.sh` (installed by bootstrap). |

## What syncs / what doesn't

Syncs: extensions, skills, prompts, wiki, heuristics, learning events/digests,
docs, schema, scripts, patches, agents, config, settings.json, keybindings.json,
AGENTS.md, themes.

Never syncs (gitignored, per-machine): `auth.json` (credentials), `trust.json`,
`sessions/`, `bin/`, `node_modules/`, `graphify-out/` (derived; rebuilt by the
post-commit hook), undo-backups, logs.

## Single-writer rules (avoid split-brain)

- **Learning distiller runs on the Mac ONLY** (nightly Hermes cron). Peers
  append events; one machine distills and advances `.distiller-cursor`.
  Running a second distiller elsewhere would race the cursor.
- `settings.json` / `AGENTS.md` / extension code: last-writer-wins per line via
  normal git. Editing the SAME line on both machines between syncs is the one
  case that produces a real conflict — sync.sh aborts the rebase, keeps the
  local commit, and logs to `.git/pi-sync.err`; resolve manually with
  `git pull --rebase`.

## Cross-platform invariants (keep it portable)

- No literal `/Users/<name>` or `/home/<name>` paths in tracked code — derive
  from `$HOME` / `process.env.HOME` (see `extensions/lib/knowledge-router.ts`).
- pi version is pinned in `scripts/bootstrap-peer.sh`; after `pi update` on one
  machine, update the pin and run the same update on the peer (the wiki
  self-audit flags stale `upstream` pages either way).
- `bin/` is not synced: install platform binaries per-machine.

## Ongoing use

Nothing to do — the schedulers sync every 5 minutes on both ends. To force a
sync now: `bash ~/.pi/agent/.pi-vcs/sync.sh`. To check health:
`git -C ~/.pi/agent status && git -C ~/.pi/agent log --oneline -3` and
`tail ~/.pi/agent/.git/pi-sync.err`.
