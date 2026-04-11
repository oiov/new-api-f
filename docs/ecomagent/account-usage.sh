#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export ECOMAGENT_STORE_PATH="${ECOMAGENT_STORE_PATH:-$SCRIPT_DIR/ecomagent_accounts.json}"
export GOCACHE="${GOCACHE:-/tmp/go-build}"

cd "$PROJECT_ROOT"
exec go run "./bin/ecomagent_account_usage.go" "$@"
