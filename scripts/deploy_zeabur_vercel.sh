#!/usr/bin/env bash
set -euo pipefail

# 至少配置一个：
# VERCEL_DEPLOY_HOOK="https://api.vercel.com/v1/integrations/deploy/xxx"
# ZEABUR_DEPLOY_HOOK="https://zeabur.com/deploy/xxx"

if [[ -z "${VERCEL_DEPLOY_HOOK:-}" && -z "${ZEABUR_DEPLOY_HOOK:-}" ]]; then
  echo "未配置任何 deploy hook"
  exit 1
fi

if [[ -n "${VERCEL_DEPLOY_HOOK:-}" ]]; then
  curl -fsS -X POST "$VERCEL_DEPLOY_HOOK" >/dev/null
fi

if [[ -n "${ZEABUR_DEPLOY_HOOK:-}" ]]; then
  curl -fsS -X POST "$ZEABUR_DEPLOY_HOOK" >/dev/null
fi

echo "deploy triggered"
