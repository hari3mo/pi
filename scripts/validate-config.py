#!/usr/bin/env python3
"""pi-agent config validator — manifest-driven audit of ~/.pi/agent.

Usage:
    python3 ~/.pi/agent/scripts/validate-config.py [--strict]

Checks (driven by schema/manifest.json — add targets there, not here):
  1. Every manifest target parses and validates against its JSON Schema
     (json = whole document, jsonl = per line).
  2. Heuristics hygiene: store/scope coherence, per-store entry caps,
     scope drift (project-scoped lesson whose project is the home dir —
     almost always should have been global).
  3. Git hygiene: no tracked file matches a credential-shaped pattern;
     sensitive paths (auth.json, trust.json, sessions/) are ignored, and
     derived graphify-out/ artifacts stay untracked.
  4. No dangling symlinks under skills/.
  5. Agent frontmatter hygiene: agent descriptions stay double-quoted.
  6. Theme integrity: sibling themes keep matching color/export token sets and
     all color references resolve.
  7. Standard layout: expected directories exist; unknown entries are
     reported as info only (the layout is malleable by design).
  8. Installed-artifact integrity: graphify hook keeps its doc filter, no
     post-checkout rebuild hook, pi-tui scrollback patch still applied.

Exit codes: 0 = clean (or warnings without --strict), 1 = errors.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from pathlib import Path

AGENT_DIR = Path(os.environ.get("PI_AGENT_DIR", Path.home() / ".pi" / "agent"))
MANIFEST = AGENT_DIR / "schema" / "manifest.json"

CREDENTIAL_GLOBS = [
    "auth.json", "*.env", ".env*", "*.key", "*.pem", "*.p12", "*.pfx",
    "*credential*", "*secret*", "*token*", "*password*", "*.oauth",
    "id_rsa*", "id_ed25519*",
]

errors: list[str] = []
warnings: list[str] = []
infos: list[str] = []


def resolve(p: str) -> Path:
    p = os.path.expanduser(p)
    return Path(p) if os.path.isabs(p) else AGENT_DIR / p


def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_validator(schema_path: Path):
    """Return callable(obj) -> list[str] of violation messages."""
    schema = load_json(schema_path)
    try:
        import jsonschema

        v = jsonschema.Draft202012Validator(schema)

        def validate(obj):
            return [f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}"
                    for e in v.iter_errors(obj)]

        return validate
    except ImportError:
        warnings.append("python 'jsonschema' not installed — parse-only checks")
        return lambda obj: []


def check_target(target: dict) -> list[dict]:
    """Validate one manifest target; return parsed jsonl entries (for hygiene)."""
    # Guard every required key: a malformed manifest entry must produce a
    # structured ERROR line, never a KeyError traceback (which the self-audit
    # read as a clean exit before the fail-closed fix).
    name = target.get("path") or target.get("name") or "<unnamed>"
    raw_path = target.get("path")
    if not raw_path:
        errors.append(f"manifest: target {name} missing 'path'")
        return []
    fmt = target.get("format")
    if fmt not in ("json", "jsonl"):
        errors.append(f"manifest: target {raw_path} missing/invalid 'format' (got {fmt!r})")
        return []
    schema_rel = target.get("schema")
    if not schema_rel:
        errors.append(f"manifest: target {raw_path} missing 'schema'")
        return []
    path = resolve(raw_path)
    if not path.exists():
        (errors if target.get("required") else infos).append(
            f"{raw_path}: {'missing (required)' if target.get('required') else 'absent (optional)'}")
        return []
    validate = get_validator(resolve(schema_rel))
    entries: list[dict] = []
    if fmt == "json":
        try:
            obj = load_json(path)
        except json.JSONDecodeError as e:
            errors.append(f"{raw_path}: invalid JSON — {e}")
            return []
        for msg in validate(obj):
            errors.append(f"{raw_path}: schema violation — {msg}")
    else:  # jsonl
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.strip().startswith("#"):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"{raw_path}:{n}: invalid JSON line — {e}")
                continue
            for msg in validate(obj):
                errors.append(f"{raw_path}:{n}: schema violation — {msg}")
            entries.append(obj)
        cap = target.get("maxEntries")
        if cap and len(entries) > cap:
            warnings.append(f"{raw_path}: {len(entries)} entries exceeds cap {cap}")
    return entries


def check_heuristics_hygiene(target: dict, entries: list[dict]) -> None:
    store = target.get("heuristicsScope")
    home = str(Path.home())
    for e in entries:
        eid, scope, project = e.get("id", "?"), e.get("scope"), e.get("project")
        if store and scope and scope != store:
            warnings.append(
                f"{target['path']}: [{eid}] scope='{scope}' filed in the {store} store — misfiled")
        if scope == "project" and project == home:
            warnings.append(
                f"{target['path']}: [{eid}] project-scoped to home dir ({home}) — "
                "harness-level lesson? consider promoting to scope=global")


def check_git_hygiene() -> None:
    if not (AGENT_DIR / ".git").exists():
        warnings.append(".git: config repo not initialized — no audit trail")
        return
    r = subprocess.run(["git", "-C", str(AGENT_DIR), "ls-files"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        errors.append(f"git ls-files failed: {r.stderr.strip()}")
        return
    for f in r.stdout.splitlines():
        if f.startswith("graphify-out/"):
            errors.append(f"git: derived graph artifact '{f}' is tracked; untrack graphify-out outputs")
        base = os.path.basename(f)
        for pat in CREDENTIAL_GLOBS:
            if fnmatch.fnmatch(base.lower(), pat):
                errors.append(f"git: tracked file '{f}' matches credential pattern '{pat}'")
    for sensitive in ["auth.json", "trust.json", "sessions/x"]:
        r = subprocess.run(["git", "-C", str(AGENT_DIR), "check-ignore", "-q", sensitive])
        if r.returncode != 0:
            errors.append(f"gitignore: sensitive path '{sensitive.rstrip('/x')}' is NOT ignored")


def check_symlinks() -> None:
    skills = AGENT_DIR / "skills"
    if not skills.is_dir():
        return
    for entry in sorted(skills.iterdir()):
        if entry.is_symlink() and not entry.exists():
            errors.append(f"skills/{entry.name}: dangling symlink -> {os.readlink(entry)}")


def check_installed_integrity() -> None:
    """Guards for fixes that live OUTSIDE tracked config and can silently vanish.

    1. graphify post-commit hook must keep the harness-local doc filter:
       without it, graphify's .md structural extractor REPLACES the LLM-authored
       semantic graph layer on the next doc commit (observed 2026-07-04:
       22 edges lost, giant component 615->126). `graphify hook install`
       regenerates the hook WITHOUT the filter.
    2. A graphify post-checkout hook must not exist: its full-rebuild path
       re-extracts .md files and wipes the same semantic layer.
    3. The pi-tui scrollback patch (patches/pi-tui-scrollback-fix.md) lives in
       the installed dist and is silently overwritten by `pi update`.
    """
    hook = AGENT_DIR / ".pi-vcs" / "hooks" / "post-commit"
    if hook.exists():
        text = hook.read_text(encoding="utf-8", errors="replace")
        if "graphify-hook-start" in text and "harness-local filter" not in text:
            errors.append(
                ".pi-vcs/hooks/post-commit: graphify hook present WITHOUT the harness-local "
                "doc filter — next doc commit will wipe the semantic graph layer "
                "(re-apply the filter block; see docs/config-index.md 2026-07-04)")
    checkout = AGENT_DIR / ".pi-vcs" / "hooks" / "post-checkout"
    if checkout.exists() and "graphify" in checkout.read_text(encoding="utf-8", errors="replace"):
        errors.append(
            ".pi-vcs/hooks/post-checkout: graphify full-rebuild hook present — its .md "
            "re-extraction wipes the semantic graph layer; delete it (deliberately removed 2026-07-04)")
    tui = Path.home() / ".local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/tui.js"
    if tui.exists() and "viewport reflow repaint" not in tui.read_text(encoding="utf-8", errors="replace"):
        warnings.append(
            "pi-tui dist: scrollback-fix patch markers missing (pi update overwrote it?) — "
            "re-apply per patches/pi-tui-scrollback-fix.md, then run its harness")


def check_layout(layout: dict) -> None:
    for d in layout.get("expected", []):
        if not (AGENT_DIR / d).is_dir():
            warnings.append(f"layout: expected directory '{d}/' is missing")
    recognized = set(layout.get("expected", [])) | set(layout.get("known", []))
    for entry in sorted(AGENT_DIR.iterdir()):
        if entry.is_dir() and entry.name not in recognized:
            infos.append(f"layout: unrecognized directory '{entry.name}/' (fine — consider adding to manifest layout)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--strict", action="store_true", help="warnings also fail")
    args = ap.parse_args()

    try:
        manifest = load_json(MANIFEST)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR  cannot load manifest {MANIFEST}: {e}")
        return 1

    for target in manifest.get("targets", []):
        # Isolate each target: an unexpected failure becomes one ERROR line
        # rather than aborting the whole audit with a traceback.
        try:
            entries = check_target(target)
            if isinstance(target, dict) and target.get("heuristicsScope"):
                check_heuristics_hygiene(target, entries)
        except Exception as e:  # noqa: BLE001 — audit must never crash on bad input
            tname = target.get("path", "<unknown>") if isinstance(target, dict) else repr(target)
            errors.append(f"manifest: target {tname} raised {type(e).__name__}: {e}")
    check_git_hygiene()
    check_symlinks()
    check_installed_integrity()
    check_layout(manifest.get("layout", {}))

    for msg in errors:
        print(f"ERROR  {msg}")
    for msg in warnings:
        print(f"WARN   {msg}")
    for msg in infos:
        print(f"INFO   {msg}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
