#!/usr/bin/env bash
set -euo pipefail

# 必填环境变量：
# PG_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
# 可选环境变量：
# BACKUP_DIR="./backups/postgres"
# BACKUP_ENCRYPT_KEY="xxx"   # 建议配置
# KEEP_BACKUPS="20"          # 保留最近 N 份

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
KEEP_BACKUPS="${KEEP_BACKUPS:-20}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%F_%H%M%S)"
BASE_NAME="pg_${TS}.dump"
RAW_FILE="${BACKUP_DIR}/${BASE_NAME}"

: "${PG_URL:?PG_URL 未设置}"

# 1) 备份（custom 格式，便于 pg_restore 校验和恢复）
pg_dump --dbname="$PG_URL" --format=custom --file="$RAW_FILE"

# 2) 备份完整性校验（能列目录视为可用）
pg_restore -l "$RAW_FILE" >/dev/null

FINAL_FILE="$RAW_FILE"

# 3) 可选加密
if [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]]; then
  ENC_FILE="${RAW_FILE}.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$RAW_FILE" \
    -out "$ENC_FILE" \
    -pass "pass:${BACKUP_ENCRYPT_KEY}"
  rm -f "$RAW_FILE"
  FINAL_FILE="$ENC_FILE"
fi

# 4) 生成校验文件
shasum -a 256 "$FINAL_FILE" > "${FINAL_FILE}.sha256"

# 5) 清理旧备份
cd "$BACKUP_DIR"
if compgen -G 'pg_*.dump' > /dev/null || compgen -G 'pg_*.dump.enc' > /dev/null; then
  ls -1t pg_*.dump pg_*.dump.enc 2>/dev/null | awk "NR>${KEEP_BACKUPS}" | while read -r f; do
    rm -f "$f" "${f}.sha256"
  done
fi

echo "BACKUP_FILE=${FINAL_FILE}"
