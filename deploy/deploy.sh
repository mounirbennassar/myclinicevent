#!/usr/bin/env bash
# Deploy the latest main branch on the server: pull, rebuild images, restart. Migrations run on API start.
# Usage (on the server): ~/myclinic-event/deploy/deploy.sh
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")/.."

echo "== pulling latest main"
git fetch --quiet origin main
git reset --hard --quiet origin/main
git log --oneline -1

# The pull may have replaced this very file; bash keeps running the old copy, so hand over
# to the fresh one once. The second pass finds nothing new to pull and continues below.
if [ "${DEPLOY_SH_REEXEC:-0}" != 1 ]; then
  DEPLOY_SH_REEXEC=1 exec "$SELF" "$@"
fi

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
