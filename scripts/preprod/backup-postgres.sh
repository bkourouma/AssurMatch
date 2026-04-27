#!/usr/bin/env sh
# AssurMatch PostgreSQL backup. Runs daily on the VPS.
# Output: /home/deployer/apps/assurmatch/backups/postgres/<date>.sql.gz[.gpg]
# Retention: 14 days.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/home/deployer/apps/assurmatch/backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"
DATE=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/postgres-$DATE.sql.gz"

pg_dump --no-owner --no-acl --format=plain "$DB_URL" | gzip -9 > "$TARGET"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$BACKUP_PASSPHRASE" \
      --output "$TARGET.gpg" "$TARGET"
  rm -f "$TARGET"
  TARGET="$TARGET.gpg"
fi

echo "[backup-postgres] Wrote $TARGET"

# Retention
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -name 'postgres-*.sql.gz*' -delete
echo "[backup-postgres] Retention applied (>$RETENTION_DAYS days)"
