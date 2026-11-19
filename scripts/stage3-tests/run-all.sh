#!/usr/bin/env bash
# LOCAL ONLY. Runs every suite, one log per suite:
#   migration safety (rebuilds snap_post3 from snap_pre3) → engine → app with simulation OFF: API part A, browser,
#   Stage 2 rebuilt checks, Stage 1/2 regression → app with simulation ON: API part B
# Assumes the production build in .next is current (cycle.sh --build). Prints the summary lines.
set -uo pipefail
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$E"
wait_ready() { for i in $(seq 1 60); do grep -q "Ready in" "$1" && return 0; node -e "setTimeout(()=>{},2000)"; done; echo "server did not start"; tail -20 "$1"; return 1; }
stop_app() { pid=$(netstat -ano | grep ":3300 .*LISTENING" | awk '{print $5}' | head -1 || true); [ -n "${pid:-}" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1; node -e "setTimeout(()=>{},2000)"; }

stop_app
node t-migration.mjs > log-migration.txt 2>&1
node db-snapshot.mjs restore post3 >/dev/null && node t-engine.mjs > log-engine.txt 2>&1

bash cycle.sh > server-a.log 2>&1 &
wait_ready server-a.log && {
  PART=A SERVER_LOG="$E/server-a.log" node t-api.mjs > log-api-A.txt 2>&1
  node t-ui.mjs > log-ui.txt 2>&1
  node t-stage2.mjs > log-stage2.txt 2>&1
  node t-regress.mjs > log-regress.txt 2>&1
}
stop_app

bash cycle.sh --sim > server-b.log 2>&1 &
wait_ready server-b.log && PART=B SERVER_LOG="$E/server-b.log" node t-api.mjs > log-api-B.txt 2>&1
stop_app

for f in log-migration.txt log-engine.txt log-api-A.txt log-ui.txt log-stage2.txt log-regress.txt log-api-B.txt; do echo "== $f"; grep -E "^FAIL|passed, .* failed|FAILED:|Error" "$f" | head -12; done
