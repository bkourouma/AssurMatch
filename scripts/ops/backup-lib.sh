#!/usr/bin/env sh
# Shared helpers of backup-offsite.sh / restore-offsite.sh (spec 058 FR-005). Sourced, not run.
#
# S3-compatible storage is reached with `curl --aws-sigv4` (curl >= 7.75): no AWS CLI, no rclone.
# Credentials are passed to curl through a config on stdin, never on the command line (`ps`).
# Path-style URLs: $BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET/<key>.

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${BACKUP_LOG_TAG:-backup}" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "missing command: $cmd"
  done
}

require_s3_env() {
  : "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required (e.g. https://s3.fr-par.scw.cloud)}"
  : "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
  : "${BACKUP_S3_REGION:?BACKUP_S3_REGION is required}"
  : "${BACKUP_S3_ACCESS_KEY_ID:?BACKUP_S3_ACCESS_KEY_ID is required}"
  : "${BACKUP_S3_SECRET_ACCESS_KEY:?BACKUP_S3_SECRET_ACCESS_KEY is required}"
  BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-assurmatch/production}"
  BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT%/}"
}

# s3_curl <curl args...>: signed request; the access key pair goes through stdin.
s3_curl() {
  printf 'user = "%s:%s"\n' "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" |
    curl --config - --silent --show-error --fail --retry 3 --retry-delay 5 \
      --aws-sigv4 "aws:amz:${BACKUP_S3_REGION}:s3" "$@"
}

s3_put() { # s3_put <local file> <key>
  s3_curl --upload-file "$1" -H "content-type: application/octet-stream" "${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/$2" >/dev/null
}

s3_get() { # s3_get <key> <local file>
  s3_curl --output "$2" "${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/$1"
}

s3_delete() { # s3_delete <key>
  s3_curl -X DELETE "${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/$1" >/dev/null
}

# s3_list <prefix>: one key per line (ListObjectsV2, first 1000 keys; enough for 3 objects/day
# over 300 days). Warns when the listing is truncated.
s3_list() {
  _xml=$(s3_curl "${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}?list-type=2&prefix=$1") || return 1
  case "$_xml" in *"<IsTruncated>true</IsTruncated>"*) log "WARN: listing truncated at 1000 keys" ;; esac
  printf '%s' "$_xml" | tr '<' '\n' | sed -n 's/^Key>//p'
}

sha256_of() {
  sha256sum "$1" | cut -d' ' -f1
}

now_s() {
  date -u +%s
}

# Stamp of the backup directories: sortable as text.
stamp_from_epoch() {
  date -u -d "@$1" +%Y%m%dT%H%M%SZ
}
