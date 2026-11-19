#!/usr/bin/env bash
# Runs one command against the LOCAL test database only.
# Sources env.sh (DATABASE_URL = *.invalid → local shim; service keys blanked; network guard preloaded), then refuses
# to continue unless DATABASE_URL really is the local test host. Usage: local.sh <command...>
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
case "$DATABASE_URL" in
  *db.demo.invalid*) ;;
  *) echo "local.sh: DATABASE_URL is not the local test DB — refusing" >&2; exit 1 ;;
esac
cd /c/Users/NateR/OneDrive/Desktop/VeriCert
exec "$@"
