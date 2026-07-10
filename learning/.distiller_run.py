#!/usr/bin/env python3
import json, os, time, random, string, sys

STORE = os.path.expanduser("~/.pi/agent/heuristics/heuristics.jsonl")
LOCK = STORE + ".lock"

def newid():
    ms = int(time.time() * 1000)
    b36 = ""
    n = ms
    digits = string.digits + string.ascii_lowercase
    while n:
        b36 = digits[n % 36] + b36
        n //= 36
    rand = "".join(random.choice(digits) for _ in range(4))
    return f"h_{b36}_{rand}"

now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

new_heuristics = [
    {
        "text": "Pin delegated subagent thinking effort by model family, never by inheriting the lead's effort: Opus and GPT-5.5 run :xhigh, while Sonnet and Gemini Flash run :high.",
        "scope": "global", "project": None, "category": "orchestration", "basis": "user-confirmed",
    },
    {
        "text": "When a pi update wipes the pi-tui scrollback fix (the jumping scrollbar returns and the self-audit WARNs about missing patch markers), re-apply it with one command — node ~/.pi/agent/patches/pi-tui-scrollback-fix-apply.mjs — then run the harness; no manual editing of dist/ is needed.",
        "scope": "global", "project": None, "category": "workflow", "basis": "reproduced",
    },
    {
        "text": "Harimo familiar renders as a status widget only when paired with the void landing page; the void/harimo wordmark (not the familiar sprite) stays as the prompt-page header.",
        "scope": "global", "project": None, "category": "correction", "basis": "user-confirmed",
    },
    {
        "text": "When rendering user-controlled strings (e.g. HERMES_USER / username env vars) into a TUI banner or splash, strip control/ANSI characters even on the supposedly ANSI-free non-TTY path — otherwise the name injects terminal escape sequences; add tests for escape- and newline-bearing names.",
        "scope": "global", "project": None, "category": "gotcha", "basis": "directly-observed",
    },
]

# lock protocol: wx-open, 10s stale-steal, backoff <=130x100ms
def acquire_lock():
    for attempt in range(130):
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                age = time.time() - os.path.getmtime(LOCK)
                if age > 10:
                    os.remove(LOCK)
                    continue
            except FileNotFoundError:
                continue
            time.sleep(0.1)
    return False

if not acquire_lock():
    print("ERROR: could not acquire lock", file=sys.stderr)
    sys.exit(1)

try:
    with open(STORE, "r") as f:
        lines = f.readlines()
    appended = []
    for h in new_heuristics:
        rec = {
            "id": newid(),
            "text": h["text"],
            "scope": h["scope"],
            "project": h["project"],
            "category": h["category"],
            "created": now,
            "lastReinforced": now,
            "hits": 0,
            "source": "agent",
            "pinned": False,
            "basis": h["basis"],
        }
        appended.append(rec)
        time.sleep(0.002)  # ensure distinct ms in ids
    # rewrite whole file (preserve existing lines verbatim), append new
    with open(STORE, "w") as f:
        for ln in lines:
            if not ln.endswith("\n"):
                ln += "\n"
            f.write(ln)
        for rec in appended:
            f.write(json.dumps(rec) + "\n")
    for rec in appended:
        print("APPENDED", rec["id"], rec["category"], "-", rec["text"][:60])
finally:
    try:
        os.remove(LOCK)
    except FileNotFoundError:
        pass
