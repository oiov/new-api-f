#!/usr/bin/env bash
set -euo pipefail

# 必填环境变量：
#   PG_URL="postgresql://user:pass@host:5432/dbname"
#
# 可选环境变量：
#   SUBSCRIPTION_AUDIT_DATE="2026-04-04"
#   SUBSCRIPTION_RESET_TIMEZONE="Asia/Shanghai"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

: "${PG_URL:?PG_URL 未设置}"

AUDIT_DATE="${SUBSCRIPTION_AUDIT_DATE:-$(TZ="${SUBSCRIPTION_RESET_TIMEZONE:-Asia/Shanghai}" date +%F)}"
RESET_TZ="${SUBSCRIPTION_RESET_TIMEZONE:-Asia/Shanghai}"

psql "$PG_URL" \
  -v "audit_date=${AUDIT_DATE}" \
  -v "reset_tz=${RESET_TZ}" \
  -f "${SCRIPT_DIR}/audit_subscription_reset.sql"
