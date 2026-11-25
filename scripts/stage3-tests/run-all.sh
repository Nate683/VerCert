#!/usr/bin/env bash
# LOCAL ONLY. Runs every suite, one log per suite, against the state production will have after BOTH migrations:
#   Stage 3 migration safety (rebuilds snap_post3 from snap_pre3) → Package 1 migration + database rules (snap_post3 →
#   snap_ref1) → engine on snap_ref1 → app (snap_ref1) with simulation OFF: Stage 3 API part A, browser, Stage 2 rebuilt
#   checks, Stage 1/2 regression → app (snap_ref1) with simulation ON: API part B → app on a fresh snap_ref1: Package 1
#   app and browser suites (restored again so the Stage 3 suites' own data changes can't affect them).
# Assumes the production build in .next is current (cycle.sh --build). Prints the summary lines.
set -uo pipefail
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$E"
wait_ready() { for i in $(seq 1 60); do grep -q "Ready in" "$1" && return 0; node -e "setTimeout(()=>{},2000)"; done; echo "server did not start"; tail -20 "$1"; return 1; }
stop_app() { pid=$(netstat -ano | grep ":3300 .*LISTENING" | awk '{print $5}' | head -1 || true); [ -n "${pid:-}" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1; node -e "setTimeout(()=>{},2000)"; }

stop_app
node t-migration.mjs > log-migration.txt 2>&1
node t-refinements-mig.mjs > log-r1-mig.txt 2>&1
node db-snapshot.mjs restore ref1 >/dev/null && node t-engine.mjs > log-engine.txt 2>&1

SNAP=ref1 bash cycle.sh > server-a.log 2>&1 &
wait_ready server-a.log && {
  PART=A SERVER_LOG="$E/server-a.log" node t-api.mjs > log-api-A.txt 2>&1
  node t-ui.mjs > log-ui.txt 2>&1
  node t-stage2.mjs > log-stage2.txt 2>&1
  node t-regress.mjs > log-regress.txt 2>&1
}
stop_app

SNAP=ref1 bash cycle.sh --sim > server-b.log 2>&1 &
wait_ready server-b.log && PART=B SERVER_LOG="$E/server-b.log" node t-api.mjs > log-api-B.txt 2>&1
stop_app

SNAP=ref1 bash cycle.sh > server-c.log 2>&1 &
wait_ready server-c.log && {
  node t-refinements-app.mjs > log-r1-app.txt 2>&1
  node t-refinements-ui.mjs > log-r1-ui.txt 2>&1
  node t-visual2-ui.mjs > log-v2-ui.txt 2>&1
}
stop_app

for f in log-migration.txt log-r1-mig.txt log-engine.txt log-api-A.txt log-ui.txt log-stage2.txt log-regress.txt log-api-B.txt log-r1-app.txt log-r1-ui.txt log-v2-ui.txt; do echo "== $f"; grep -E "^FAIL|passed, .* failed|FAILED:|Error" "$f" | head -12; done
