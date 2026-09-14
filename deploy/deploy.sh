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
# The backend image (python:3.12-slim) has no wget or curl, so probe with the venv's Python.
healthy=0
for i in $(seq 1 60); do
  if docker compose exec -T backend /app/.venv/bin/python -c \
      'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=3)' >/dev/null 2>&1; then
    healthy=1; echo "API healthy"; break
  fi
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  echo "API did not answer within 2 minutes. Recent backend logs:" >&2
  docker compose logs --tail 40 backend >&2
  exit 1
fi
docker compose ps --format "table {{.Service}}\t{{.Status}}"
docker image prune -f >/dev/null
echo "== done"
