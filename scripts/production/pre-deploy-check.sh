#!/usr/bin/env sh
# AssurMatch PRODUCTION deploy guard (spec 057). Runs on the production host before any pull/swap.
# Refuses when a per-app env file is missing, readable by others, incomplete, still holding
# placeholders, carrying a secret where it must not, or enabling something forbidden in production.
# Prints variable NAMES only, never values.
set -eu

ENV_DIR="${ASSURMATCH_ENV_DIR:-/home/deployer/apps/assurmatch/env}"
FAIL=0

fail() { echo "[pre-deploy] $*" >&2; FAIL=1; }

value_of() { # file var
  grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | sed -E "s/^$2=//" | tr -d '\r' | sed -E 's/^"(.*)"$/\1/'
}

check_file() { # file
  if [ ! -f "$1" ]; then fail "missing env file: $1"; return 1; fi
  perm=$(stat -c %a "$1" 2>/dev/null || stat -f %A "$1" 2>/dev/null || echo "")
  case "$perm" in
    600|400|640|440) ;;
    *) fail "$1 has mode '$perm'; must be 0600 (0640 if the docker group reads it)" ;;
  esac
  return 0
}

require() { # file vars...
  file=$1; shift
  for var in "$@"; do
    v=$(value_of "$file" "$var")
    case "$v" in
      ""|REDACTED|*"<domain>"*|*"<s3-endpoint>"*) fail "$(basename "$file"): $var is missing, REDACTED or a placeholder" ;;
    esac
  done
}

forbid_present() { # file vars...
  file=$1; shift
  for var in "$@"; do
    if grep -qE "^${var}=" "$file" 2>/dev/null; then fail "$(basename "$file"): $var must not be set in production"; fi
  done
}

min_length() { # file var length
  v=$(value_of "$1" "$2")
  if [ -n "$v" ] && [ "$v" != "REDACTED" ] && [ "${#v}" -lt "$3" ]; then fail "$(basename "$1"): $2 shorter than $3 characters"; fi
}

API="$ENV_DIR/api.env"
WORKER="$ENV_DIR/worker.env"

for f in "$API" "$WORKER" "$ENV_DIR/public.env" "$ENV_DIR/admin.env" "$ENV_DIR/broker.env"; do
  check_file "$f" || true
done

for f in "$API" "$WORKER"; do
  [ -f "$f" ] || continue
  require "$f" NODE_ENV APP_ENV DATABASE_URL REDIS_URL ASSURMATCH_AUTH_TOKEN_SECRET ENCRYPTION_KEY APP_BASE_URL PUBLIC_APP_URL BROKER_APP_URL EMAIL_SERVICE_TYPE
  min_length "$f" ASSURMATCH_AUTH_TOKEN_SECRET 32
  min_length "$f" ENCRYPTION_KEY 32
  [ "$(value_of "$f" APP_ENV)" = "production" ] || fail "$(basename "$f"): APP_ENV must be production"
  forbid_present "$f" LOCAL_BOOTSTRAP_ADMIN_EMAIL LOCAL_BOOTSTRAP_ADMIN_PASSWORD ASSURMATCH_ALLOW_TEST_AUTH_HEADERS
  for mem in ASSURMATCH_PRISMA_MEMORY ASSURMATCH_REDIS_MEMORY ASSURMATCH_QUEUE_MEMORY ASSURMATCH_AUDIT_MEMORY; do
    if [ "$(value_of "$f" "$mem")" = "true" ]; then fail "$(basename "$f"): $mem=true is test-only"; fi
  done
  case "$(value_of "$f" EMAIL_SERVICE_TYPE)" in
    mailpit) fail "$(basename "$f"): EMAIL_SERVICE_TYPE=mailpit is forbidden in production" ;;
    smtp) require "$f" EMAIL_FROM EMAIL_SMTP_HOST EMAIL_SMTP_PORT EMAIL_SMTP_USER EMAIL_SMTP_PASS ;;
  esac
  if [ "$(value_of "$f" EMAIL_PREVIEW_MODE)" = "true" ]; then
    echo "[pre-deploy] $(basename "$f"): EMAIL_PREVIEW_MODE=true - e-mails are recorded, not sent."
  fi
done

if [ -f "$API" ]; then
  require "$API" CORS_ORIGINS
  if [ "$(value_of "$API" CORS_ORIGINS)" = "*" ]; then fail "api.env: CORS_ORIGINS must be an explicit allowlist"; fi
  if [ "$(value_of "$API" ASSURMATCH_DOCUMENT_STORAGE)" = "s3" ]; then
    require "$API" ASSURMATCH_S3_ENDPOINT ASSURMATCH_S3_BUCKET ASSURMATCH_S3_REGION ASSURMATCH_S3_ACCESS_KEY_ID ASSURMATCH_S3_SECRET_ACCESS_KEY
  else
    echo "[pre-deploy] api.env: ASSURMATCH_DOCUMENT_STORAGE is not s3 - keep every upload feature disabled."
  fi
  [ "$(value_of "$API" ASSURMATCH_ANTIVIRUS)" = "clamav" ] || echo "[pre-deploy] api.env: ASSURMATCH_ANTIVIRUS is not clamav - keep every upload feature disabled."
fi

# Frontends get public values only: no secret, no database.
for app in public admin broker; do
  f="$ENV_DIR/$app.env"
  [ -f "$f" ] || continue
  forbid_present "$f" DATABASE_URL REDIS_URL ASSURMATCH_AUTH_TOKEN_SECRET ENCRYPTION_KEY EMAIL_SMTP_PASS ASSURMATCH_S3_SECRET_ACCESS_KEY ANTHROPIC_API_KEY LOCAL_BOOTSTRAP_ADMIN_PASSWORD
  if [ "$app" != "public" ]; then
    [ "$(value_of "$f" APP_ENV)" = "production" ] || fail "$app.env: APP_ENV must be production"
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "[pre-deploy] REFUSED" >&2
  exit 1
fi
echo "[pre-deploy] OK"
