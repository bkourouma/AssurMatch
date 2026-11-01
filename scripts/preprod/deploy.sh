#!/usr/bin/env sh
# AssurMatch PREPRODUCTION deployment on the Alliance VPS (docker-compose.preprod-vps.yml).
# Called by the CI job `deploy-preproduction` on the self-hosted runner `assurmatch-preprod`, from
# the checkout:
#
#   ASSURMATCH_IMAGE_TAG=sha-<commit> sh scripts/preprod/deploy.sh
#
# or by hand from /home/deployer/apps/assurmatch-preprod (manual rollback; the images must be on the
# host, otherwise `docker login ghcr.io` first):
#
#   ASSURMATCH_IMAGE_TAG=sha-<good-commit> sh deploy.sh
#
# Order (nothing running is touched before step 6):
#   0. from a checkout: copy the compose file and the preprod scripts into the deploy directory
#   1. pre-deploy check of the per-app env files
#   2. pull the five application images of the commit
#   3. start postgres, redis, mailpit (no-op when already healthy)
#   4. back up the database when a deployment is already recorded (a failed backup stops here)
#   5. prisma migrate deploy + status with the NEW API image; first deployment only (or
#      ASSURMATCH_SEED_REFERENCE=1): idempotent reference seed
#   6. swap api, worker, public, admin, broker
#   7. health checks (API /readyz, public /, admin /login, broker /login, worker running)
#   8. success: record the tags in .env (also what manual `docker compose` commands interpolate);
#      failure: restart the previously recorded tags (containers only: migrations are never
#      reverted, they must stay backward compatible) and exit 1
set -eu

: "${ASSURMATCH_IMAGE_TAG:?ASSURMATCH_IMAGE_TAG is required (sha-<commit>)}"
ASSURMATCH_FRONTEND_TAG="${ASSURMATCH_FRONTEND_TAG:-$ASSURMATCH_IMAGE_TAG}"
export ASSURMATCH_IMAGE_TAG ASSURMATCH_FRONTEND_TAG
DEPLOY_DIR="${ASSURMATCH_PREPROD_DIR:-/home/deployer/apps/assurmatch-preprod}"
export ASSURMATCH_PREPROD_DIR="$DEPLOY_DIR"
export ASSURMATCH_ENV_DIR="${ASSURMATCH_ENV_DIR:-$DEPLOY_DIR/env}"
export ASSURMATCH_REGISTRY="${ASSURMATCH_REGISTRY:-ghcr.io/bkourouma}"
STATE_FILE="$DEPLOY_DIR/.env"
HISTORY_FILE="$DEPLOY_DIR/deploy-history.log"
HEALTH_HOST="${ASSURMATCH_HEALTH_HOST:-127.0.0.1}"
DEPLOY_FILES="docker-compose.yml deploy.sh pre-deploy-check.sh backup-db.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

compose() { docker compose -f docker-compose.yml "$@"; }
log() { echo "[deploy-preprod] $*"; }

# 0. Deployment files (staged then renamed: the cron backup never reads a half-written script)
mkdir -p "$DEPLOY_DIR"
if [ -f "$REPO_DIR/docker-compose.preprod-vps.yml" ] && [ "$SCRIPT_DIR" != "$(cd "$DEPLOY_DIR" && pwd -P)" ]; then
  incoming="$DEPLOY_DIR/.incoming"
  rm -rf "$incoming"
  mkdir -p "$incoming"
  cp "$REPO_DIR/docker-compose.preprod-vps.yml" "$incoming/docker-compose.yml"
  for f in deploy.sh pre-deploy-check.sh backup-db.sh; do cp "$SCRIPT_DIR/$f" "$incoming/$f"; done
  chmod 750 "$incoming"/*.sh
  chmod 640 "$incoming/docker-compose.yml"
  for f in $DEPLOY_FILES; do mv -f "$incoming/$f" "$DEPLOY_DIR/$f"; done
  rmdir "$incoming"
  log "deployment files copied to $DEPLOY_DIR"
fi
cd "$DEPLOY_DIR"

PREV_IMAGE_TAG=""
PREV_FRONTEND_TAG=""
if [ -f "$STATE_FILE" ]; then
  PREV_IMAGE_TAG=$(sed -n 's/^ASSURMATCH_IMAGE_TAG=//p' "$STATE_FILE" | tail -n1)
  PREV_FRONTEND_TAG=$(sed -n 's/^ASSURMATCH_FRONTEND_TAG=//p' "$STATE_FILE" | tail -n1)
fi
log "deploying api/worker=$ASSURMATCH_IMAGE_TAG frontends=$ASSURMATCH_FRONTEND_TAG (previous: ${PREV_IMAGE_TAG:-none}/${PREV_FRONTEND_TAG:-none})"

# 1. Configuration guard
sh ./pre-deploy-check.sh
compose config -q

# 2. Images
compose pull api worker public admin broker

# 3. Data stores and mail capture
compose up -d --wait postgres redis mailpit

# 4. Backup before migrating
if [ -n "$PREV_IMAGE_TAG" ]; then
  log "database backup before migration"
  BACKUP_LABEL=pre-deploy sh ./backup-db.sh || { log "backup failed - deployment stopped, running containers untouched"; exit 1; }
fi

# 5. Migrations (and reference data on the first deployment), before any container is replaced
log "prisma migrate deploy"
compose run --rm --no-deps -T api npx prisma migrate deploy --schema backend/prisma/schema.prisma
log "prisma migrate status"
compose run --rm --no-deps -T api npx prisma migrate status --schema backend/prisma/schema.prisma
if [ -z "$PREV_IMAGE_TAG" ] || [ "${ASSURMATCH_SEED_REFERENCE:-0}" = "1" ]; then
  log "reference seed (idempotent)"
  compose run --rm --no-deps -T api node --import tsx scripts/preprod/seed-reference.ts
fi

# 6. Swap (the worker waits for a healthy API; a failure here goes to the rollback below)
healthy=1
compose up -d --remove-orphans api worker public admin broker || healthy=0

# 7. Health
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

if [ "$healthy" -eq 1 ]; then
  wait_for "http://$HEALTH_HOST:${ASSURMATCH_API_HOST_PORT:-3600}/readyz" api || healthy=0
  wait_for "http://$HEALTH_HOST:${ASSURMATCH_PUBLIC_HOST_PORT:-3601}/" public || healthy=0
  wait_for "http://$HEALTH_HOST:${ASSURMATCH_ADMIN_HOST_PORT:-3602}/login" admin || healthy=0
  wait_for "http://$HEALTH_HOST:${ASSURMATCH_BROKER_HOST_PORT:-3603}/login" broker || healthy=0
  worker_state=$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' assurmatch-preprod-worker 2>/dev/null || echo "missing")
  case "$worker_state" in
    "running 0") log "healthy: worker (running)" ;;
    *) log "UNHEALTHY: worker ($worker_state)"; healthy=0 ;;
  esac
fi

if [ "$healthy" -ne 1 ]; then
  compose logs --tail 60 api worker public admin broker || true
  if [ -n "$PREV_IMAGE_TAG" ] && [ -n "$PREV_FRONTEND_TAG" ]; then
    log "health checks failed - restarting previous images $PREV_IMAGE_TAG / $PREV_FRONTEND_TAG (database migrations are NOT reverted)"
    ASSURMATCH_IMAGE_TAG="$PREV_IMAGE_TAG" ASSURMATCH_FRONTEND_TAG="$PREV_FRONTEND_TAG" compose up -d --remove-orphans api worker public admin broker || true
  else
    log "health checks failed and no previous deployment is recorded - containers left in place for diagnosis"
  fi
  exit 1
fi

# 8. Record and clean up
{
  echo "ASSURMATCH_IMAGE_TAG=$ASSURMATCH_IMAGE_TAG"
  echo "ASSURMATCH_FRONTEND_TAG=$ASSURMATCH_FRONTEND_TAG"
  echo "DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$STATE_FILE.tmp"
mv -f "$STATE_FILE.tmp" "$STATE_FILE"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $ASSURMATCH_IMAGE_TAG $ASSURMATCH_FRONTEND_TAG" >> "$HISTORY_FILE"
docker image prune -f >/dev/null
log "done"
