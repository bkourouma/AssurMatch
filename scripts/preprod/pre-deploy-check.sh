#!/usr/bin/env sh
# AssurMatch PREPRODUCTION deploy guard. Runs on the VPS (scripts/preprod/deploy.sh) before any
# pull/swap. Refuses when a per-app env file is missing, readable by others, incomplete, still holding
# placeholders, carrying a secret where it must not, or enabling a forbidden module.
# Prints variable NAMES only, never values. Production has its own guard (scripts/production/).
set -eu

ENV_DIR="${ASSURMATCH_ENV_DIR:-/home/deployer/apps/assurmatch-preprod/env}"
FAIL=0

fail() { echo "[pre-deploy] $*" >&2; FAIL=1; }

value_of() { # file var
  grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | sed -E "s/^$2=//" | tr -d '\r' | sed -E 's/^"(.*)"$/\1/'
}

check_file() { # file
  if [ ! -f "$1" ]; then fail "missing env file: $1"; return 1; fi
  perm=$(stat -c %a "$1" 2>/dev/null || stat -f %A "$1" 2>/dev/null || echo "")
  case "$perm" in
    600|400) ;;
    *) fail "$1 has mode '$perm'; must be 0600" ;;
  esac
  return 0
}

require() { # file vars...
  file=$1; shift
  for var in "$@"; do
    v=$(value_of "$file" "$var")
    case "$v" in
      ""|REDACTED|*"<domain>"*) fail "$(basename "$file"): $var is missing, REDACTED or a placeholder" ;;
    esac
  done
}

forbid_present() { # file vars...
  file=$1; shift
  for var in "$@"; do
    if grep -qE "^${var}=" "$file" 2>/dev/null; then fail "$(basename "$file"): $var must not be set here"; fi
  done
}

min_length() { # file var length
  v=$(value_of "$1" "$2")
  if [ -n "$v" ] && [ "$v" != "REDACTED" ] && [ "${#v}" -lt "$3" ]; then fail "$(basename "$1"): $2 shorter than $3 characters"; fi
}

API="$ENV_DIR/api.env"
WORKER="$ENV_DIR/worker.env"
POSTGRES="$ENV_DIR/postgres.env"

for f in "$API" "$WORKER" "$POSTGRES" "$ENV_DIR/public.env" "$ENV_DIR/admin.env" "$ENV_DIR/broker.env"; do
  check_file "$f" || true
done

[ -f "$POSTGRES" ] && require "$POSTGRES" POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD

for f in "$API" "$WORKER"; do
  [ -f "$f" ] || continue
  require "$f" NODE_ENV APP_ENV DATABASE_URL REDIS_URL ASSURMATCH_AUTH_TOKEN_SECRET ENCRYPTION_KEY APP_BASE_URL PUBLIC_APP_URL BROKER_APP_URL EMAIL_SERVICE_TYPE EMAIL_FROM
  require "$f" PII_ENCRYPTION_KEYS PII_ENCRYPTION_ACTIVE_KEY_ID PII_BLIND_INDEX_KEY
  min_length "$f" ASSURMATCH_AUTH_TOKEN_SECRET 32
  min_length "$f" ENCRYPTION_KEY 32
  [ "$(value_of "$f" APP_ENV)" = "preproduction" ] || fail "$(basename "$f"): APP_ENV must be preproduction"
  # A preproduction runtime must never point at a production-looking database.
  case "$(value_of "$f" DATABASE_URL)" in
    *preprod*) ;;
    *) fail "$(basename "$f"): DATABASE_URL must name a preproduction database (\"preprod\" in the URL)" ;;
  esac
  forbid_present "$f" ASSURMATCH_ALLOW_TEST_AUTH_HEADERS
  for mem in ASSURMATCH_PRISMA_MEMORY ASSURMATCH_REDIS_MEMORY ASSURMATCH_QUEUE_MEMORY ASSURMATCH_AUDIT_MEMORY; do
    if [ "$(value_of "$f" "$mem")" = "true" ]; then fail "$(basename "$f"): $mem=true is test-only"; fi
  done
  # Sensitive modules stay closed (the runtime validates too).
  for flag in PAYMENTS_ENABLED E_SIGNATURE_ENABLED POLICY_ISSUANCE_ENABLED CLAIMS_ENABLED INSURER_API_ENABLED; do
    if [ "$(value_of "$f" "$flag")" = "true" ]; then fail "$(basename "$f"): forbidden module enabled: $flag"; fi
  done
  if [ "$(value_of "$f" EMAIL_SERVICE_TYPE)" = "smtp" ]; then
    require "$f" EMAIL_SMTP_HOST EMAIL_SMTP_PORT EMAIL_SMTP_USER EMAIL_SMTP_PASS
  fi
done

if [ -f "$API" ]; then
  require "$API" CORS_ORIGINS
  if [ "$(value_of "$API" CORS_ORIGINS)" = "*" ]; then fail "api.env: CORS_ORIGINS must be an explicit allowlist"; fi
fi

# Frontends get public values only: no secret, no database.
for app in public admin broker; do
  f="$ENV_DIR/$app.env"
  [ -f "$f" ] || continue
  forbid_present "$f" DATABASE_URL REDIS_URL ASSURMATCH_AUTH_TOKEN_SECRET ENCRYPTION_KEY EMAIL_SMTP_PASS ASSURMATCH_S3_SECRET_ACCESS_KEY ANTHROPIC_API_KEY LOCAL_BOOTSTRAP_ADMIN_PASSWORD
  forbid_present "$f" PII_ENCRYPTION_KEYS PII_BLIND_INDEX_KEY AUDIT_INTEGRITY_KEYS POSTGRES_PASSWORD
done

if [ "$FAIL" -ne 0 ]; then
  echo "[pre-deploy] REFUSED" >&2
  exit 1
fi
echo "[pre-deploy] OK"
