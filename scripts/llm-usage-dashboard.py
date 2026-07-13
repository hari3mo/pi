#!/usr/bin/env python3
"""Build an interactive LLM usage dashboard for Pi, Hermes, and Claude Code.

The collector intentionally reads only usage metadata (tokens, costs, timestamps,
models, session ids, cwd/project, tool counts). It never exports transcript text.
Remote collection works by sending this same script over SSH and asking the
remote host to return aggregate JSON.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import re
import shlex
import socket
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

VERSION = 1
DEFAULT_REMOTE = "ec2-user@10.30.128.24"
DEFAULT_OUT = Path.home() / ".pi" / "agent" / "dashboard" / "llm-usage" / "index.html"
JSON_CAP_ERROR = "json-unreadable"


@dataclass
class Counter:
    files: int = 0
    sessions: int = 0
    records: int = 0
    lines: int = 0
    parse_errors: int = 0
    skipped: int = 0


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite_number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value)
            return parsed if math.isfinite(parsed) else default
        except ValueError:
            return default
    return default


def intish(value: Any) -> int:
    return int(finite_number(value, 0.0))


def ts_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        seconds = float(value)
        # Pi/Claude message timestamps are usually milliseconds. Hermes DB uses seconds.
        if seconds > 10_000_000_000:
            seconds /= 1000.0
        try:
            return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        normalized = raw.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            return raw
    return None


def project_from_cwd(cwd: str | None) -> str:
    if not cwd:
        return ""
    stripped = cwd.rstrip("/")
    if not stripped:
        return "/"
    return Path(stripped).name or stripped


def relpath(path: Path, home: Path) -> str:
    try:
        return "~/" + str(path.resolve().relative_to(home.resolve()))
    except Exception:
        return str(path)


def safe_json_loads(line: str) -> dict[str, Any] | None:
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def walk_jsonl(root: Path) -> list[Path]:
    if not root.exists():
        return []
    try:
        return sorted((p for p in root.rglob("*.jsonl") if p.is_file()), key=lambda p: str(p))
    except OSError:
        return []


def split_provider_model(provider: Any, model: Any, default_provider: str = "?") -> tuple[str, str]:
    provider_s = str(provider).strip() if isinstance(provider, str) and provider.strip() else ""
    model_s = str(model).strip() if isinstance(model, str) and model.strip() else ""
    raw = model_s or provider_s or "unknown"
    slash = raw.find("/")
    colon = raw.rfind(":")
    without_effort = raw[:colon] if colon > slash else raw
    if slash >= 0:
        left, right = without_effort.split("/", 1)
        if not provider_s:
            return left or default_provider, right or "unknown"
        if left == provider_s:
            return provider_s, right or "unknown"
    return provider_s or default_provider, without_effort or "unknown"


def usage_from_pi_shape(usage: Any) -> dict[str, float]:
    if not isinstance(usage, dict):
        return {"input": 0, "output": 0, "reasoning": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0, "cost": math.nan}
    input_tokens = finite_number(usage.get("input", usage.get("input_tokens")))
    output_tokens = finite_number(usage.get("output", usage.get("output_tokens")))
    reasoning = finite_number(usage.get("reasoning", usage.get("reasoning_tokens")))
    cache_read = finite_number(usage.get("cacheRead", usage.get("cache_read_input_tokens")))
    cache_write = finite_number(usage.get("cacheWrite", usage.get("cache_creation_input_tokens")))
    total = finite_number(usage.get("totalTokens", usage.get("total_tokens")))
    if total <= 0:
        total = input_tokens + output_tokens + reasoning + cache_read + cache_write
    cost_raw = usage.get("cost")
    if isinstance(cost_raw, dict):
        cost = finite_number(cost_raw.get("total"), math.nan)
    else:
        cost = finite_number(cost_raw, math.nan)
    return {
        "input": input_tokens,
        "output": output_tokens,
        "reasoning": reasoning,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "totalTokens": total,
        "cost": cost,
    }


def usage_from_claude_shape(usage: Any) -> dict[str, float]:
    if not isinstance(usage, dict):
        return {"input": 0, "output": 0, "reasoning": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0, "cost": math.nan}
    input_tokens = finite_number(usage.get("input_tokens"))
    output_tokens = finite_number(usage.get("output_tokens"))
    cache_read = finite_number(usage.get("cache_read_input_tokens"))
    cache_write = finite_number(usage.get("cache_creation_input_tokens"))
    # Claude Code does not expose cost in the JSONL files; keep cost null in records.
    total = input_tokens + output_tokens + cache_read + cache_write
    return {
        "input": input_tokens,
        "output": output_tokens,
        "reasoning": 0,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "totalTokens": total,
        "cost": math.nan,
    }


def cost_or_none(cost: float) -> float | None:
    if isinstance(cost, (int, float)) and math.isfinite(cost):
        return round(float(cost), 8)
    return None


def count_tool_calls_from_content(content: Any) -> int:
    if not isinstance(content, list):
        return 0
    count = 0
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type in {"toolCall", "tool_use", "server_tool_use"}:
            count += 1
    return count


def add_record(
    records: list[dict[str, Any]],
    *,
    host: str,
    hostname: str,
    app: str,
    profile: str = "",
    provider: str,
    model: str,
    session_id: str,
    timestamp: str | None,
    cwd: str = "",
    project: str = "",
    source: str = "",
    calls: int = 1,
    messages: int = 0,
    tool_calls: int = 0,
    input_tokens: float = 0,
    output_tokens: float = 0,
    reasoning_tokens: float = 0,
    cache_read_tokens: float = 0,
    cache_write_tokens: float = 0,
    total_tokens: float = 0,
    cost: float | None = None,
    cost_status: str = "recorded",
    extra: dict[str, Any] | None = None,
) -> None:
    total = total_tokens or input_tokens + output_tokens + reasoning_tokens + cache_read_tokens + cache_write_tokens
    if total <= 0 and (cost is None or cost == 0) and calls <= 0 and messages <= 0 and tool_calls <= 0:
        return
    if cost is None and total > 0 and cost_status == "recorded":
        cost_status = "unpriced"
    records.append(
        {
            "host": host,
            "hostname": hostname,
            "app": app,
            "profile": profile,
            "provider": provider or "?",
            "model": model or "unknown",
            "sessionId": session_id or "unknown",
            "timestamp": timestamp,
            "cwd": cwd or "",
            "project": project or project_from_cwd(cwd),
            "source": source,
            "calls": int(calls),
            "messages": int(messages),
            "toolCalls": int(tool_calls),
            "input": int(input_tokens),
            "output": int(output_tokens),
            "reasoning": int(reasoning_tokens),
            "cacheRead": int(cache_read_tokens),
            "cacheWrite": int(cache_write_tokens),
            "totalTokens": int(total),
            "cost": cost,
            "costStatus": cost_status,
            "extra": extra or {},
        }
    )


def collect_pi(home: Path, host: str, hostname: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    root = home / ".pi" / "agent" / "sessions"
    files = walk_jsonl(root)
    records: list[dict[str, Any]] = []
    counter = Counter(files=len(files))
    for path in files:
        session_id = path.stem
        cwd = ""
        session_started: str | None = None
        session_seen = False
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            counter.parse_errors += 1
            continue
        for line in lines:
            if not line.strip():
                continue
            counter.lines += 1
            entry = safe_json_loads(line)
            if entry is None:
                counter.parse_errors += 1
                continue
            entry_type = entry.get("type")
            if entry_type == "session":
                session_seen = True
                counter.sessions += 1
                session_id = str(entry.get("id") or session_id)
                cwd = str(entry.get("cwd") or cwd)
                session_started = ts_to_iso(entry.get("timestamp")) or session_started
                continue
            if entry_type != "message":
                continue
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            timestamp = ts_to_iso(message.get("timestamp")) or ts_to_iso(entry.get("timestamp")) or session_started
            if role == "assistant":
                usage = usage_from_pi_shape(message.get("usage"))
                cost = cost_or_none(usage["cost"])
                provider, model = split_provider_model(message.get("provider"), message.get("model"))
                add_record(
                    records,
                    host=host,
                    hostname=hostname,
                    app="pi",
                    provider=provider,
                    model=model,
                    session_id=session_id,
                    timestamp=timestamp,
                    cwd=cwd,
                    source=relpath(path, home),
                    calls=1,
                    messages=1,
                    tool_calls=count_tool_calls_from_content(message.get("content")),
                    input_tokens=usage["input"],
                    output_tokens=usage["output"],
                    reasoning_tokens=usage["reasoning"],
                    cache_read_tokens=usage["cacheRead"],
                    cache_write_tokens=usage["cacheWrite"],
                    total_tokens=usage["totalTokens"],
                    cost=cost,
                    cost_status="recorded" if cost is not None else "unpriced_pi_log",
                )
            elif role == "toolResult" and message.get("toolName") == "subagent":
                details = message.get("details")
                results = details.get("results") if isinstance(details, dict) else None
                if not isinstance(results, list):
                    continue
                for result in results:
                    if not isinstance(result, dict):
                        continue
                    usage = usage_from_pi_shape(result.get("usage"))
                    cost = cost_or_none(usage["cost"])
                    provider, model = split_provider_model(None, result.get("model"))
                    add_record(
                        records,
                        host=host,
                        hostname=hostname,
                        app="pi",
                        profile="subagent",
                        provider=provider,
                        model=model,
                        session_id=session_id,
                        timestamp=ts_to_iso(result.get("endTime")) or ts_to_iso(result.get("startTime")) or timestamp,
                        cwd=cwd,
                        source=relpath(path, home),
                        calls=1,
                        messages=1,
                        tool_calls=0,
                        input_tokens=usage["input"],
                        output_tokens=usage["output"],
                        reasoning_tokens=usage["reasoning"],
                        cache_read_tokens=usage["cacheRead"],
                        cache_write_tokens=usage["cacheWrite"],
                        total_tokens=usage["totalTokens"],
                        cost=cost,
                        cost_status="recorded" if cost is not None else "unpriced_pi_subagent_log",
                        extra={"kind": "subagent"},
                    )
        if not session_seen and lines:
            counter.sessions += 1
    counter.records = len(records)
    source = {
        "host": host,
        "app": "pi",
        "profile": "",
        "path": relpath(root, home),
        "status": "ok" if root.exists() else "missing",
        "files": counter.files,
        "sessions": counter.sessions,
        "records": counter.records,
        "lines": counter.lines,
        "parseErrors": counter.parse_errors,
    }
    return records, source


def hermes_db_candidates(home: Path) -> list[tuple[str, Path]]:
    candidates = [("default", home / ".hermes" / "state.db")]
    profiles = home / ".hermes" / "profiles"
    if profiles.exists():
        try:
            for child in sorted(profiles.iterdir(), key=lambda p: p.name):
                db = child / "state.db"
                if db.exists():
                    candidates.append((child.name, db))
        except OSError:
            pass
    # Deduplicate paths while preserving profile names.
    seen: set[Path] = set()
    out: list[tuple[str, Path]] = []
    for profile, db in candidates:
        try:
            resolved = db.resolve()
        except OSError:
            resolved = db
        if resolved in seen:
            continue
        seen.add(resolved)
        out.append((profile, db))
    return out


def collect_hermes(home: Path, host: str, hostname: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    for profile, db in hermes_db_candidates(home):
        before = len(records)
        source = {
            "host": host,
            "app": "hermes",
            "profile": profile,
            "path": relpath(db, home),
            "status": "missing" if not db.exists() else "ok",
            "files": 1 if db.exists() else 0,
            "sessions": 0,
            "records": 0,
            "lines": 0,
            "parseErrors": 0,
        }
        if not db.exists():
            sources.append(source)
            continue
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=3)
            con.row_factory = sqlite3.Row
            rows = con.execute(
                """
                select
                    id, source, model, model_config, started_at, ended_at,
                    message_count, tool_call_count, input_tokens, output_tokens,
                    cache_read_tokens, cache_write_tokens, reasoning_tokens,
                    cwd, git_branch, git_repo_root, billing_provider,
                    estimated_cost_usd, actual_cost_usd, cost_status,
                    title, api_call_count
                from sessions
                order by started_at
                """
            ).fetchall()
        except Exception as exc:  # noqa: BLE001 - collector should fail open.
            source["status"] = "error"
            source["error"] = f"{type(exc).__name__}: {exc}"
            source["parseErrors"] = 1
            sources.append(source)
            continue
        source["sessions"] = len(rows)
        for row in rows:
            provider, model = split_provider_model(row["billing_provider"] or None, row["model"] or "unknown")
            cost_value = row["actual_cost_usd"] if row["actual_cost_usd"] is not None else row["estimated_cost_usd"]
            cost = cost_or_none(finite_number(cost_value, math.nan))
            input_tokens = intish(row["input_tokens"])
            output_tokens = intish(row["output_tokens"])
            cache_read = intish(row["cache_read_tokens"])
            cache_write = intish(row["cache_write_tokens"])
            reasoning = intish(row["reasoning_tokens"])
            total = input_tokens + output_tokens + cache_read + cache_write + reasoning
            cost_status = row["cost_status"] or ("recorded" if cost is not None else "unpriced_hermes_session")
            add_record(
                records,
                host=host,
                hostname=hostname,
                app="hermes",
                profile=profile,
                provider=provider,
                model=model,
                session_id=row["id"],
                timestamp=ts_to_iso(row["ended_at"] or row["started_at"]),
                cwd=row["cwd"] or "",
                project=project_from_cwd(row["cwd"] or row["git_repo_root"] or ""),
                source=relpath(db, home),
                calls=intish(row["api_call_count"]),
                messages=intish(row["message_count"]),
                tool_calls=intish(row["tool_call_count"]),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                reasoning_tokens=reasoning,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
                total_tokens=total,
                cost=cost,
                cost_status=cost_status if cost is not None else "unpriced_hermes_session",
                extra={
                    "source": row["source"],
                    "title": row["title"],
                    "gitBranch": row["git_branch"],
                    "gitRepoRoot": row["git_repo_root"],
                },
            )
        source["records"] = len(records) - before
        sources.append(source)
    return records, sources


def collect_claude(home: Path, host: str, hostname: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    root = home / ".claude" / "projects"
    files = walk_jsonl(root)
    records: list[dict[str, Any]] = []
    counter = Counter(files=len(files))
    for path in files:
        session_id = path.stem
        cwd = ""
        session_seen = False
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            counter.parse_errors += 1
            continue
        for line in lines:
            if not line.strip():
                continue
            counter.lines += 1
            entry = safe_json_loads(line)
            if entry is None:
                counter.parse_errors += 1
                continue
            if entry.get("sessionId"):
                session_id = str(entry.get("sessionId"))
                if not session_seen:
                    counter.sessions += 1
                    session_seen = True
            if isinstance(entry.get("cwd"), str) and entry.get("cwd"):
                cwd = str(entry.get("cwd"))
            if entry.get("type") != "assistant":
                continue
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            usage = usage_from_claude_shape(message.get("usage"))
            if usage["totalTokens"] <= 0:
                counter.skipped += 1
                continue
            provider, model = split_provider_model(None, message.get("model"), "anthropic")
            add_record(
                records,
                host=host,
                hostname=hostname,
                app="claude",
                provider=provider,
                model=model,
                session_id=session_id,
                timestamp=ts_to_iso(entry.get("timestamp")),
                cwd=cwd,
                source=relpath(path, home),
                calls=1,
                messages=1,
                tool_calls=count_tool_calls_from_content(message.get("content")),
                input_tokens=usage["input"],
                output_tokens=usage["output"],
                reasoning_tokens=usage["reasoning"],
                cache_read_tokens=usage["cacheRead"],
                cache_write_tokens=usage["cacheWrite"],
                total_tokens=usage["totalTokens"],
                cost=None,
                cost_status="unpriced_claude_code_log",
                extra={
                    "version": entry.get("version"),
                    "requestId": entry.get("requestId"),
                    "agentId": entry.get("agentId"),
                    "attributionAgent": entry.get("attributionAgent"),
                    "attributionSkill": entry.get("attributionSkill"),
                },
            )
        if not session_seen and lines:
            counter.sessions += 1
    counter.records = len(records)
    source = {
        "host": host,
        "app": "claude",
        "profile": "",
        "path": relpath(root, home),
        "status": "ok" if root.exists() else "missing",
        "files": counter.files,
        "sessions": counter.sessions,
        "records": counter.records,
        "lines": counter.lines,
        "parseErrors": counter.parse_errors,
        "skippedZeroUsage": counter.skipped,
    }
    return records, source


def collect_local(host_label: str | None = None, home: Path | None = None) -> dict[str, Any]:
    home = (home or Path.home()).expanduser()
    hostname = socket.gethostname()
    host = host_label or hostname or "local"
    payload = {
        "version": VERSION,
        "generatedAt": utc_now_iso(),
        "host": {
            "label": host,
            "hostname": hostname,
            "home": str(home),
            "platform": platform.platform(),
        },
        "records": [],
        "sources": [],
    }
    for collector in (collect_pi, collect_claude):
        try:
            records, source = collector(home, host, hostname)
            payload["records"].extend(records)
            payload["sources"].append(source)
        except Exception as exc:  # noqa: BLE001 - a broken source should not kill the whole dashboard.
            app = collector.__name__.replace("collect_", "")
            payload["sources"].append(
                {
                    "host": host,
                    "app": app,
                    "profile": "",
                    "path": "",
                    "status": "error",
                    "files": 0,
                    "sessions": 0,
                    "records": 0,
                    "lines": 0,
                    "parseErrors": 1,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
    try:
        records, sources = collect_hermes(home, host, hostname)
        payload["records"].extend(records)
        payload["sources"].extend(sources)
    except Exception as exc:  # noqa: BLE001
        payload["sources"].append(
            {
                "host": host,
                "app": "hermes",
                "profile": "",
                "path": str(home / ".hermes"),
                "status": "error",
                "files": 0,
                "sessions": 0,
                "records": 0,
                "lines": 0,
                "parseErrors": 1,
                "error": f"{type(exc).__name__}: {exc}",
            }
        )
    return payload


def merge_payloads(payloads: Iterable[dict[str, Any]]) -> dict[str, Any]:
    merged = {
        "version": VERSION,
        "generatedAt": utc_now_iso(),
        "hosts": [],
        "records": [],
        "sources": [],
    }
    for payload in payloads:
        host = payload.get("host")
        if isinstance(host, dict):
            merged["hosts"].append(host)
        merged["records"].extend(payload.get("records") or [])
        merged["sources"].extend(payload.get("sources") or [])
    merged["records"].sort(key=lambda r: (r.get("timestamp") or "", r.get("host") or "", r.get("app") or ""))
    return merged


def collect_remote(remote: str, label: str, timeout: int) -> dict[str, Any]:
    source = Path(__file__).read_text(encoding="utf-8")
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        remote,
        "python3",
        "-",
        "--collect-local-json",
        "--host-label",
        label,
    ]
    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            input=source,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "version": VERSION,
            "generatedAt": utc_now_iso(),
            "host": {"label": label, "hostname": remote, "home": "", "platform": "ssh-unavailable"},
            "records": [],
            "sources": [
                {
                    "host": label,
                    "app": "remote",
                    "profile": "",
                    "path": remote,
                    "status": "error",
                    "files": 0,
                    "sessions": 0,
                    "records": 0,
                    "lines": 0,
                    "parseErrors": 1,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            ],
        }
    stdout = proc.stdout.strip()
    if proc.returncode != 0:
        err = (proc.stderr or stdout or "ssh failed").strip().splitlines()[-1:]
        return {
            "version": VERSION,
            "generatedAt": utc_now_iso(),
            "host": {"label": label, "hostname": remote, "home": "", "platform": "ssh-error"},
            "records": [],
            "sources": [
                {
                    "host": label,
                    "app": "remote",
                    "profile": "",
                    "path": remote,
                    "status": "error",
                    "files": 0,
                    "sessions": 0,
                    "records": 0,
                    "lines": 0,
                    "parseErrors": 1,
                    "durationMs": int((time.time() - started) * 1000),
                    "error": err[0] if err else "ssh failed",
                }
            ],
        }
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {
            "version": VERSION,
            "generatedAt": utc_now_iso(),
            "host": {"label": label, "hostname": remote, "home": "", "platform": JSON_CAP_ERROR},
            "records": [],
            "sources": [
                {
                    "host": label,
                    "app": "remote",
                    "profile": "",
                    "path": remote,
                    "status": "error",
                    "files": 0,
                    "sessions": 0,
                    "records": 0,
                    "lines": 0,
                    "parseErrors": 1,
                    "durationMs": int((time.time() - started) * 1000),
                    "error": f"remote JSON parse failed: {exc}",
                }
            ],
        }
    for source_entry in payload.get("sources", []):
        if isinstance(source_entry, dict):
            source_entry.setdefault("durationMs", int((time.time() - started) * 1000))
    return payload


def json_for_script(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def render_html(data: dict[str, Any]) -> str:
    payload = json_for_script(data)
    generated = data.get("generatedAt") or utc_now_iso()
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LLM Usage Atlas</title>
<style>
:root {{
  --bg: #0b0d10;
  --panel: #12161d;
  --panel-2: #171d26;
  --text: #eef3f8;
  --muted: #8d99a8;
  --dim: #596371;
  --line: #263140;
  --accent: #84d2ff;
  --accent-2: #d4b3ff;
  --good: #7ee787;
  --warn: #ffd166;
  --bad: #ff7b72;
  --chip: #202938;
  color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: radial-gradient(circle at top left, rgba(132,210,255,.16), transparent 32rem), var(--bg);
  color: var(--text);
  font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}}
main {{ max-width: 1480px; margin: 0 auto; padding: 28px; }}
.header {{
  display: flex; gap: 18px; justify-content: space-between; align-items: flex-start;
  border: 1px solid var(--line); border-radius: 22px; padding: 22px;
  background: linear-gradient(135deg, rgba(18,22,29,.96), rgba(23,29,38,.90));
  box-shadow: 0 24px 80px rgba(0,0,0,.35);
}}
h1 {{ margin: 0; font-size: clamp(26px, 4vw, 44px); letter-spacing: -.04em; }}
.subtitle {{ color: var(--muted); margin-top: 8px; max-width: 900px; }}
.generated {{ color: var(--dim); white-space: nowrap; margin-top: 10px; }}
.controls {{ margin: 18px 0; display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }}
.control-row {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }}
button, select, input {{
  background: var(--chip); color: var(--text); border: 1px solid var(--line);
  border-radius: 999px; padding: 8px 12px; font: inherit; outline: none;
}}
button {{ cursor: pointer; }}
button.active {{ border-color: rgba(132,210,255,.8); background: rgba(132,210,255,.14); color: white; }}
input {{ min-width: 260px; border-radius: 12px; }}
.tabs {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 18px; }}
.tab {{ border-radius: 12px; }}
.grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
.card, .panel {{ background: rgba(18,22,29,.92); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }}
.card .label {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
.card .value {{ font-size: 26px; font-weight: 750; margin-top: 6px; letter-spacing: -.03em; }}
.card .note {{ color: var(--dim); font-size: 12px; margin-top: 6px; }}
.two-col {{ display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 14px; margin-top: 14px; }}
.panel h2 {{ margin: 0 0 12px; font-size: 16px; }}
.panel h3 {{ margin: 14px 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }}
.bars {{ display: grid; gap: 8px; }}
.bar-row {{ display: grid; grid-template-columns: 104px 1fr 138px; gap: 10px; align-items: center; color: var(--muted); }}
.bar-track {{ height: 12px; background: #0f1319; border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,.04); }}
.bar-fill {{ height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-2)); min-width: 2px; }}
.table-wrap {{ overflow: auto; border: 1px solid var(--line); border-radius: 14px; }}
table {{ width: 100%; border-collapse: collapse; min-width: 860px; }}
th, td {{ padding: 9px 10px; border-bottom: 1px solid rgba(38,49,64,.76); text-align: left; vertical-align: top; }}
th {{ position: sticky; top: 0; background: #151b24; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; cursor: pointer; z-index: 1; }}
tr:hover td {{ background: rgba(132,210,255,.05); }}
td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.chip {{ display: inline-flex; align-items: center; gap: 6px; background: var(--chip); border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--muted); font-size: 12px; }}
.status-ok {{ color: var(--good); }} .status-error {{ color: var(--bad); }} .status-missing {{ color: var(--warn); }}
.muted {{ color: var(--muted); }} .dim {{ color: var(--dim); }}
.footer {{ color: var(--dim); margin: 18px 2px; }}
.hidden {{ display: none; }}
@media (max-width: 1100px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} .two-col {{ grid-template-columns: 1fr; }} .controls {{ grid-template-columns: 1fr; }} }}
@media (max-width: 680px) {{ main {{ padding: 14px; }} .grid {{ grid-template-columns: 1fr; }} .header {{ display: block; }} input {{ min-width: 100%; }} .bar-row {{ grid-template-columns: 82px 1fr; }} .bar-row .num {{ grid-column: 2; }} }}
</style>
</head>
<body>
<main>
  <section class="header">
    <div>
      <h1>LLM Usage Atlas</h1>
      <div class="subtitle">Pi Atlas-style dashboard spanning Pi, Hermes, and Claude Code on the local Mac and EC2. Transcript text is not exported; this page embeds aggregate usage metadata only.</div>
    </div>
    <div class="generated">generated <span id="generatedAt">{generated}</span></div>
  </section>

  <section class="controls">
    <div class="control-row" id="rangeButtons"></div>
    <div class="control-row">
      <select id="hostFilter"></select>
      <select id="appFilter"></select>
      <input id="search" placeholder="filter model, provider, project, session…" />
    </div>
  </section>
  <nav class="tabs" id="tabs"></nav>
  <section id="content"></section>
  <div class="footer">Controls: range buttons mirror Pi Atlas; table headers sort; filters apply globally. Known cost is only what the underlying logs recorded. Claude Code subscription logs expose tokens but no dollar cost, so those tokens are tracked as unpriced.</div>
</main>
<script id="usage-data" type="application/json">{payload}</script>
<script>
const DATA = JSON.parse(document.getElementById('usage-data').textContent);
const state = {{ range: 'all', tab: 'overview', host: 'all', app: 'all', search: '', sortKey: 'cost', sortDir: -1 }};
const ranges = [ ['today','Today'], ['7d','7 days'], ['30d','30 days'], ['all','All'] ];
const tabs = [ ['overview','Overview'], ['models','Models'], ['apps','Apps'], ['hosts','Hosts'], ['sessions','Sessions'], ['sources','Sources'], ['records','Raw records'] ];
const nf = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, {{ notation: 'compact', maximumFractionDigits: 1 }});
const money = new Intl.NumberFormat(undefined, {{ style: 'currency', currency: 'USD', maximumFractionDigits: 4 }});
function esc(s) {{ return String(s ?? '').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c])); }}
function fmtTokens(n) {{ n = Number(n)||0; return n >= 100000 ? compact.format(n) : nf.format(n); }}
function fmtInt(n) {{ return nf.format(Number(n)||0); }}
function fmtCost(n) {{ return n == null || !Number.isFinite(Number(n)) ? '—' : money.format(Number(n)); }}
function dayOf(ts) {{ if (!ts) return ''; const d = new Date(ts); return Number.isNaN(+d) ? '' : d.toISOString().slice(0,10); }}
function recTime(r) {{ const t = Date.parse(r.timestamp || ''); return Number.isNaN(t) ? 0 : t; }}
function inRange(r) {{
  if (state.range === 'all') return true;
  const t = recTime(r); if (!t) return false;
  const now = new Date();
  if (state.range === 'today') return new Date(t).toDateString() === now.toDateString();
  const days = state.range === '7d' ? 7 : 30;
  return t >= Date.now() - days * 86400000;
}}
function matches(r) {{
  if (state.host !== 'all' && r.host !== state.host) return false;
  if (state.app !== 'all' && r.app !== state.app) return false;
  if (!state.search) return true;
  const hay = [r.host,r.app,r.profile,r.provider,r.model,r.sessionId,r.cwd,r.project,r.source,r.costStatus].join(' ').toLowerCase();
  return hay.includes(state.search.toLowerCase());
}}
function rows() {{ return DATA.records.filter(r => inRange(r) && matches(r)); }}
function uniq(arr) {{ return [...new Set(arr.filter(Boolean))].sort(); }}
function sum(rows, key) {{ return rows.reduce((a,r) => a + (Number(r[key])||0), 0); }}
function baseAgg(label='') {{ return {{ label, sessions:new Set(), calls:0, messages:0, toolCalls:0, input:0, output:0, reasoning:0, cacheRead:0, cacheWrite:0, totalTokens:0, cost:0, knownCostRecords:0, unpricedTokens:0, first:0, last:0 }}; }}
function absorb(a, r) {{
  a.sessions.add(`${{r.host}}|${{r.app}}|${{r.profile}}|${{r.sessionId}}`);
  for (const k of ['calls','messages','toolCalls','input','output','reasoning','cacheRead','cacheWrite','totalTokens']) a[k] += Number(r[k]) || 0;
  if (r.cost == null) a.unpricedTokens += Number(r.totalTokens)||0; else {{ a.cost += Number(r.cost)||0; a.knownCostRecords += 1; }}
  const t = recTime(r); if (t) {{ a.first = a.first ? Math.min(a.first,t) : t; a.last = Math.max(a.last,t); }}
  return a;
}}
function aggregate(rows, keyFn, decorate=()=>{{}}) {{
  const map = new Map();
  for (const r of rows) {{
    const key = keyFn(r); if (!map.has(key)) map.set(key, baseAgg(key));
    const a = map.get(key); decorate(a,r); absorb(a,r);
  }}
  return [...map.values()].map(a => ({{...a, sessions:a.sessions.size}}));
}}
function totals(rows) {{ const a = baseAgg('total'); for (const r of rows) absorb(a,r); a.sessions = a.sessions.size; a.activeDays = new Set(rows.map(r => dayOf(r.timestamp)).filter(Boolean)).size; return a; }}
function sortRows(items) {{
  const k = state.sortKey, dir = state.sortDir;
  return [...items].sort((a,b) => {{
    const av = a[k], bv = b[k];
    if (typeof av === 'number' || typeof bv === 'number') return dir * ((Number(av)||0) - (Number(bv)||0));
    return dir * String(av ?? '').localeCompare(String(bv ?? ''));
  }});
}}
function setSort(k) {{ if (state.sortKey === k) state.sortDir *= -1; else {{ state.sortKey = k; state.sortDir = -1; }} render(); }}
function table(headers, items) {{
  const head = headers.map(h => `<th class="${{h.num?'num':''}}" data-sort="${{h.key}}">${{esc(h.label)}}${{state.sortKey===h.key ? (state.sortDir<0?' ↓':' ↑') : ''}}</th>`).join('');
  const body = sortRows(items).map(r => `<tr>${{headers.map(h => `<td class="${{h.num?'num':''}}">${{h.render ? h.render(r) : esc(r[h.key])}}</td>`).join('')}}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${{head}}</tr></thead><tbody>${{body || `<tr><td colspan="${{headers.length}}" class="muted">No rows for this filter.</td></tr>`}}</tbody></table></div>`;
}}
function cards(t) {{
  return `<div class="grid">
    <div class="card"><div class="label">Known cost</div><div class="value">${{fmtCost(t.cost)}}</div><div class="note">from Pi/Hermes logs</div></div>
    <div class="card"><div class="label">Tokens</div><div class="value">${{fmtTokens(t.totalTokens)}}</div><div class="note">in/out/cache/reasoning</div></div>
    <div class="card"><div class="label">Sessions</div><div class="value">${{fmtInt(t.sessions)}}</div><div class="note">${{fmtInt(t.calls)}} model calls · ${{fmtInt(t.toolCalls)}} tool calls</div></div>
    <div class="card"><div class="label">Unpriced tokens</div><div class="value">${{fmtTokens(t.unpricedTokens)}}</div><div class="note">mostly Claude Code subscription logs</div></div>
  </div>`;
}}
function barList(items, valueKey, labelKey='label', valueFmt=fmtTokens) {{
  const top = [...items].sort((a,b)=>(b[valueKey]||0)-(a[valueKey]||0)).slice(0,14);
  const max = Math.max(1, ...top.map(x => Number(x[valueKey])||0));
  return `<div class="bars">${{top.map(x => `<div class="bar-row"><div title="${{esc(x[labelKey])}}">${{esc(String(x[labelKey]).slice(0,24))}}</div><div class="bar-track"><div class="bar-fill" style="width:${{Math.max(2, ((Number(x[valueKey])||0)/max)*100)}}%"></div></div><div class="num">${{valueFmt(x[valueKey])}}</div></div>`).join('') || '<div class="muted">No data.</div>'}}</div>`;
}}
function modelAgg(rs) {{ return aggregate(rs, r => `${{r.provider}}/${{r.model}}`, (a,r)=>{{ a.provider=r.provider; a.model=r.model; }}); }}
function appAgg(rs) {{ return aggregate(rs, r => r.app, (a,r)=>{{ a.app=r.app; }}); }}
function hostAgg(rs) {{ return aggregate(rs, r => r.host, (a,r)=>{{ a.host=r.host; a.hostname=r.hostname; }}); }}
function sessionAgg(rs) {{ return aggregate(rs, r => `${{r.host}}|${{r.app}}|${{r.profile}}|${{r.sessionId}}`, (a,r)=>{{ a.host=r.host; a.app=r.app; a.profile=r.profile; a.sessionId=r.sessionId; a.project=r.project; a.cwd=r.cwd; }}); }}
function dateAgg(rs) {{
  const map = new Map();
  for (const r of rs) {{ const d = dayOf(r.timestamp); if (!d) continue; if (!map.has(d)) map.set(d, baseAgg(d)); absorb(map.get(d), r); }}
  return [...map.values()].map(a=>({{...a, sessions:a.sessions.size}})).sort((a,b)=>a.label.localeCompare(b.label));
}}
function matrixAgg(rs) {{ return aggregate(rs, r => `${{r.host}} · ${{r.app}}`, (a,r)=>{{ a.host=r.host; a.app=r.app; }}); }}
const commonHeaders = [
  {{label:'Name', key:'label'}}, {{label:'Sessions', key:'sessions', num:true, render:r=>fmtInt(r.sessions)}}, {{label:'Calls', key:'calls', num:true, render:r=>fmtInt(r.calls)}},
  {{label:'Tokens', key:'totalTokens', num:true, render:r=>fmtTokens(r.totalTokens)}}, {{label:'Input', key:'input', num:true, render:r=>fmtTokens(r.input)}}, {{label:'Output', key:'output', num:true, render:r=>fmtTokens(r.output)}},
  {{label:'Cache R/W', key:'cacheRead', num:true, render:r=>`${{fmtTokens(r.cacheRead)}} / ${{fmtTokens(r.cacheWrite)}}`}}, {{label:'Cost', key:'cost', num:true, render:r=>fmtCost(r.knownCostRecords ? r.cost : null)}},
  {{label:'Unpriced', key:'unpricedTokens', num:true, render:r=>fmtTokens(r.unpricedTokens)}}
];
function renderOverview(rs) {{
  const t = totals(rs), models = modelAgg(rs), days = dateAgg(rs), matrix = matrixAgg(rs);
  return `${{cards(t)}}<div class="two-col"><div class="panel"><h2>Daily activity</h2>${{barList(days, 'totalTokens', 'label', fmtTokens)}}</div><div class="panel"><h2>Top models</h2>${{barList(models, 'totalTokens', 'label', fmtTokens)}}</div></div><div class="panel" style="margin-top:14px"><h2>Host × app matrix</h2>${{table(commonHeaders, matrix)}}</div>`;
}}
function renderModels(rs) {{ return `<div class="panel"><h2>Models</h2>${{table(commonHeaders, modelAgg(rs))}}</div>`; }}
function renderApps(rs) {{ return `<div class="panel"><h2>Apps</h2>${{table(commonHeaders, appAgg(rs))}}</div>`; }}
function renderHosts(rs) {{ return `<div class="panel"><h2>Hosts</h2>${{table(commonHeaders, hostAgg(rs))}}</div>`; }}
function renderSessions(rs) {{
  const headers = [
    {{label:'Session', key:'sessionId', render:r=>`<span class="chip">${{esc(r.host)}} · ${{esc(r.app)}}${{r.profile?` · ${{esc(r.profile)}}`:''}}</span><br>${{esc(String(r.sessionId).slice(0,44))}}`}},
    {{label:'Project', key:'project', render:r=>`${{esc(r.project||'')}}<div class="dim">${{esc(r.cwd||'')}}</div>`}},
    ...commonHeaders.slice(1), {{label:'Last', key:'last', render:r=>r.last ? new Date(r.last).toLocaleString() : '—'}}
  ];
  return `<div class="panel"><h2>Sessions</h2>${{table(headers, sessionAgg(rs))}}</div>`;
}}
function renderSources() {{
  const items = DATA.sources.map(s => ({{...s, label:`${{s.host}} · ${{s.app}}${{s.profile?` · ${{s.profile}}`:''}}`, records:Number(s.records)||0, sessions:Number(s.sessions)||0, files:Number(s.files)||0, parseErrors:Number(s.parseErrors)||0 }}));
  const headers = [
    {{label:'Source', key:'label', render:s=>`<span class="status-${{esc(s.status)}}">●</span> ${{esc(s.label)}}<div class="dim">${{esc(s.path||'')}}</div>${{s.error?`<div class="status-error">${{esc(s.error)}}</div>`:''}}`}},
    {{label:'Status', key:'status'}}, {{label:'Files', key:'files', num:true, render:s=>fmtInt(s.files)}}, {{label:'Sessions', key:'sessions', num:true, render:s=>fmtInt(s.sessions)}}, {{label:'Records', key:'records', num:true, render:s=>fmtInt(s.records)}}, {{label:'Parse errors', key:'parseErrors', num:true, render:s=>fmtInt(s.parseErrors)}}
  ];
  return `<div class="panel"><h2>Sources</h2>${{table(headers, items)}}</div>`;
}}
function renderRecords(rs) {{
  const headers = [
    {{label:'When', key:'timestamp', render:r=>r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}},
    {{label:'Host/app', key:'host', render:r=>`<span class="chip">${{esc(r.host)}} · ${{esc(r.app)}}${{r.profile?` · ${{esc(r.profile)}}`:''}}</span>`}},
    {{label:'Model', key:'model', render:r=>`${{esc(r.provider)}}/${{esc(r.model)}}<div class="dim">${{esc(r.costStatus)}}</div>`}},
    {{label:'Project', key:'project'}}, {{label:'Tokens', key:'totalTokens', num:true, render:r=>fmtTokens(r.totalTokens)}}, {{label:'Cost', key:'cost', num:true, render:r=>fmtCost(r.cost)}}, {{label:'Session', key:'sessionId', render:r=>esc(String(r.sessionId).slice(0,32))}}
  ];
  return `<div class="panel"><h2>Raw usage records</h2>${{table(headers, rs)}}</div>`;
}}
function fillControls() {{
  document.getElementById('rangeButtons').innerHTML = ranges.map(([k,label]) => `<button data-range="${{k}}" class="${{state.range===k?'active':''}}">${{label}}</button>`).join('');
  document.getElementById('tabs').innerHTML = tabs.map(([k,label]) => `<button class="tab ${{state.tab===k?'active':''}}" data-tab="${{k}}">${{label}}</button>`).join('');
  const hosts = ['all', ...uniq(DATA.records.map(r=>r.host))];
  const apps = ['all', ...uniq(DATA.records.map(r=>r.app))];
  document.getElementById('hostFilter').innerHTML = hosts.map(h=>`<option value="${{esc(h)}}" ${{state.host===h?'selected':''}}>host: ${{esc(h)}}</option>`).join('');
  document.getElementById('appFilter').innerHTML = apps.map(a=>`<option value="${{esc(a)}}" ${{state.app===a?'selected':''}}>app: ${{esc(a)}}</option>`).join('');
  document.getElementById('search').value = state.search;
}}
function render() {{
  fillControls();
  const rs = rows();
  const views = {{ overview:renderOverview, models:renderModels, apps:renderApps, hosts:renderHosts, sessions:renderSessions, sources:()=>renderSources(), records:renderRecords }};
  document.getElementById('content').innerHTML = (views[state.tab] || renderOverview)(rs);
}}
document.addEventListener('click', e => {{
  const range = e.target.closest('[data-range]'); if (range) {{ state.range = range.dataset.range; render(); return; }}
  const tab = e.target.closest('[data-tab]'); if (tab) {{ state.tab = tab.dataset.tab; render(); return; }}
  const th = e.target.closest('th[data-sort]'); if (th) {{ setSort(th.dataset.sort); return; }}
}});
document.getElementById('hostFilter').addEventListener('change', e => {{ state.host = e.target.value; render(); }});
document.getElementById('appFilter').addEventListener('change', e => {{ state.app = e.target.value; render(); }});
document.getElementById('search').addEventListener('input', e => {{ state.search = e.target.value; render(); }});
render();
</script>
</body>
</html>
"""


def write_dashboard(data: dict[str, Any], out: Path) -> tuple[Path, Path]:
    out = out.expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    data_path = out.with_name("data.json")
    out.write_text(render_html(data), encoding="utf-8")
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return out, data_path


def open_file(path: Path) -> None:
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(path)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", str(path)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def summarize_for_stdout(data: dict[str, Any], html_path: Path | None = None, data_path: Path | None = None) -> str:
    records = data.get("records") or []
    sources = data.get("sources") or []
    known_cost = sum(finite_number(r.get("cost")) for r in records if r.get("cost") is not None)
    total_tokens = sum(intish(r.get("totalTokens")) for r in records)
    unpriced = sum(intish(r.get("totalTokens")) for r in records if r.get("cost") is None)
    sessions = {f"{r.get('host')}|{r.get('app')}|{r.get('profile')}|{r.get('sessionId')}" for r in records}
    lines = []
    if html_path:
        lines.append(f"html={html_path}")
    if data_path:
        lines.append(f"data={data_path}")
    lines.extend(
        [
            f"records={len(records)}",
            f"sessions={len(sessions)}",
            f"sources={len(sources)}",
            f"tokens={total_tokens}",
            f"known_cost_usd={known_cost:.6f}",
            f"unpriced_tokens={unpriced}",
        ]
    )
    for source in sources:
        label = f"{source.get('host')}/{source.get('app')}{('/' + source.get('profile')) if source.get('profile') else ''}"
        lines.append(
            f"source={label} status={source.get('status')} records={source.get('records', 0)} sessions={source.get('sessions', 0)} files={source.get('files', 0)} errors={source.get('parseErrors', 0)}"
        )
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate an interactive local/EC2 LLM usage dashboard.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="HTML output path (default: ~/.pi/agent/dashboard/llm-usage/index.html)")
    parser.add_argument("--host-label", default=None, help="Label for the local host in the dashboard")
    parser.add_argument("--remote", default=DEFAULT_REMOTE, help=f"SSH target for EC2 collection (default: {DEFAULT_REMOTE})")
    parser.add_argument("--remote-label", default="ec2", help="Dashboard label for the SSH target")
    parser.add_argument("--remote-timeout", type=int, default=120, help="Seconds to wait for remote collection")
    parser.add_argument("--no-remote", action="store_true", help="Only collect this machine")
    parser.add_argument("--open", action="store_true", help="Open the generated dashboard in the system browser")
    parser.add_argument("--collect-local-json", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.collect_local_json:
        print(json.dumps(collect_local(args.host_label), ensure_ascii=False))
        return 0

    local = collect_local(args.host_label or "local")
    payloads = [local]
    if not args.no_remote and args.remote:
        payloads.append(collect_remote(args.remote, args.remote_label, args.remote_timeout))
    data = merge_payloads(payloads)
    html_path, data_path = write_dashboard(data, Path(args.out))
    if args.open:
        open_file(html_path)
    print(summarize_for_stdout(data, html_path, data_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
