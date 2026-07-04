#!/usr/bin/env python3
"""pi-agent pipeline meta-audit — are the self-audit pipelines themselves alive?

validate-config.py audits static config; this audits DYNAMICS: did the
automation fire, is anything drifting, is graph quality holding its ratchet.

Fast mode (default, <1s, stdlib-only — run at session start):
  1. Graph freshness: a code commit newer than graph.json + slack means the
     post-commit rebuild pipeline did not fire (it is async and silent).
  2. needs_update staleness: doc semantics flagged stale for >24h are rotting.
  3. Autocommit liveness: dirty working tree + old last snapshot = launchd dead.
  4. Graph connectivity ratchet: giant-component fraction is compared against
     the best value ever recorded (graphify-out/.pipeline_baseline.json);
     a >20% drop below baseline means structural regression (e.g. the
     semantic-layer wipe of 2026-07-04: giant 615 -> 126).
  5. Reflection drift: graph memory newer than LESSONS.md means reflect stopped.

  6. Toolchain change detection: pi / graphifyy / node versions are recorded
     in the baseline; a change WARNs once with the re-verification list
     (pi-tui patch, extension smoke, hook filter) — upgrades become audited
     events instead of silent drift.

Full mode (--full, spawns the pinned graphify python — run from /audit):
  7. Semantic cache drift: LLM-extracted docs whose cache entry no longer
     matches content (edited without re-cache) would be silently dropped by
     the next rebuild.
  8. Extension load smoke: every extension is loaded with pi's own jiti
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

REBUILD_SLACK_S = 15 * 60
FLAG_STALE_S = 24 * 3600
AUTOCOMMIT_STALE_S = 2 * 3600
RATCHET_TOLERANCE = 0.8  # warn when giant fraction < 80% of best-ever

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
        ids = [n["id"] for n in data["nodes"]]
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


PI_PKG = Path.home() / ".local/lib/node_modules/@earendil-works/pi-coding-agent"


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
    check_reflection_drift()
    check_toolchain_versions()
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
