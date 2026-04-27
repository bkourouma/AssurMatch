#!/usr/bin/env sh
# AssurMatch uploads-volume backup. Runs daily on the VPS.
# Source: /home/deployer/apps/assurmatch/uploads
# Output: /home/deployer/apps/assurmatch/backups/uploads/<date>.tar.gz[.gpg]
# Retention: 14 days.

set -eu

UPLOADS_DIR="${UPLOADS_DIR:-/home/deployer/apps/assurmatch/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/home/deployer/apps/assurmatch/backups/uploads}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DATE=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/uploads-$DATE.tar.gz"

tar -czf "$TARGET" -C "$UPLOADS_DIR" .

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$BACKUP_PASSPHRASE" \
      --output "$TARGET.gpg" "$TARGET"
  rm -f "$TARGET"
  TARGET="$TARGET.gpg"
fi

echo "[backup-uploads] Wrote $TARGET"

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -name 'uploads-*.tar.gz*' -delete
echo "[backup-uploads] Retention applied (>$RETENTION_DAYS days)"
