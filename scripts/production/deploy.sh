#!/usr/bin/env sh
# AssurMatch PRODUCTION deployment (spec 057, PRD K-01 / K-04). Called by the CI job
# `deploy-production` on the production runner, after the GitHub Environment approval; can be run
# by hand on the host with the same variables.
#
#   ASSURMATCH_IMAGE_TAG=sha-<commit> ASSURMATCH_FRONTEND_TAG=production-sha-<commit> \
#     sh scripts/production/deploy.sh
#
# Order (nothing running is touched before step 4):
#   1. pre-deploy check of the per-app env files
#   2. pull the five images of the commit
#   3. prisma migrate deploy + migrate status, with the NEW API image (a failure stops here)
#   4. swap api, worker, public, admin, broker (+ redis, clamav)
#   5. health checks (API /readyz, public /, admin /login, broker /login, worker running)
#   6. on success record the deployed tags; on failure restart the previously recorded tags
#      (containers only: migrations are never rolled back automatically, they must be
#      backward compatible - see docs/runbooks/deployment-production.md).
set -eu

: "${ASSURMATCH_IMAGE_TAG:?ASSURMATCH_IMAGE_TAG is required (sha-<commit>)}"
: "${ASSURMATCH_FRONTEND_TAG:?ASSURMATCH_FRONTEND_TAG is required (production-sha-<commit>)}"
export ASSURMATCH_IMAGE_TAG ASSURMATCH_FRONTEND_TAG
export ASSURMATCH_ENV_DIR="${ASSURMATCH_ENV_DIR:-/home/deployer/apps/assurmatch/env}"
export ASSURMATCH_REGISTRY="${ASSURMATCH_REGISTRY:-ghcr.io/bkourouma}"
STATE_FILE="${ASSURMATCH_DEPLOY_STATE_FILE:-/home/deployer/apps/assurmatch/deployed.env}"
COMPOSE_FILE_PATH="${ASSURMATCH_COMPOSE_FILE:-docker-compose.production.yml}"
HEALTH_HOST="${ASSURMATCH_HEALTH_HOST:-127.0.0.1}"

compose() { docker compose -f "$COMPOSE_FILE_PATH" "$@"; }
log() { echo "[deploy-production] $*"; }

PREV_IMAGE_TAG=""
PREV_FRONTEND_TAG=""
if [ -f "$STATE_FILE" ]; then
  PREV_IMAGE_TAG=$(sed -n 's/^ASSURMATCH_IMAGE_TAG=//p' "$STATE_FILE" | tail -n1)
  PREV_FRONTEND_TAG=$(sed -n 's/^ASSURMATCH_FRONTEND_TAG=//p' "$STATE_FILE" | tail -n1)
fi
log "deploying api/worker=$ASSURMATCH_IMAGE_TAG frontends=$ASSURMATCH_FRONTEND_TAG (previous: ${PREV_IMAGE_TAG:-none}/${PREV_FRONTEND_TAG:-none})"

# 1. Configuration guard
sh scripts/production/pre-deploy-check.sh

# 2. Images
compose pull api worker public admin broker

# 3. Migrations, before any container is replaced
case ",${COMPOSE_PROFILES:-}," in
  *,bundled-db,*) compose up -d --wait postgres ;;
esac
log "prisma migrate deploy"
compose run --rm --no-deps -T api npx prisma migrate deploy --schema backend/prisma/schema.prisma
log "prisma migrate status"
compose run --rm --no-deps -T api npx prisma migrate status --schema backend/prisma/schema.prisma

# 4. Swap (the worker waits for a healthy API; a failure here goes to the rollback below)
healthy=1
compose up -d --remove-orphans api worker public admin broker redis clamav || healthy=0

# 5. Health
wait_for() { # url label
  i=0
  while [ "$i" -lt 40 ]; do
    if curl -fsS -o /dev/null "$1"; then log "healthy: $2"; return 0; fi
    i=$((i + 1))
    sleep 3
  done
  log "UNHEALTHY: $2 ($1)"
  return 1
}

wait_for "http://$HEALTH_HOST:${ASSURMATCH_API_HOST_PORT:-3600}/readyz" api || healthy=0
wait_for "http://$HEALTH_HOST:${ASSURMATCH_PUBLIC_HOST_PORT:-3601}/" public || healthy=0
wait_for "http://$HEALTH_HOST:${ASSURMATCH_ADMIN_HOST_PORT:-3602}/login" admin || healthy=0
wait_for "http://$HEALTH_HOST:${ASSURMATCH_BROKER_HOST_PORT:-3603}/login" broker || healthy=0
worker_state=$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' assurmatch-prod-worker 2>/dev/null || echo "missing")
case "$worker_state" in
  "running 0") log "healthy: worker (running)" ;;
  *) log "UNHEALTHY: worker ($worker_state)"; healthy=0 ;;
esac

if [ "$healthy" -ne 1 ]; then
  if [ -n "$PREV_IMAGE_TAG" ] && [ -n "$PREV_FRONTEND_TAG" ]; then
    log "health checks failed - restarting previous images $PREV_IMAGE_TAG / $PREV_FRONTEND_TAG (database migrations are NOT reverted)"
    ASSURMATCH_IMAGE_TAG="$PREV_IMAGE_TAG" ASSURMATCH_FRONTEND_TAG="$PREV_FRONTEND_TAG" compose up -d --remove-orphans api worker public admin broker redis clamav || true
  else
    log "health checks failed and no previous deployment is recorded - nothing to roll back to"
  fi
  exit 1
fi

# 6. Record and clean up
mkdir -p "$(dirname "$STATE_FILE")"
{
  echo "ASSURMATCH_IMAGE_TAG=$ASSURMATCH_IMAGE_TAG"
  echo "ASSURMATCH_FRONTEND_TAG=$ASSURMATCH_FRONTEND_TAG"
  echo "DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$STATE_FILE"
docker image prune -f >/dev/null
log "done"
