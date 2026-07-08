#!/bin/bash
# Bootstrap a PEER machine (e.g. a Linux EC2 box) from the pi-agent config repo.
# Idempotent: safe to re-run. Run as the login user, NOT root.
#
#   curl -fsSL https://raw.githubusercontent.com/hari3mo/pi/main/scripts/bootstrap-peer.sh | bash
# or after a manual clone:
#   bash ~/.pi/agent/scripts/bootstrap-peer.sh
#
# What it does:            What it does NOT do:
#   - clone repo             - copy auth.json / credentials (set up per-machine)
#   - install pinned pi      - copy sessions/ or trust.json (machine-local)
#   - wire git hooks         - install the nightly learning distiller (runs on
#   - schedule sync             ONE machine only — the Mac; see docs/sync.md)
set -euo pipefail

REPO_URL="${PI_REPO_URL:-git@github.com:hari3mo/pi.git}"
AGENT_DIR="$HOME/.pi/agent"
PI_VERSION="0.80.3"   # keep pinned to the version the config was authored against

echo "== pi peer bootstrap =="

# ---- 0. prerequisites --------------------------------------------------------
for cmd in git node npm; do
  command -v "$cmd" >/dev/null || { echo "MISSING: $cmd — install it first (git, node>=20, npm)"; exit 1; }
done

# ---- 1. clone (or reuse) the config repo ------------------------------------
if [ -d "$AGENT_DIR/.git" ]; then
  echo "-- repo already present at $AGENT_DIR"
else
  mkdir -p "$HOME/.pi"
  git clone "$REPO_URL" "$AGENT_DIR"
fi
cd "$AGENT_DIR"

# ---- 2. install pi at the pinned version ------------------------------------
if command -v pi >/dev/null && [ "$(pi --version 2>/dev/null)" = "$PI_VERSION" ]; then
  echo "-- pi $PI_VERSION already installed"
else
  echo "-- installing @earendil-works/pi-coding-agent@$PI_VERSION to ~/.local"
  npm install -g --prefix "$HOME/.local" "@earendil-works/pi-coding-agent@$PI_VERSION"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi

# ---- 3. git identity + hooks + auth check ------------------------------------
git config core.hooksPath .pi-vcs/hooks
git config user.name  "hari3mo"
git config user.email "harisasaif@gmail.com"
if ! git ls-remote origin -h >/dev/null 2>&1; then
  cat <<'EOF'
!! origin not reachable. Set up auth first, one of:
   - SSH deploy key:  ssh-keygen -t ed25519 && add ~/.ssh/id_ed25519.pub to
     github.com/hari3mo/pi > Settings > Deploy keys (allow write)
   - gh CLI:          gh auth login   (then: gh auth setup-git)
then re-run this script.
EOF
  exit 1
fi

# ---- 4. schedule the sync loop (cron, every 5 min — mirrors the Mac launchd) --
CRON_LINE="*/5 * * * * /bin/bash $AGENT_DIR/.pi-vcs/sync.sh >> $HOME/.local/state/pi-sync.log 2>&1"
mkdir -p "$HOME/.local/state"
if ! crontab -l 2>/dev/null | grep -qF ".pi-vcs/sync.sh"; then
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
  echo "-- cron sync installed (every 5 min)"
else
  echo "-- cron sync already installed"
fi

# ---- 5. machine-local pieces you must do by hand ------------------------------
cat <<'EOF'

== bootstrap complete ==
Remaining manual steps on this machine:
  1. pi auth: run `pi` once and log in (writes ~/.pi/agent/auth.json — never committed).
  2. Optional: rebuild the code graph:  cd ~/.pi/agent && npx graphify   (or your usual path)
  3. Verify:  cd ~/.pi/agent && node scripts/smoke-extensions.mjs && python3 scripts/validate-config.py
The nightly learning distiller stays on the Mac (single-writer). This peer only
appends to learning/events.jsonl; union-merge in .gitattributes makes concurrent
appends conflict-free.
EOF
