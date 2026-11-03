#!/usr/bin/env sh
# AssurMatch PREPRODUCTION — one-time host preparation on the Alliance VPS (run as deployer):
#
#   sh scripts/preprod/bootstrap-env.sh
#
# Creates /home/deployer/apps/assurmatch-preprod/{env,backups} and writes the per-app env files read
# by docker-compose.preprod-vps.yml, with secrets generated ON the host (openssl). An existing file is
# never overwritten: delete it first to regenerate (a new ENCRYPTION_KEY / PII key makes the data
# encrypted with the old one unreadable - back the env directory up before touching it).
# Prints file names only, never values.
set -eu

DEPLOY_DIR="${ASSURMATCH_PREPROD_DIR:-/home/deployer/apps/assurmatch-preprod}"
ENV_DIR="${ASSURMATCH_ENV_DIR:-$DEPLOY_DIR/env}"
DOMAIN="${ASSURMATCH_PREPROD_DOMAIN:-allianceconsultants.net}"
PUBLIC_URL="https://assurmatch.$DOMAIN"
ADMIN_URL="https://backoffice-assurmatch.$DOMAIN"
BROKER_URL="https://pro-assurmatch.$DOMAIN"
API_URL="https://api-assurmatch.$DOMAIN"

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }

umask 077
mkdir -p "$ENV_DIR" "$DEPLOY_DIR/backups"
chmod 700 "$ENV_DIR" "$DEPLOY_DIR/backups"

hex() { openssl rand -hex "$1"; }
b64() { openssl rand -base64 "$1" | tr -d '\n'; }

write_if_absent() { # file (content on stdin)
  if [ -e "$1" ]; then
    echo "kept     $1"
    cat >/dev/null
  else
    cat > "$1"
    chmod 600 "$1"
    echo "written  $1"
  fi
}

# Shared by the API and the worker: generated once, reused from api.env when it already exists.
value_of() { grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | sed -E "s/^$2=//"; }
if [ -f "$ENV_DIR/api.env" ]; then
  DATABASE_URL=$(value_of "$ENV_DIR/api.env" DATABASE_URL)
  AUTH_SECRET=$(value_of "$ENV_DIR/api.env" ASSURMATCH_AUTH_TOKEN_SECRET)
  ENCRYPTION_KEY=$(value_of "$ENV_DIR/api.env" ENCRYPTION_KEY)
  PII_KEYS=$(value_of "$ENV_DIR/api.env" PII_ENCRYPTION_KEYS)
  PII_ACTIVE=$(value_of "$ENV_DIR/api.env" PII_ENCRYPTION_ACTIVE_KEY_ID)
  PII_BLIND=$(value_of "$ENV_DIR/api.env" PII_BLIND_INDEX_KEY)
  AUDIT_KEYS=$(value_of "$ENV_DIR/api.env" AUDIT_INTEGRITY_KEYS)
  AUDIT_ACTIVE=$(value_of "$ENV_DIR/api.env" AUDIT_INTEGRITY_ACTIVE_KEY_ID)
else
  if [ -f "$ENV_DIR/postgres.env" ]; then
    PG_PASSWORD=$(value_of "$ENV_DIR/postgres.env" POSTGRES_PASSWORD)
  else
    PG_PASSWORD=$(hex 24)
  fi
  DATABASE_URL="postgresql://assurmatch:$PG_PASSWORD@postgres:5432/assurmatch_preproduction"
  AUTH_SECRET=$(hex 32)
  ENCRYPTION_KEY=$(hex 32)
  PII_KEYS="k1:$(b64 32)"
  PII_ACTIVE=k1
  PII_BLIND=$(b64 32)
  AUDIT_KEYS="a1:$(b64 32)"
  AUDIT_ACTIVE=a1
fi
PG_PASSWORD=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')

write_if_absent "$ENV_DIR/postgres.env" <<EOF
POSTGRES_DB=assurmatch_preproduction
POSTGRES_USER=assurmatch
POSTGRES_PASSWORD=$PG_PASSWORD
EOF

# Common runtime block of the API and the worker.
runtime_block() {
  cat <<EOF
NODE_ENV=production
APP_ENV=preproduction
DATABASE_URL=$DATABASE_URL
REDIS_URL=redis://redis:6379
ASSURMATCH_AUTH_TOKEN_SECRET=$AUTH_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
PII_ENCRYPTION_KEYS=$PII_KEYS
PII_ENCRYPTION_ACTIVE_KEY_ID=$PII_ACTIVE
PII_BLIND_INDEX_KEY=$PII_BLIND
AUDIT_INTEGRITY_KEYS=$AUDIT_KEYS
AUDIT_INTEGRITY_ACTIVE_KEY_ID=$AUDIT_ACTIVE
ASSURMATCH_AUDIT_OUTBOX_MAX=2000
APP_BASE_URL=$ADMIN_URL
PUBLIC_APP_URL=$PUBLIC_URL
BROKER_APP_URL=$BROKER_URL
# Preproduction e-mails are captured by Mailpit and never delivered (SSH tunnel to read them).
EMAIL_SERVICE_TYPE=mailpit
EMAIL_FROM=no-reply@assurmatch.$DOMAIN
EMAIL_REPLY_TO=support@assurmatch.$DOMAIN
EMAIL_SMTP_HOST=mailpit
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_SEND_TIMEOUT_MS=5000
EMAIL_PREVIEW_MODE=false
LOG_LEVEL=info
EOF
}

{
  runtime_block
  cat <<EOF
PORT=3600
BULLMQ_PREFIX=assurmatch-preprod
AUTH_JWT_TTL_MINUTES=15
AUTH_ACTION_TOKEN_TTL_MINUTES=30
AUTH_LOCKOUT_THRESHOLD=5
AUTH_LOCKOUT_WINDOW_MINUTES=15
AUTH_LOCKOUT_COOLDOWN_MINUTES=30
ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS=30
ASSURMATCH_VISIT_COUNTER_ENABLED=true
ASSURMATCH_VISIT_COUNTER_MAX_PER_MINUTE=600
CORS_ORIGINS=$PUBLIC_URL
TRUSTED_PROXY_HOPS=1
ASSURMATCH_AI_PROVIDER=template
ASSURMATCH_VISITOR_TOKEN_TTL_DAYS=30
ASSURMATCH_AUTH_RATE_LIMIT_WINDOW_SECONDS=900
ASSURMATCH_AUTH_RATE_LIMIT_IP_MAX=100
ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX=10
ASSURMATCH_INVOICE_CI_VAT_RATE=18
ASSURMATCH_INVOICE_SN_VAT_RATE=18
ASSURMATCH_INVOICE_PAYMENT_TERM_DAYS=30
SENTRY_ENVIRONMENT=preproduction
# Documented launch defaults (feature flags themselves live in the database, changed from the admin).
PUBLIC_COMPARATOR_ENABLED=false
QUOTE_REQUEST_ENABLED=false
WHATSAPP_ENABLED=false
PAYMENTS_ENABLED=false
E_SIGNATURE_ENABLED=false
POLICY_ISSUANCE_ENABLED=false
CLAIMS_ENABLED=false
INSURER_API_ENABLED=false
EOF
} | write_if_absent "$ENV_DIR/api.env"

{
  runtime_block
  cat <<EOF
ASSURMATCH_WORKER_INTERVAL_SECONDS=30
ASSURMATCH_WORKER_SHUTDOWN_TIMEOUT_SECONDS=25
ASSURMATCH_WORKER_HEARTBEAT_FILE=/tmp/assurmatch-worker.heartbeat
ASSURMATCH_WORKER_HEARTBEAT_MAX_AGE_SECONDS=150
ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT=25
ASSURMATCH_SATISFACTION_SURVEY_DELIVERY_LIMIT=50
ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_LIMIT=25
ASSURMATCH_DOCUMENT_REMINDERS_ENABLED=true
ASSURMATCH_DOCUMENT_REMINDER_DAYS=3
ASSURMATCH_DOCUMENT_REMINDER_INTERVAL_MINUTES=60
ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=false
ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED=false
ASSURMATCH_CRM_CONNECTOR_DELIVERY_LIMIT=25
ASSURMATCH_CHANNEL_OUTBOX_LIMIT=25
EOF
} | write_if_absent "$ENV_DIR/worker.env"

# Frontends: public values only (NEXT_PUBLIC_* are compiled into the images; kept here for reference).
write_if_absent "$ENV_DIR/public.env" <<EOF
NODE_ENV=production
NEXT_PUBLIC_ASSURMATCH_API_URL=$API_URL
NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL=$PUBLIC_URL
NEXT_PUBLIC_ASSURMATCH_BROKER_URL=$BROKER_URL
EOF

write_if_absent "$ENV_DIR/admin.env" <<EOF
NODE_ENV=production
APP_ENV=preproduction
NEXT_PUBLIC_ASSURMATCH_API_URL=$API_URL
NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL=$API_URL
EOF

write_if_absent "$ENV_DIR/broker.env" <<EOF
NODE_ENV=production
APP_ENV=preproduction
NEXT_PUBLIC_ASSURMATCH_API_URL=$API_URL
NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL=$API_URL
EOF

echo "env directory: $ENV_DIR (keep a copy of it in the secret store: losing ENCRYPTION_KEY or the PII keys makes data unreadable)"
