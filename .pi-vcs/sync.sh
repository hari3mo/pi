#!/bin/bash
# Auto-snapshot ~/.pi/agent config into git AND sync with the peer remote.
# Portable: macOS (launchd) + Linux (cron/systemd). Supersedes autocommit.sh
# (which only committed, never pushed, and hardcoded the macOS home path).
#
# Sync model (peer <-> peer via origin/main):
#   1. commit local changes (same self-damping snapshot as before)
#   2. pull --rebase from origin; append-only jsonl files merge via the
#      union driver declared in .gitattributes (learning/*.jsonl,
#      heuristics/*.jsonl) so concurrent peers never conflict on them
#   3. push; a REAL conflict (same line of the same tracked config file
#      edited on both machines) aborts the rebase, leaves the repo clean
#      on the local commit, and logs — nothing is ever lost, next run
#      retries after you resolve manually
set -uo pipefail
REPO="${PI_AGENT_DIR:-$HOME/.pi/agent}"
cd "$REPO" || exit 0

LOCKDIR="$REPO/.git/pi-sync.lockdir"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  exit 0                        # another sync run is in flight
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

# ---- 1. commit local changes ------------------------------------------------
git add -A
if ! git diff --cached --quiet; then
  ts="$(date "+%Y-%m-%dT%H:%M:%S%z")"
  host="$(hostname -s)"
  changed="$(git diff --cached --name-status | sed 's/^/    /')"

  # Optional: fold in the latest pi breadcrumb if the extension layer is enabled.
  crumb=""
  for BC in "$HOME/Library/Logs/pi-agent-vcs-breadcrumbs.jsonl" \
            "$HOME/.local/state/pi-agent-vcs-breadcrumbs.jsonl"; do
    [ -f "$BC" ] && crumb="$(tail -n 1 "$BC" 2>/dev/null)" && break
  done

  msg="auto: pi-agent config snapshot ${ts}

host: ${host}
user: ${USER}
trigger: scheduler (launchd|cron)
changed:
${changed}"
  [ -n "$crumb" ] && msg="${msg}

last-pi-tool-edit: ${crumb}"

  # pre-commit hook (core.hooksPath) is the secret backstop; do not bypass it.
  git -c user.name='hari3mo' -c user.email='harisasaif@gmail.com' \
      commit -q -m "$msg" || { echo "[$(date)] commit aborted (see pre-commit hook)" >&2; exit 0; }
fi

# ---- 2. sync with peer ------------------------------------------------------
# Skip network work when offline / remote unreachable; retry next tick.
if ! git fetch -q origin 2>/dev/null; then
  exit 0
fi

ahead_behind="$(git rev-list --left-right --count origin/main...main 2>/dev/null || echo '0 0')"
behind="${ahead_behind%%	*}"; ahead="${ahead_behind##*	}"
[ "$behind" = "0" ] && [ "$ahead" = "0" ] && exit 0   # fully in sync

if [ "$behind" != "0" ]; then
  # GRAPHIFY_SKIP_HOOK: post-commit graph rebuild is skipped during rebase
  # anyway (hook checks rebase state), but be explicit for replayed commits.
  if ! git -c rebase.autoStash=true rebase -q origin/main 2>>"$REPO/.git/pi-sync.err"; then
    git rebase --abort 2>/dev/null
    echo "[$(date)] pi-sync: REAL merge conflict with origin/main — resolve manually in $REPO (local commits preserved)" >&2
    exit 0
  fi
fi

git push -q origin main 2>>"$REPO/.git/pi-sync.err" || true
