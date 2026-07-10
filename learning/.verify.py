import json
for p in ["heuristics/heuristics.jsonl", "/Users/harissaif/.pi/heuristics/heuristics.jsonl"]:
    n = sum(1 for l in open(p) if l.strip() and json.loads(l))
    print(f"OK {n} lines: {p}")
