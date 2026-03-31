#!/usr/bin/env bash
set -Eeuo pipefail

# 必填环境变量：
# REPO_DIR="/ql/data/repo/new-api"
# BRANCH="fishxcode"
# PUSHPLUS_TOKEN="xxxxxxxxxxxxxxxx"
# PG_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"

# 可选环境变量：
# PUSHPLUS_TOPIC="你的群组编码"
# PUSHPLUS_TEMPLATE="markdown"
# BACKUP_DIR="/ql/data/repo/new-api/backups/postgres"
# BACKUP_ENCRYPT_KEY="xxx"
# KEEP_BACKUPS="20"

REPO_DIR="${REPO_DIR:-/ql/data/repo/new-api}"
BRANCH="${BRANCH:-fishxcode}"
PUSHPLUS_TEMPLATE="${PUSHPLUS_TEMPLATE:-markdown}"

STAGE="init"

notify_pushplus() {
  local title="$1"
  local content="$2"

  [[ -z "${PUSHPLUS_TOKEN:-}" ]] && return 0

  local api="https://www.pushplus.plus/send"
  local payload

  if [[ -n "${PUSHPLUS_TOPIC:-}" ]]; then
    payload="$(cat <<EOF
{
  "token":"${PUSHPLUS_TOKEN}",
  "topic":"${PUSHPLUS_TOPIC}",
  "title":"${title}",
  "content":"${content}",
  "template":"${PUSHPLUS_TEMPLATE}"
}
EOF
)"
  else
    payload="$(cat <<EOF
{
  "token":"${PUSHPLUS_TOKEN}",
  "title":"${title}",
  "content":"${content}",
  "template":"${PUSHPLUS_TEMPLATE}"
}
EOF
)"
  fi

  curl -fsS -X POST "$api" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null || true
}

on_error() {
  local line="$1"
  local cmd="$2"
  local msg="### 发布失败
- 机器: $(hostname)
- 分支: ${BRANCH}
- 阶段: ${STAGE}
- 行号: ${line}
- 命令: \`${cmd}\`
- 时间: $(date '+%F %T')"
  notify_pushplus "new-api 发布失败" "$msg"
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

cd "$REPO_DIR"

LOCK_FILE="/tmp/release_with_pg_backup.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "已有发布任务在执行"; exit 1; }

STAGE="backup"
OUT="$(bash scripts/backup_postgres.sh)"
echo "$OUT"
BACKUP_FILE="$(echo "$OUT" | awk -F= '/^BACKUP_FILE=/{print $2}')"

test -n "$BACKUP_FILE"
test -f "$BACKUP_FILE"
test -f "${BACKUP_FILE}.sha256"

# 阶段1：备份成功通知
BACKUP_MSG="### PostgreSQL 备份成功
- 机器: $(hostname)
- 分支: ${BRANCH}
- 备份: \`${BACKUP_FILE}\`
- 时间: $(date '+%F %T')
- 状态: 即将开始发布"
notify_pushplus "new-api 备份成功" "$BACKUP_MSG"

STAGE="deploy"
bash scripts/deploy_zeabur_vercel.sh

STAGE="git_push"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

git add "$BACKUP_FILE" "${BACKUP_FILE}.sha256"
git commit -m "chore(backup): pre-release postgres backup $(date +%F_%H%M%S)" || echo "没有新变更可提交"
git push origin "$BRANCH"

STAGE="done"
# 阶段2：发布完成通知
SUCCESS_MSG="### 发布成功
- 机器: $(hostname)
- 分支: ${BRANCH}
- 备份: \`${BACKUP_FILE}\`
- 时间: $(date '+%F %T')
- 状态: 已完成备份 + 发布 + 推送备份到 GitHub"
notify_pushplus "new-api 发布成功" "$SUCCESS_MSG"

echo "release success"
