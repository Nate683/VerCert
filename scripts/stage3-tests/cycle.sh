#!/usr/bin/env bash
# LOCAL ONLY. Stops the local app on :3300, restores the post-migration DB snapshot, optionally rebuilds, then starts
# the production build on :3300 (foreground — run it in the background). Every step goes through local.sh, which
# refuses unless DATABASE_URL is the local test host.
#   cycle.sh [--build] [--sim]
set -euo pipefail
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pid=$(netstat -ano | grep ":3300 .*LISTENING" | awk '{print $5}' | head -1 || true)
[ -n "${pid:-}" ] && taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
node "$E/db-snapshot.mjs" restore "${SNAP:-post3}"   # SNAP=ref1 for the Refinements Package 1 suites
if [[ " $* " == *" --build "* ]]; then bash "$E/local.sh" npx next build > "$E/build.log" 2>&1 || { tail -30 "$E/build.log"; exit 1; }; echo "build ok"; fi
export ZELLE_RECIPIENT_NAME="LOCAL TEST RECIPIENT" ZELLE_RECIPIENT_HANDLE="zelle-test@example.invalid"
if [[ " $* " == *" --sim "* ]]; then export PAYMENT_SIMULATION=local-test-only; echo "simulation ON"; fi
exec bash "$E/local.sh" npx next start -p 3300
