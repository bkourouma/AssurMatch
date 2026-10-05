#!/usr/bin/env sh
# AssurMatch restore from the encrypted offsite backup (spec 058 FR-005, RTO 4 h).
#
# Restores ONE backup (latest complete one by default) into an EMPTY PostgreSQL database and,
# optionally, the uploads archive into an EMPTY directory. Never targets a database that already
# holds tables (unless RESTORE_ALLOW_NON_EMPTY=true, for an explicit disaster recovery), and never
# the database of DATABASE_URL. Prints timings per step for the runbook.
#
# Usage:
#   RESTORE_DATABASE_URL=postgresql://.../assurmatch_restore \
#   BACKUP_AGE_IDENTITY_FILE=/secure/backup-identity.txt \
#   scripts/ops/restore-offsite.sh [--stamp 20261003T020000Z] [--uploads-dir /tmp/restore-uploads] [--list]
#
# Decryption: BACKUP_AGE_IDENTITY_FILE (age private identity, kept offline) or
# BACKUP_GPG_PASSPHRASE_FILE (gpg symmetric fallback). S3 settings: same BACKUP_S3_* as the backup.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=backup-lib.sh
. "$SCRIPT_DIR/backup-lib.sh"
BACKUP_LOG_TAG=restore-offsite

STAMP=""
UPLOADS_TARGET=""
LIST_ONLY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --stamp) STAMP="${2:?--stamp needs a value}"; shift 2 ;;
    --uploads-dir) UPLOADS_TARGET="${2:?--uploads-dir needs a value}"; shift 2 ;;
    --list) LIST_ONLY=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_s3_env
require_cmd curl sha256sum

# Complete backups only: those whose manifest was uploaded (it is written last).
STAMPS=$(s3_list "$BACKUP_S3_PREFIX/" | sed -n "s#^$BACKUP_S3_PREFIX/\([0-9]\{8\}T[0-9]\{6\}Z\)/manifest.txt\$#\1#p" | sort)
if [ "$LIST_ONLY" = true ]; then
  printf '%s\n' "$STAMPS"
  exit 0
fi

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required (an empty database)}"
require_cmd pg_restore psql
if [ -n "${DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$DATABASE_URL" ]; then
  die "RESTORE_DATABASE_URL equals DATABASE_URL: refusing to restore over the live database"
fi
if [ -n "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
  require_cmd age
  DECRYPT=age
elif [ -n "${BACKUP_GPG_PASSPHRASE_FILE:-}" ]; then
  require_cmd gpg
  DECRYPT=gpg
else
  die "BACKUP_AGE_IDENTITY_FILE or BACKUP_GPG_PASSPHRASE_FILE is required"
fi

[ -n "$STAMPS" ] || die "no complete backup under s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/"
if [ -z "$STAMP" ]; then STAMP=$(printf '%s\n' "$STAMPS" | tail -n1); fi
printf '%s\n' "$STAMPS" | grep -qx "$STAMP" || die "backup $STAMP not found or incomplete"

TABLES=$(psql "$RESTORE_DATABASE_URL" -At -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
if [ "$TABLES" != "0" ] && [ "${RESTORE_ALLOW_NON_EMPTY:-false}" != "true" ]; then
  die "target database is not empty ($TABLES tables): restore into a fresh database"
fi
if [ -n "$UPLOADS_TARGET" ]; then
  mkdir -p "$UPLOADS_TARGET"
  [ -z "$(ls -A "$UPLOADS_TARGET")" ] || die "uploads target directory is not empty"
fi

STARTED=$(now_s)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/assurmatch-restore.XXXXXX")
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
REMOTE_DIR="$BACKUP_S3_PREFIX/$STAMP"
log "start stamp=$STAMP"

t=$(now_s)
s3_get "$REMOTE_DIR/manifest.txt" "$WORK/manifest.txt"
grep '^file=' "$WORK/manifest.txt" | while read -r line; do
  base=$(printf '%s' "$line" | sed 's/^file=\([^ ]*\).*/\1/')
  s3_get "$REMOTE_DIR/$base" "$WORK/$base"
done
log "step=download seconds=$(( $(now_s) - t ))"

t=$(now_s)
grep '^file=' "$WORK/manifest.txt" | while read -r line; do
  base=$(printf '%s' "$line" | sed 's/^file=\([^ ]*\).*/\1/')
  expected=$(printf '%s' "$line" | sed 's/.*sha256=\([0-9a-f]*\).*/\1/')
  [ "$(sha256_of "$WORK/$base")" = "$expected" ] || die "checksum mismatch for $base"
done
log "step=verify_checksums seconds=$(( $(now_s) - t ))"

decrypt() { # decrypt <encrypted> <plain>
  case "$DECRYPT" in
    age) age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$2" "$1" ;;
    gpg) gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_GPG_PASSPHRASE_FILE" --decrypt --output "$2" "$1" ;;
  esac
}

t=$(now_s)
for enc in "$WORK"/postgres.dump.* "$WORK"/uploads.tar.gz.*; do
  [ -e "$enc" ] || continue
  decrypt "$enc" "${enc%.*}"
  rm -f "$enc"
done
log "step=decrypt seconds=$(( $(now_s) - t ))"

t=$(now_s)
pg_restore --no-owner --no-acl --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$WORK/postgres.dump"
log "step=pg_restore seconds=$(( $(now_s) - t ))"

if [ -n "$UPLOADS_TARGET" ] && [ -e "$WORK/uploads.tar.gz" ]; then
  t=$(now_s)
  tar -xzf "$WORK/uploads.tar.gz" -C "$UPLOADS_TARGET"
  log "step=uploads_extract seconds=$(( $(now_s) - t )) files=$(find "$UPLOADS_TARGET" -type f | wc -l | tr -d ' ')"
fi

t=$(now_s)
count() { psql "$RESTORE_DATABASE_URL" -At -c "select count(*) from \"$1\"" 2>/dev/null || echo "n/a"; }
log "verify migrations=$(count _prisma_migrations) users=$(count User) audit_logs=$(count AuditLog) feature_flags=$(count FeatureFlag) partner_licenses=$(count PartnerLicense)"
log "step=verify seconds=$(( $(now_s) - t ))"
log "done stamp=$STAMP total_seconds=$(( $(now_s) - STARTED ))"
