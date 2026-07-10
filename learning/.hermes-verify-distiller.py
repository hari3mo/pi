import json, os, sys

base = os.path.expanduser("~/.pi/agent/learning")
agent_store = os.path.expanduser("~/.pi/agent/heuristics/heuristics.jsonl")
global_store = os.path.expanduser("~/.pi/heuristics/heuristics.jsonl")
ok = True

new_ids = {"h_mresw1at_gpuo", "h_mresw1bb_krp2", "h_mresw1bt_xxjw", "h_mresw1cb_lfby"}
recs = [json.loads(l) for l in open(agent_store) if l.strip()]
ids = {r["id"] for r in recs}
missing = new_ids - ids
print(f"agent store: {len(recs)} recs parse OK; new ids present: {not missing}"
      + (f" MISSING {missing}" if missing else ""))
if missing: ok = False
for r in recs:
    if r["id"] in new_ids:
        for k in ("id","text","scope","project","category","created","lastReinforced","hits","source","pinned","basis"):
            if k not in r:
                print(f"  FAIL {r['id']} missing field {k}"); ok = False

g = [json.loads(l) for l in open(global_store) if l.strip()]
print(f"global store: {len(g)} recs parse OK")

cur = json.load(open(os.path.join(base, ".distiller-cursor")))
print(f"cursor: {cur}")
if cur["lastEventId"] != "ev_mrdzwgmo_j32z":
    print("  FAIL cursor not held at ev_mrdzwgmo_j32z"); ok = False

dg = os.path.join(base, "digests", "2026-07-10.md")
sz = os.path.getsize(dg)
print(f"digest 2026-07-10.md: {sz} bytes")
if sz < 500: ok = False

for t in (".distiller_run.py", ".verify.py"):
    exists = os.path.exists(os.path.join(base, t))
    print(f"temp {t} removed: {not exists}")
    if exists: ok = False

print("ALL OK" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)
