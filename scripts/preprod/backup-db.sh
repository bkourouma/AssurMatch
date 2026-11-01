#!/usr/bin/env sh
# AssurMatch PREPRODUCTION PostgreSQL dump (bundled database of docker-compose.preprod-vps.yml).
# Runs on the VPS: daily from cron, and from deploy.sh before every migration
# (BACKUP_LABEL=pre-deploy). Nothing is exposed on the host: pg_dump runs inside the container.
#
#   sh /home/deployer/apps/assurmatch-preprod/backup-db.sh
#
# Output: <deploy dir>/backups/postgres-<label>-<UTC date>.sql.gz, mode 0600.
# Retention: BACKUP_RETENTION_DAYS (default 14). Restore: docs/runbooks/deployment.md.
set -eu

DEPLOY_DIR="${ASSURMATCH_PREPROD_DIR:-/home/deployer/apps/assurmatch-preprod}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
LABEL="${BACKUP_LABEL:-daily}"
CONTAINER="${ASSURMATCH_POSTGRES_CONTAINER:-assurmatch-preprod-postgres}"

log() { echo "[backup-db] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

umask 077
mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/postgres-$LABEL-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
TMP="$TARGET.partial"

if ! docker exec "$CONTAINER" sh -c 'set -o pipefail; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --clean --if-exists | gzip -9' > "$TMP"; then
  rm -f "$TMP"
  log "FAILED: pg_dump in $CONTAINER"
  exit 1
fi
gzip -t "$TMP"
mv -f "$TMP" "$TARGET"
log "written $TARGET ($(du -h "$TARGET" | cut -f1))"

find "$BACKUP_DIR" -name 'postgres-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/[backup-db] expired: /'
