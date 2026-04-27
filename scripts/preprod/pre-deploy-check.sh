#!/usr/bin/env sh
# AssurMatch preprod / production deploy guard.
# Refuses to continue when the env file is missing, weakly permissioned,
# or lacks a mandatory variable. Designed to run on the VPS just before docker pull/run.

set -eu

ENV_FILE="${DEPLOY_ENV_FILE:-/home/deployer/apps/assurmatch/.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[pre-deploy] Missing env file: $ENV_FILE" >&2
  exit 1
fi

# File MUST be 0600 (or stricter)
PERM=$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %A "$ENV_FILE" 2>/dev/null || echo "")
case "$PERM" in
  600|400) ;;
  *) echo "[pre-deploy] Env file $ENV_FILE has perm '$PERM'; must be 0600" >&2; exit 1 ;;
esac

# Mandatory variables
MANDATORY="DATABASE_URL REDIS_URL JWT_SECRET SESSION_SECRET PUBLIC_APP_URL BACKOFFICE_APP_URL API_BASE_URL CORS_ORIGINS LOCAL_STORAGE_ROOT"
MISSING=""
for var in $MANDATORY; do
  value=$(grep -E "^${var}=" "$ENV_FILE" | tail -n1 | sed -E "s/^${var}=//" | tr -d '\r')
  if [ -z "$value" ] || [ "$value" = "REDACTED" ]; then
    MISSING="$MISSING $var"
  fi
done
if [ -n "$MISSING" ]; then
  echo "[pre-deploy] Missing or REDACTED mandatory env vars:$MISSING" >&2
  exit 1
fi

# DATABASE_URL must not look like a production-ish target if APP_ENV is preproduction
APP_ENV_VALUE=$(grep -E '^APP_ENV=' "$ENV_FILE" | tail -n1 | sed -E 's/^APP_ENV=//' | tr -d '\r')
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | sed -E 's/^DATABASE_URL=//' | tr -d '\r')
if [ "$APP_ENV_VALUE" = "preproduction" ]; then
  case "$DB_URL" in
    *prod*|*production*|*live*) echo "[pre-deploy] preproduction APP_ENV with production-like DATABASE_URL" >&2; exit 1 ;;
  esac
fi

# Sensitive flags must remain false in env file (defense in depth; the runtime validates too)
for flag in PAYMENTS_ENABLED E_SIGNATURE_ENABLED POLICY_ISSUANCE_ENABLED CLAIMS_ENABLED INSURER_API_ENABLED; do
  value=$(grep -E "^${flag}=" "$ENV_FILE" | tail -n1 | sed -E "s/^${flag}=//" | tr -d '\r')
  if [ "$value" = "true" ]; then
    echo "[pre-deploy] Forbidden module enabled in env: $flag" >&2
    exit 1
  fi
done

echo "[pre-deploy] OK"
