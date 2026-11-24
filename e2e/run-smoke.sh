#!/bin/sh
# Chạy kiểm thử khói trên máy có Docker: dựng API (PGlite trong bộ nhớ) + chạy Playwright.
# Dùng: sh e2e/run-smoke.sh   (từ thư mục gốc repo, sau khi đã build apps/web)
set -e
APP=$(cd "$(dirname "$0")/.." && pwd)
PORT=${PORT:-18787}
docker rm -f moneylov-smoke >/dev/null 2>&1 || true
docker run -d --name moneylov-smoke --network host -v "$APP":/w -w /w/apps/api \
  -e PORT=$PORT -e PGDATA=memory:// -e HOST=127.0.0.1 node:22-alpine sh -c "npx tsx src/index.ts" >/dev/null
for i in $(seq 1 60); do
  wget -qO- "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break || sleep 1
done
rm -rf "$APP/e2e/shots"
docker run --rm --network host -v "$APP":/w -v moneylov-pw:/pw -w /pw mcr.microsoft.com/playwright:v1.49.1-noble sh -c "
  [ -d node_modules/playwright ] || (npm init -y >/dev/null && npm i --silent playwright@1.49.1);
  cp /w/e2e/smoke.mjs ./smoke.mjs &&
  BASE=http://127.0.0.1:$PORT DOT=/w/packages/core/test/fixtures/dot-2026-10-30.json OUT=/w/e2e/shots node smoke.mjs" || STATUS=$?
docker logs moneylov-smoke 2>&1 | tail -20
docker rm -f moneylov-smoke >/dev/null
exit ${STATUS:-0}
