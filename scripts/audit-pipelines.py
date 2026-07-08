#!/usr/bin/env python3
"""pi-agent pipeline meta-audit — are the self-audit pipelines themselves alive?

validate-config.py audits static config; this audits DYNAMICS: did the
automation fire, is anything drifting, is graph quality holding its ratchet.

Fast mode (default, <1s, stdlib-only — run at session start):
  1. Graph freshness: a code commit newer than graph.json + slack means the
     post-commit rebuild pipeline did not fire (it is async and silent).
  2. needs_update staleness: doc semantics flagged stale for >24h are rotting.
  3. Autocommit liveness: dirty working tree + old last snapshot = launchd dead.
  4. Graph connectivity ratchet: giant-component fraction (over CONFIG-REPO
     nodes only — the vendored git/ subtree is excluded, see GIANT_SCOPE) is
     compared against the best value ever recorded
     (graphify-out/.pipeline_baseline.json); a >20% drop below baseline means
     structural regression (e.g. the semantic-layer wipe of 2026-07-04:
     giant 615 -> 126).
  5. Reflection drift: graph memory newer than LESSONS.md means reflect stopped.
  5b. Graph-first bypass drift: a high recorded bypass ratio in
     .graph_first_stats.json means the graph keeps failing to answer structure
     searches (re-cache or loosen the detector). Silent when the file is absent.

  6. Toolchain change detection: pi / graphifyy / node versions are recorded
     in the baseline; a change WARNs once with the re-verification list
     (pi-tui patch, extension smoke, hook filter) — upgrades become audited
     events instead of silent drift.
  7. Wiki upstream staleness: wiki vault pages stamped source_layer:
     upstream carry a pi_version:; a page stamped against a pi version other
     than the live one WARNs once (count + examples) so the session re-verifies
     it against the updated docs. Fail-open: no vault / no obtainable pi
     version -> skip (local/learned pages never go stale).

Full mode (--full, spawns the pinned graphify python — run from /audit):
  8. Semantic cache drift: LLM-extracted docs whose cache entry no longer
     matches content (edited without re-cache) would be silently dropped by
     the next rebuild.
  9. Extension load smoke: every extension is loaded with pi's own jiti
     loader against a fake pi (scripts/smoke-extensions.mjs) — catches
     ExtensionAPI/layout breakage after a pi upgrade.

Output format matches validate-config.py (ERROR/WARN/INFO lines) so
extensions/self-audit.ts merges both into one injected block.
Exit codes: 0 = clean (or warnings), 1 = errors.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

AGENT_DIR = Path(os.environ.get("PI_AGENT_DIR", Path.home() / ".pi" / "agent"))
OUT = AGENT_DIR / "graphify-out"
BASELINE = OUT / ".pipeline_baseline.json"
WIKI = AGENT_DIR / "wiki"

REBUILD_SLACK_S = 15 * 60
FLAG_STALE_S = 24 * 3600
AUTOCOMMIT_STALE_S = 2 * 3600
RAW_STALE_S = 14 * 24 * 3600  # wiki/_raw drafts older than this are rotting
RAW_MAX_FILES = 5             # more than this many un-promoted drafts backs up
LEARNING = AGENT_DIR / "learning"
EVENTS_STALE_S = 7 * 24 * 3600   # events.jsonl untouched this long -> taps dead
CURSOR_LAG_S = 7 * 24 * 3600     # distiller cursor this far behind -> distiller dead
EVENTS_MAX_BYTES = 10 * 1024 * 1024  # runaway tap guard (learning/SCHEMA.md)
RATCHET_TOLERANCE = 0.8  # warn when giant fraction < 80% of best-ever
# The ratchet measures CONFIG-REPO cohesion only. Nodes under the vendored git/
# subtree (git/github.com/DietrichGebert/ponytail — a registered pi extension
# package) are excluded from the fraction: they are legitimately present but
# their sole bridge to the config repo is a shared `path` import, so a full
# rebuild that detaches them can crater an all-nodes fraction (~0.48 residual,
# docs/config-index.md 2026-07-04) with zero real config-repo regression.
# Bumping GIANT_SCOPE invalidates the recorded best-ever and recalibrates the
# baseline to the current scoped fraction — the pre-scoping best (0.79) was
# computed over the un-scoped node set and is incomparable.
GIANT_SCOPE = "config-repo-v1"

CODE_SUFFIXES = {".py", ".ts", ".js", ".mjs", ".mts", ".sh", ".json", ".yaml", ".yml"}

errors: list[str] = []
warnings: list[str] = []
infos: list[str] = []


def git(*args: str) -> str:
    r = subprocess.run(["git", "-C", str(AGENT_DIR), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def check_graph_freshness() -> None:
    graph = OUT / "graph.json"
    if not graph.exists():
        infos.append("pipeline: no graph.json — graph pipeline not in use here")
        return
    out = git("log", "-1", "--format=%ct %H", "--", ".")
    if not out:
        return
    last_commit_ts = int(out.split()[0])
    # Only code files trigger the rebuild pipeline; find last commit touching code
    names = git("show", "--name-only", "--format=", "HEAD").splitlines()
    touched_code = any(Path(n).suffix.lower() in CODE_SUFFIXES for n in names if n)
    if touched_code and last_commit_ts - graph.stat().st_mtime > REBUILD_SLACK_S:
        warnings.append(
            f"pipeline: graph.json is older than the last code commit by more than "
            f"{REBUILD_SLACK_S // 60}min — the post-commit rebuild did not fire "
            "(check .pi-vcs/hooks/post-commit; run /graph update)")


def check_flag_staleness() -> None:
    flag = OUT / "needs_update"
    if flag.exists() and time.time() - flag.stat().st_mtime > FLAG_STALE_S:
        warnings.append(
            "pipeline: needs_update flag older than 24h — doc semantics are rotting; "
            "run /graphify --update")


def check_autocommit_liveness() -> None:
    if not (AGENT_DIR / ".git").exists():
        return
    dirty = git("status", "--porcelain")
    if not dirty:
        return
    out = git("log", "-1", "--format=%ct")
    if out and time.time() - int(out) > AUTOCOMMIT_STALE_S:
        warnings.append(
            "pipeline: working tree dirty and last snapshot >2h old — launchd "
            "autocommit may be dead (audit trail gap)")


def check_connectivity_ratchet() -> None:
    graph = OUT / "graph.json"
    if not graph.exists():
        return
    try:
        data = json.loads(graph.read_text(encoding="utf-8"))
        # Scope to config-repo nodes; the vendored git/ subtree is connectivity
        # noise (see GIANT_SCOPE). Links touching a dropped node auto-skip below
        # via the idx.get(...) is None guard, so no separate link filter is needed.
        ids = [n["id"] for n in data["nodes"]
               if not str(n.get("source_file") or "").startswith("git/")]
        idx = {i: k for k, i in enumerate(ids)}
        parent = list(range(len(ids)))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for l in data["links"]:
            a, b = idx.get(l["source"]), idx.get(l["target"])
            if a is None or b is None:
                continue
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
        from collections import Counter
        sizes = Counter(find(i) for i in range(len(ids)))
        giant = max(sizes.values()) / max(1, len(ids))
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        errors.append(f"pipeline: graph.json unreadable for connectivity check — {e}")
        return

    baseline = _read_baseline()
    # Recalibrate when the metric definition changes: a best recorded under a
    # different scope is incomparable, so discard it (see GIANT_SCOPE).
    if baseline.get("giant_fraction_scope") != GIANT_SCOPE:
        baseline["best_giant_fraction"] = 0.0
        baseline["giant_fraction_scope"] = GIANT_SCOPE
    best = baseline.get("best_giant_fraction", 0.0)
    if best and giant < best * RATCHET_TOLERANCE:
        errors.append(
            f"pipeline: giant-component fraction {giant:.2f} dropped >20% below the "
            f"recorded best {best:.2f} — structural regression (semantic layer wiped? "
            "check the last rebuild; see docs/config-index.md 2026-07-04)")
    baseline["best_giant_fraction"] = max(best, giant)
    baseline["last_giant_fraction"] = giant
    baseline["last_checked"] = int(time.time())
    _write_baseline(baseline)


def _read_baseline() -> dict:
    if BASELINE.exists():
        try:
            return json.loads(BASELINE.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    return {}


def _write_baseline(baseline: dict) -> None:
    # ponytail: atomic replace, no lock file. Concurrent session-start audits
    # race on this file; each writes a full baseline and os.replace() is atomic
    # within the dir, so the last writer wins without a torn/partial read.
    try:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        tmp = BASELINE.with_name(f".{BASELINE.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(baseline, indent=2), encoding="utf-8")
        os.replace(tmp, BASELINE)
    except OSError:
        pass


def _resolve_pi_pkg() -> Path:
    """Installed pi package, portably (mirrors scripts/lib/jiti-loader.mjs):
    PI_PKG env override -> `npm root -g` (fnm/nvm/brew layouts) -> legacy ~/.local."""
    if env := os.environ.get("PI_PKG"):
        return Path(env)
    try:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=10).stdout.strip()
        if root and (p := Path(root) / "@earendil-works" / "pi-coding-agent").is_dir():
            return p
    except Exception:
        pass
    return Path.home() / ".local/lib/node_modules/@earendil-works/pi-coding-agent"


PI_PKG = _resolve_pi_pkg()


def _pi_version() -> str | None:
    """Live installed pi version from its package manifest (the same source the
    toolchain baseline reads), or None if unobtainable — callers fail open."""
    try:
        return json.loads((PI_PKG / "package.json").read_text(encoding="utf-8")).get("version") or None
    except (ValueError, OSError):
        return None


def check_wiki_staleness() -> None:
    # Fast path: a line-grep of the wiki vault frontmatter (no YAML dep).
    # Upstream wiki pages (source_layer: upstream) carry a pi_version: stamp;
    # per wiki/SCHEMA.md a pi update makes any page stamped against the old
    # version suspect (local/learned pages never go stale). WARN once with the
    # count + a few examples so the session re-verifies them against the updated
    # docs before trusting them. Fail open: no vault or no obtainable pi version
    # -> skip silently.
    if not WIKI.is_dir():
        return
    cur = _pi_version()
    if not cur:
        return

    def field(fm: list[str], key: str) -> str | None:
        for line in fm:
            if line.startswith(key + ":"):
                # strip the value's inline "# comment" (SCHEMA.md-style stamps)
                return line.split(":", 1)[1].split("#", 1)[0].strip()
        return None

    stale: list[str] = []
    unstamped: list[str] = []
    for page in sorted(WIKI.rglob("*.md")):
        try:
            lines = page.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        # Only inspect the YAML frontmatter block (--- ... ---), never the body,
        # so SCHEMA.md's own template/examples cannot false-match.
        if not lines or lines[0].strip() != "---":
            continue
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
        if end is None:
            continue
        fm = lines[1:end]
        if field(fm, "source_layer") != "upstream":
            continue
        ver = field(fm, "pi_version")
        rel = str(page.relative_to(WIKI))
        # SCHEMA.md requires every upstream page to carry pi_version; a missing or
        # empty stamp is unstamped (can't be checked for staleness), so it warns too.
        if not ver:
            unstamped.append(rel)
        elif ver != cur:
            stale.append(rel)
    flagged = stale + unstamped
    if flagged:
        kinds = []
        if stale:
            kinds.append(f"{len(stale)} stamped for a pi version other than the live {cur}")
        if unstamped:
            kinds.append(f"{len(unstamped)} with a missing/empty pi_version (unstamped)")
        sample = ", ".join(flagged[:5])
        warnings.append(
            f"pipeline: {len(flagged)} wiki upstream page(s) need re-verification "
            f"({'; '.join(kinds)}) — re-verify their claims against the current pi "
            f"docs/examples and re-stamp (wiki/SCHEMA.md staleness protocol): "
            f"{sample}{'...' if len(flagged) > 5 else ''}")


def check_toolchain_versions() -> None:
    # Upgrades are audited events: WARN once when pi/graphifyy/node change.
    current: dict[str, str] = {}
    pkg = PI_PKG / "package.json"
    if pkg.exists():
        try:
            current["pi"] = json.loads(pkg.read_text(encoding="utf-8")).get("version", "?")
        except (ValueError, OSError):
            pass
    else:
        infos.append(f"pipeline: pi package not found at {PI_PKG} — install layout "
                     "changed; update PI_PKG here and the tui path in validate-config.py")
    py_file = OUT / ".graphify_python"
    if py_file.exists():
        try:
            r = subprocess.run(
                [py_file.read_text(encoding="utf-8").strip(), "-c",
                 "import importlib.metadata as m; print(m.version('graphifyy'))"],
                capture_output=True, text=True, timeout=20)
            if r.returncode == 0:
                current["graphifyy"] = r.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    node = subprocess.run(["node", "--version"], capture_output=True, text=True)
    if node.returncode == 0:
        current["node"] = node.stdout.strip().lstrip("v").split(".")[0]

    baseline = _read_baseline()
    recorded = baseline.get("toolchain", {})
    changed = [f"{k} {recorded[k]} -> {v}" for k, v in current.items()
               if k in recorded and recorded[k] != v]
    if changed:
        warnings.append(
            f"pipeline: toolchain changed ({'; '.join(changed)}) — re-verify: pi-tui "
            "scrollback patch (validate-config.py warns if lost), extension loads "
            "(/audit runs the smoke), graphify hook doc-filter. This warning shows once.")
    if current and current != recorded:
        baseline["toolchain"] = {**recorded, **current}
        _write_baseline(baseline)


def check_extension_loads() -> None:
    smoke = AGENT_DIR / "scripts" / "smoke-extensions.mjs"
    if not smoke.exists():
        warnings.append("pipeline: scripts/smoke-extensions.mjs missing — extension "
                        "load coverage lost")
        return
    try:
        r = subprocess.run(["node", str(smoke)], capture_output=True, text=True,
                           cwd=str(AGENT_DIR), timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        warnings.append(f"pipeline: extension smoke could not run — {e}")
        return
    for line in r.stdout.splitlines():
        if line.startswith("ERROR"):
            errors.append(line.removeprefix("ERROR").strip())


def _read_stats_list(path: Path) -> list | None:
    """A JSON stats array, or None if absent/unreadable/not-a-list (fail open)."""
    if not path.exists():
        return None
    try:
        recs = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    return recs if isinstance(recs, list) else None


def check_graph_first_drift() -> None:
    # Fast path: a local file read. The graph-first extension appends per-session
    # {nudges,blocks,bypasses} to .graph_first_stats.json. A high bypass ratio
    # means the graph keeps failing to answer structure searches (users re-run
    # the blocked grep to proceed) — re-cache or loosen the detector. Silent when
    # the stats file is absent (feature not yet exercised — fail open).
    recs = _read_stats_list(OUT / ".graph_first_stats.json")
    if recs is None:
        return
    blocks = sum(int(r.get("blocks", 0)) for r in recs if isinstance(r, dict))
    bypasses = sum(int(r.get("bypasses", 0)) for r in recs if isinstance(r, dict))
    denom = blocks + bypasses
    # Require a few events so a single bypass can't trip the warning.
    if denom >= 4 and bypasses / denom > 0.5:
        warnings.append(
            f"pipeline: graph-first bypass ratio {bypasses}/{denom} exceeds 50% across "
            "recorded sessions — the graph is not answering structure searches; re-cache "
            "(/graphify --update) or loosen the detector in extensions/graph-first.ts")


def check_lead_profile_coverage() -> None:
    # Fast path: a local file read. extensions/lead-config.ts appends per-session
    # {models, profiles, fallbacks, fallbackModels} to .lead_config_stats.json.
    # A model id that repeatedly resolves to the fallback ('direct') profile
    # across many sessions means the roster drifted: that lead is being run
    # often with only generic doctrine — add a tailored profile or extend a
    # match pattern in config/lead-profiles.json. Silent when the stats file is
    # absent (feature not yet exercised — fail open).
    recs = _read_stats_list(OUT / ".lead_config_stats.json")
    if recs is None:
        return
    # Count DISTINCT sessions each model id fell back in.
    sessions_by_model: dict[str, int] = {}
    for r in recs:
        if not isinstance(r, dict):
            continue
        fbm = r.get("fallbackModels")
        if not isinstance(fbm, list):
            continue
        for mid in set(m for m in fbm if isinstance(m, str) and m):
            sessions_by_model[mid] = sessions_by_model.get(mid, 0) + 1
    # Require sustained use so a one-off model can't trip the warning.
    THRESHOLD = 5
    drifted = sorted(m for m, n in sessions_by_model.items() if n >= THRESHOLD)
    if drifted:
        warnings.append(
            f"pipeline: model id(s) {', '.join(drifted)} resolved to the fallback lead "
            f"profile in >= {THRESHOLD} recorded sessions — roster drifted; add a tailored "
            "profile or extend a match pattern in config/lead-profiles.json")


def check_raw_staging_rot() -> None:
    # Fast path: a directory listing. wiki/_raw is LEGACY staging (the old
    # knowledge-compound flow); the nightly distiller drains it, after which
    # this checks residual/manual drafts only. WARN
    # when the backlog grows (> RAW_MAX_FILES) or a draft has sat unpromoted for
    # > 14 days. Fail open: no vault / no _raw dir -> skip (not an error).
    raw = WIKI / "_raw"
    if not raw.is_dir():
        return
    files = [p for p in raw.iterdir() if p.is_file() and not p.name.startswith(".")]
    if not files:
        return
    now = time.time()
    stale = [p for p in files if now - p.stat().st_mtime > RAW_STALE_S]
    if len(files) <= RAW_MAX_FILES and not stale:
        return
    reasons: list[str] = []
    if len(files) > RAW_MAX_FILES:
        reasons.append(f"{len(files)} staged draft(s) (> {RAW_MAX_FILES})")
    if stale:
        oldest_days = int((now - min(p.stat().st_mtime for p in stale)) / 86400)
        reasons.append(f"{len(stale)} older than 14d (oldest ~{oldest_days}d)")
    warnings.append(
        f"pipeline: wiki/_raw staging is backing up ({'; '.join(reasons)}) — review "
        "and promote to synthesis/ (or delete) per wiki/SCHEMA.md, or let the "
        "nightly distiller drain it (learning/SCHEMA.md)")


def check_learning_liveness() -> None:
    # Learning-pipeline liveness (learning/SCHEMA.md): the v1 loop died silently
    # because nothing watched its stages. Guard both ends: taps writing (events
    # mtime), distiller consuming (cursor lag), and runaway growth.
    events = LEARNING / "events.jsonl"
    if not events.exists():
        return  # pipeline not yet active in this install — not an error
    now = time.time()
    size = events.stat().st_size
    if size > EVENTS_MAX_BYTES:
        errors.append(
            f"pipeline: learning/events.jsonl is {size // (1024 * 1024)}MB (> 10MB) — "
            "runaway tap; inspect learning-tap buffering/caps before it floods the distiller")
    if now - events.stat().st_mtime > EVENTS_STALE_S:
        warnings.append(
            "pipeline: learning/events.jsonl untouched for > 7d — capture taps may be "
            "dead (learning-tap extension not loading, or genuinely no sessions)")
    cursor = LEARNING / ".distiller-cursor"
    if not cursor.exists():
        if now - events.stat().st_mtime > CURSOR_LAG_S:
            warnings.append(
                "pipeline: learning events exist but no .distiller-cursor — the nightly "
                "distiller (Hermes cron) has never run; check `hermes` cron wiring")
        return
    try:
        last_run = json.loads(cursor.read_text(encoding="utf-8")).get("lastRunTs", "")
        run_ts = time.mktime(time.strptime(last_run[:19], "%Y-%m-%dT%H:%M:%S")) if last_run else 0
    except Exception:
        warnings.append("pipeline: learning/.distiller-cursor unreadable — distiller state suspect")
        return
    if events.stat().st_mtime - run_ts > CURSOR_LAG_S:
        warnings.append(
            "pipeline: distiller cursor > 7d behind newest learning events — the nightly "
            "distiller (Hermes cron) looks dead; new lessons are piling up unprocessed")


def check_reflection_drift() -> None:
    mem = OUT / "memory"
    lessons = OUT / "reflections" / "LESSONS.md"
    if not mem.is_dir():
        return
    newest = max((f.stat().st_mtime for f in mem.glob("*.md")), default=0)
    if newest and (not lessons.exists() or lessons.stat().st_mtime < newest - 3600):
        infos.append("pipeline: graph memory newer than LESSONS.md — reflect will "
                     "catch up at next session start (or run: graphify reflect)")


def check_semantic_cache_drift() -> None:
    py_file = OUT / ".graphify_python"
    if not py_file.exists():
        return
    py = py_file.read_text(encoding="utf-8").strip()
    snippet = (
        "import json;"
        "from pathlib import Path;"
        "from graphify.detect import detect;"
        "from graphify.cache import check_semantic_cache;"
        "d = detect(Path('.'));"
        "fs = [f for c in ('document','paper','image') for f in d['files'].get(c, [])];"
        "n,e,h,unc = check_semantic_cache(fs, root='.');"
        "print(json.dumps(unc))"
    )
    r = subprocess.run([py, "-c", snippet], capture_output=True, text=True,
                       cwd=str(AGENT_DIR), timeout=120)
    if r.returncode != 0:
        warnings.append(f"pipeline: semantic cache check failed — {r.stderr.strip()[:200]}")
        return
    try:
        unc = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return
    if unc:
        rels = [str(Path(u)).replace(str(AGENT_DIR) + "/", "") for u in unc[:5]]
        warnings.append(
            f"pipeline: {len(unc)} doc(s) have no matching semantic-cache entry "
            f"(edited without re-cache?) — their graph semantics drop on the next "
            f"doc rebuild: {', '.join(rels)}{'...' if len(unc) > 5 else ''}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--full", action="store_true", help="include graphify-backed checks (slower)")
    args = ap.parse_args()

    check_graph_freshness()
    check_flag_staleness()
    check_autocommit_liveness()
    check_connectivity_ratchet()
    check_graph_first_drift()
    check_lead_profile_coverage()
    check_raw_staging_rot()
    check_learning_liveness()
    check_reflection_drift()
    check_toolchain_versions()
    check_wiki_staleness()
    if args.full:
        check_semantic_cache_drift()
        check_extension_loads()

    for msg in errors:
        print(f"ERROR  {msg}")
    for msg in warnings:
        print(f"WARN   {msg}")
    for msg in infos:
        print(f"INFO   {msg}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
