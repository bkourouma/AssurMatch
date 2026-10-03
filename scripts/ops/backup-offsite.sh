#!/usr/bin/env sh
# AssurMatch encrypted offsite backup (spec 058 FR-005, RPO 24 h). Runs nightly on the production host.
#
#   1. pg_dump (custom format, compressed) of DATABASE_URL;
#   2. tar.gz of UPLOADS_DIR when set (local document storage; with ASSURMATCH_DOCUMENT_STORAGE=s3
#      the documents already live in their own versioned bucket);
#   3. encryption with age (BACKUP_AGE_RECIPIENTS_FILE: public keys only on the server, the private
#      identity stays offline) or, as a fallback, gpg --symmetric (BACKUP_GPG_PASSPHRASE_FILE);
#      plaintext never leaves the host and is deleted as soon as it is encrypted;
#   4. upload to S3-compatible storage under <BACKUP_S3_PREFIX>/<stamp>/ with a SHA-256 manifest;
#   5. remote retention: <stamp>/ directories older than BACKUP_RETENTION_DAYS (default 30) deleted;
#   6. optional Uptime Kuma push (BACKUP_PUSH_URL) so a missing nightly backup raises an alert.
#
# Usage: scripts/ops/backup-offsite.sh            (env from /etc/assurmatch/backup.env, see runbook)
# Exit 0 on success, 1 on any failure (set -e). Prints step timings; never prints a secret.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=backup-lib.sh
. "$SCRIPT_DIR/backup-lib.sh"
BACKUP_LOG_TAG=backup-offsite

: "${DATABASE_URL:?DATABASE_URL is required}"
require_s3_env
require_cmd pg_dump curl sha256sum tar gzip
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
WORK_ROOT="${BACKUP_WORK_DIR:-/var/backups/assurmatch/work}"

if [ -n "${BACKUP_AGE_RECIPIENTS_FILE:-}" ]; then
  require_cmd age
  [ -r "$BACKUP_AGE_RECIPIENTS_FILE" ] || die "BACKUP_AGE_RECIPIENTS_FILE is not readable"
  ENCRYPTION=age
elif [ -n "${BACKUP_GPG_PASSPHRASE_FILE:-}" ]; then
  require_cmd gpg
  [ -r "$BACKUP_GPG_PASSPHRASE_FILE" ] || die "BACKUP_GPG_PASSPHRASE_FILE is not readable"
  ENCRYPTION=gpg
else
  die "no encryption configured (BACKUP_AGE_RECIPIENTS_FILE or BACKUP_GPG_PASSPHRASE_FILE): refusing to upload plaintext"
fi

encrypt() { # encrypt <plain> -> prints the encrypted file name, removes the plaintext
  case "$ENCRYPTION" in
    age) age --encrypt --recipients-file "$BACKUP_AGE_RECIPIENTS_FILE" --output "$1.age" "$1"; out="$1.age" ;;
    gpg) gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_GPG_PASSPHRASE_FILE" \
           --symmetric --cipher-algo AES256 --output "$1.gpg" "$1"; out="$1.gpg" ;;
  esac
  rm -f "$1"
  printf '%s' "$out"
}

STARTED=$(now_s)
STAMP=$(stamp_from_epoch "$STARTED")
WORK="$WORK_ROOT/$STAMP"
umask 077
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT
REMOTE_DIR="$BACKUP_S3_PREFIX/$STAMP"
log "start stamp=$STAMP encryption=$ENCRYPTION destination=s3://$BACKUP_S3_BUCKET/$REMOTE_DIR/"

t=$(now_s)
pg_dump --format=custom --compress=6 --no-owner --no-acl --file "$WORK/postgres.dump" "$DATABASE_URL"
DUMP_BYTES=$(wc -c < "$WORK/postgres.dump" | tr -d ' ')
log "step=pg_dump seconds=$(( $(now_s) - t )) bytes=$DUMP_BYTES"

FILES="postgres.dump"
if [ -n "${UPLOADS_DIR:-}" ]; then
  [ -d "$UPLOADS_DIR" ] || die "UPLOADS_DIR does not exist: $UPLOADS_DIR"
  t=$(now_s)
  tar -czf "$WORK/uploads.tar.gz" -C "$UPLOADS_DIR" .
  log "step=uploads_archive seconds=$(( $(now_s) - t )) bytes=$(wc -c < "$WORK/uploads.tar.gz" | tr -d ' ')"
  FILES="$FILES uploads.tar.gz"
fi

t=$(now_s)
MANIFEST="$WORK/manifest.txt"
{
  echo "# AssurMatch backup manifest (spec 058)"
  echo "stamp=$STAMP"
  echo "encryption=$ENCRYPTION"
  echo "pg_dump=$(pg_dump --version | head -n1)"
} > "$MANIFEST"
ENCRYPTED=""
for name in $FILES; do
  enc=$(encrypt "$WORK/$name")
  base=$(basename "$enc")
  echo "file=$base sha256=$(sha256_of "$enc") bytes=$(wc -c < "$enc" | tr -d ' ')" >> "$MANIFEST"
  ENCRYPTED="$ENCRYPTED $base"
done
log "step=encrypt seconds=$(( $(now_s) - t ))"

t=$(now_s)
for base in $ENCRYPTED; do
  s3_put "$WORK/$base" "$REMOTE_DIR/$base"
done
# The manifest goes last: its presence marks a complete backup.
s3_put "$MANIFEST" "$REMOTE_DIR/manifest.txt"
log "step=upload seconds=$(( $(now_s) - t ))"

t=$(now_s)
CUTOFF=$(stamp_from_epoch $(( STARTED - RETENTION_DAYS * 86400 )))
DELETED=0
for key in $(s3_list "$BACKUP_S3_PREFIX/"); do
  dir_stamp=$(printf '%s' "${key#"$BACKUP_S3_PREFIX"/}" | cut -d/ -f1)
  case "$dir_stamp" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
    *) continue ;;
  esac
  if [ "$dir_stamp" \< "$CUTOFF" ]; then
    s3_delete "$key"
    DELETED=$((DELETED + 1))
  fi
done
log "step=retention seconds=$(( $(now_s) - t )) days=$RETENTION_DAYS deleted_objects=$DELETED"

TOTAL=$(( $(now_s) - STARTED ))
log "done stamp=$STAMP total_seconds=$TOTAL"

if [ -n "${BACKUP_PUSH_URL:-}" ]; then
  curl --silent --show-error --fail --max-time 10 "${BACKUP_PUSH_URL}?status=up&msg=backup-${STAMP}&ping=${TOTAL}" >/dev/null ||
    log "WARN: monitoring push failed"
fi
