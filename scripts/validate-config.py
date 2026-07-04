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
     sensitive paths (auth.json, trust.json, sessions/) are ignored.
  4. No dangling symlinks under skills/.
  5. Standard layout: expected directories exist; unknown entries are
     reported as info only (the layout is malleable by design).

Exit codes: 0 = clean (or warnings without --strict), 1 = errors.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
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
    path = resolve(target["path"])
    if not path.exists():
        (errors if target.get("required") else infos).append(
            f"{target['path']}: {'missing (required)' if target.get('required') else 'absent (optional)'}")
        return []
    validate = get_validator(resolve(target["schema"]))
    entries: list[dict] = []
    if target["format"] == "json":
        try:
            obj = load_json(path)
        except json.JSONDecodeError as e:
            errors.append(f"{target['path']}: invalid JSON — {e}")
            return []
        for msg in validate(obj):
            errors.append(f"{target['path']}: schema violation — {msg}")
    else:  # jsonl
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.strip().startswith("#"):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"{target['path']}:{n}: invalid JSON line — {e}")
                continue
            for msg in validate(obj):
                errors.append(f"{target['path']}:{n}: schema violation — {msg}")
            entries.append(obj)
        cap = target.get("maxEntries")
        if cap and len(entries) > cap:
            warnings.append(f"{target['path']}: {len(entries)} entries exceeds cap {cap}")
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
        entries = check_target(target)
        if target.get("heuristicsScope"):
            check_heuristics_hygiene(target, entries)
    check_git_hygiene()
    check_symlinks()
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
