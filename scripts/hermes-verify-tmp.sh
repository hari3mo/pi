#!/bin/bash
# hermes-verify: ad-hoc verification of this turn's learning-pipeline changes.
set -u
cd /Users/harissaif/.pi/agent || exit 1
fails=0

echo "=== 1. pure-logic checks (check-learning-tap.mjs) ==="
node scripts/check-learning-tap.mjs 2>&1 | tail -1 || fails=$((fails+1))
node scripts/check-learning-tap.mjs > /dev/null 2>&1 || fails=$((fails+1))

echo "=== 2. extension load smoke (all 24) ==="
node scripts/smoke-extensions.mjs 2>&1 | grep -E 'learning-tap|oracle-first|graph-first|heuristics/index|error\(s\)'
node scripts/smoke-extensions.mjs 2>&1 | grep -q '^0 error' || fails=$((fails+1))

echo "=== 3. config validator ==="
python3 scripts/validate-config.py 2>&1 | tail -1
python3 scripts/validate-config.py > /dev/null 2>&1 || fails=$((fails+1))

echo "=== 4. pipeline audit (incl. learning liveness) ==="
python3 scripts/audit-pipelines.py 2>&1 | tail -1
python3 scripts/audit-pipelines.py > /dev/null 2>&1 || fails=$((fails+1))

echo "=== 5. learn_heuristic retired / learn present ==="
grep -q 'registerTool' extensions/heuristics/index.ts && { echo "FAIL: heuristics still registers a tool"; fails=$((fails+1)); } || echo "ok: heuristics registers no capture tool"
grep -q 'name: "learn"' extensions/learning-tap/index.ts && echo "ok: learn tool registered" || { echo "FAIL: learn missing"; fails=$((fails+1)); }

echo "=== 6. violation emits wired in both guards ==="
grep -c 'learning-violation' extensions/oracle-first.ts extensions/graph-first.ts

echo
[ $fails -eq 0 ] && echo "VERIFY: ALL PASS" || echo "VERIFY: $fails GATE(S) FAILED"
exit $fails
