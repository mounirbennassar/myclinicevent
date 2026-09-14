#!/usr/bin/env bash
# Deploy the latest main branch on the server: pull, rebuild images, restart. Migrations run on API start.
# Usage (on the server): ~/myclinic-event/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== pulling latest main"
git fetch --quiet origin main
git reset --hard --quiet origin/main
git log --oneline -1

echo "== building and restarting containers"
docker compose up -d --build --remove-orphans

echo "== waiting for the API"
for i in $(seq 1 60); do
  if docker compose exec -T backend sh -c 'wget -qO- http://127.0.0.1:8000/api/health' >/dev/null 2>&1; then
    echo "API healthy"; break
  fi
  sleep 2
done
docker compose ps --format "table {{.Service}}\t{{.Status}}"
docker image prune -f >/dev/null
echo "== done"
