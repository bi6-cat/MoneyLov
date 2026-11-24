#!/bin/sh
# Sao lưu Postgres mỗi ngày vào ./backups, giữ KEEP_DAYS ngày gần nhất.
set -o pipefail
until pg_isready -h db -U moneylov -q; do sleep 2; done
while true; do
  f="/backups/moneylov-$(date +%F).sql.gz"
  if pg_dump -h db -U moneylov moneylov | gzip > "$f.tmp"; then
    mv "$f.tmp" "$f" && echo "backup $f"
  else
    echo "backup THẤT BẠI $(date)" >&2
    rm -f "$f.tmp"
  fi
  # Xoá bản sao lưu cũ (chỉ các file moneylov-*.sql.gz trong /backups)
  find /backups -maxdepth 1 -name 'moneylov-*.sql.gz' -mtime +"${KEEP_DAYS:-30}" -exec rm -f {} \;
  sleep 86400
done
