#!/bin/sh
# Dựng toàn bộ stack bằng docker compose (Postgres thật), chạy kiểm thử khói, rồi gỡ stack thử nghiệm.
# Dùng: sh e2e/compose-test.sh   (từ thư mục gốc repo)
set -e
APP=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP"
export COMPOSE_PROJECT_NAME=moneylov-test POSTGRES_PASSWORD=test-pass-123 APP_PORT=18788
docker compose up -d --build db app backup 2>&1 | tail -5
for i in $(seq 1 90); do
  wget -qO- "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && break || sleep 2
done
docker compose ps
rm_shots=0
docker run --rm --network host -v "$APP":/w -v moneylov-pw:/pw -w /pw mcr.microsoft.com/playwright:v1.49.1-noble sh -c "
  [ -d node_modules/playwright ] || (npm init -y >/dev/null && npm i --silent playwright@1.49.1);
  cp /w/e2e/smoke.mjs ./smoke.mjs &&
  BASE=http://127.0.0.1:$APP_PORT DOT=/w/packages/core/test/fixtures/dot-2026-10-30.json OUT=/w/e2e/shots node smoke.mjs" || STATUS=$?
docker compose logs app 2>&1 | tail -15
docker compose exec -T db psql -U moneylov -d moneylov -c "select status, count(*) from transactions group by status;"
docker compose logs backup 2>&1 | tail -3
docker compose down -v 2>&1 | tail -2
exit ${STATUS:-0}
