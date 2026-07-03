#!/bin/bash
# Auto-snapshot ~/.pi/agent config into git. Triggered by launchd.
# Captures BOTH pi-tool edits and manual editor edits (filesystem-level).
set -uo pipefail
REPO="/Users/harissaif/.pi/agent"
cd "$REPO" || exit 0

git add -A
if git diff --cached --quiet; then
  exit 0                      # nothing changed — self-damping, no commit
fi

ts="$(date "+%Y-%m-%dT%H:%M:%S%z")"
host="$(hostname -s)"
changed="$(git diff --cached --name-status | sed 's/^/    /')"

# Optional: fold in the latest pi breadcrumb if the extension layer is enabled.
crumb=""
BC="$HOME/Library/Logs/pi-agent-vcs-breadcrumbs.jsonl"
[ -f "$BC" ] && crumb="$(tail -n 1 "$BC" 2>/dev/null)"

msg="auto: pi-agent config snapshot ${ts}

host: ${host}
user: ${USER}
trigger: launchd (watchpaths|interval)
changed:
${changed}"
[ -n "$crumb" ] && msg="${msg}

last-pi-tool-edit: ${crumb}"

# pre-commit hook (core.hooksPath) is the secret backstop; do not bypass it.
git -c user.name='hari3mo' -c user.email='harisasaif@gmail.com' \
    commit -q -m "$msg" || echo "[$(date)] commit aborted (see pre-commit hook)" >&2
