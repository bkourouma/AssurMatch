# Quickstart: Preproduction Launch Readiness

This document is a planning artifact. The actual scripts and runbooks land during /speckit.implement.

## A. Local repro of the preprod stack

```powershell
docker compose -f docker-compose.preproduction.yml up -d
# Brings up: postgres, redis, optional mailpit
```

Set local env (`.env.preproduction.example` copied to `.env.preproduction`, values filled locally and never committed):

```
NODE_ENV=production
APP_ENV=preproduction
PORT=3600
DATABASE_URL=postgresql://assurmatch:assurmatch@localhost:5432/assurmatch_preproduction
REDIS_URL=redis://localhost:6379
JWT_SECRET=<openssl rand -base64 48>
SESSION_SECRET=<openssl rand -base64 48>
PUBLIC_APP_URL=http://localhost:3601
BACKOFFICE_APP_URL=http://localhost:3602
API_BASE_URL=http://localhost:3600
CORS_ORIGINS=http://localhost:3601,http://localhost:3602
LOCAL_STORAGE_ROOT=./tmp/uploads
LOG_LEVEL=info
RATE_LIMIT_GLOBAL_PER_MIN=600

# Email (preview by default in preprod; real password lives only on the VPS)
EMAIL_SERVICE_TYPE=smtp
EMAIL_FROM=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_PASS=REDACTED
EMAIL_DELIVERY_MODE=preview
EMAIL_TEST_RECIPIENT=

# Backups (used on the VPS; locally optional)
BACKUP_PASSPHRASE=
```

```powershell
npm run prisma:migrate          # or npx prisma migrate deploy
npm run seed:reference          # seeds country/product/regulatory/flags
npm run dev:backend             # boots the API on 3600
npm run dev:public              # boots Next public on 3601
npm run dev:backoffice          # boots Next admin+broker on 3602
```

Smoke checks:

```powershell
curl http://localhost:3600/admin/system/health
curl http://localhost:3600/countries
```

## B. First deploy on VPS

Prerequisites:

1. SSH access as `deployer@<vps>`.
2. **Nginx** configured with three `server` blocks (templates in `docs/preproduction/nginx.md` — written during /speckit.implement) for:
   - `assurmatch.allianceconsultants.net` → `127.0.0.1:3601`
   - `backoffice-assurmatch.allianceconsultants.net` → `127.0.0.1:3602`
   - `api-assurmatch.allianceconsultants.net` → `127.0.0.1:3600`
3. Three DNS A/AAAA records pointing the sub-domains to the VPS.
4. Three Let's Encrypt certificates issued (or one wildcard for `*.allianceconsultants.net`).
5. GitHub secrets provisioned: `GHCR_TOKEN`, `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS`, `DEPLOY_NETWORK_NAME` (optional).
6. Gmail account `rotaryabidjan2plateaux@gmail.com` has 2FA enabled and a 16-char **app password** generated; that value goes into `EMAIL_SMTP_PASS` on the VPS only.
7. Directory layout created on VPS:

```bash
sudo -u deployer mkdir -p /home/deployer/apps/assurmatch/{data,uploads,imports,backups,env-history}
sudo -u deployer touch /home/deployer/apps/assurmatch/.env.production
sudo chmod 0600 /home/deployer/apps/assurmatch/.env.production
sudo chown deployer:deployer /home/deployer/apps/assurmatch/.env.production
```

8. Fill `.env.production` from the variable matrix; never commit. Production-side values include the real Gmail app password and the `BACKUP_PASSPHRASE`.

Deploy:

```bash
git push origin main          # triggers .github/workflows/ci.yml
```

The pipeline runs verify, builds the image, pushes to GHCR, SSHs to the VPS, pulls, swaps the container, polls health.

After first deploy:

```bash
ssh deployer@<vps>
cd /home/deployer/apps/assurmatch
docker exec assurmatch-app npx prisma migrate deploy --schema /app/backend/prisma/schema.prisma
docker exec assurmatch-app node --import tsx /app/scripts/preprod/seed-reference.ts
```

## C. Operational import (real partners/licenses/offers)

On the VPS:

```bash
mkdir -p /home/deployer/apps/assurmatch/imports/2026-04-27-001
# operator places the signed bundle (manifest.json + per-entity JSON + documents/)
cd /home/deployer/apps/assurmatch
docker exec assurmatch-app node --import tsx /app/scripts/preprod/import-partners.ts \
  --batch /app/imports/2026-04-27-001 --dry-run
# review the report
docker exec assurmatch-app node --import tsx /app/scripts/preprod/import-partners.ts \
  --batch /app/imports/2026-04-27-001 --mode insert
```

Audit appears in `/admin/audit-logs` with correlationId = batch id.

## D. Activate a country and a product (per-scope go)

Run the per-scope go/no-go checklist (`checklists/go-no-go.md`). Then:

```bash
# Acting as a Super Admin actor with valid MFA
curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id-country-public-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "country CI go-no-go signed by compliance 2026-05-04"}'

curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id-product-public-auto-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "product auto/CI activation 2026-05-04"}'
```

Verify:

```bash
curl https://api-assurmatch.allianceconsultants.net/countries
curl https://api-assurmatch.allianceconsultants.net/countries/CI/products
```

## E. Smoke checks on a deployed environment

Manual list:

- `GET /admin/system/health` (admin token) returns ok.
- `GET /countries` returns activated countries only.
- `GET /countries/<code>/products` returns activated products for that country.
- `POST /quote-requests` consented succeeds; verifies `Prospect`, `ConsentRecord`, `QuoteRequest`, `LeadAssignment` (if eligible), `AuditLog`.
- `POST /quote-requests` without consent is refused.
- `GET /broker/dashboard` denied without `broker_dashboard_enabled=true`; allowed once enabled.
- `GET /broker/crm/leads` denied without `broker_crm_enabled=true` or wrong plan.
- `GET /admin/dashboard` accessible to allowed admin roles, audited.
- Cross-tenant attempts via forged params are denied.
- License-expired partner is excluded from routing.

## F. Backups

On the VPS:

```bash
crontab -u deployer -e
# 0 2 * * * /home/deployer/apps/assurmatch/scripts/backup-postgres.sh
# 30 2 * * * /home/deployer/apps/assurmatch/scripts/backup-uploads.sh
# 0 4 * * 0 /home/deployer/apps/assurmatch/scripts/restore-test.sh
```

Restore-test (mandatory before global go) is documented in `docs/runbooks/backup-restore.md`.

## G. Rollback

The pipeline does it automatically when health fails. Manual rollback runbook in `docs/runbooks/rollback.md`.

## H. Switch email from preview to send (operator opt-in)

When emails have been validated in preview mode and compliance allows:

```bash
ssh deployer@<vps>
# Edit /home/deployer/apps/assurmatch/.env.production
# EMAIL_DELIVERY_MODE=send
docker restart assurmatch-app
docker logs --tail 50 assurmatch-app | grep -i email
```

A single test email to a controlled inbox is recommended before broadcasting to broker contacts.

## I. Set up Uptime Kuma monitors

In the Uptime Kuma admin UI on the VPS, configure:

- AssurMatch API health — keyword `"ok"` on `https://api-assurmatch.allianceconsultants.net/admin/system/health`.
- AssurMatch public — HTTP 200 on `https://assurmatch.allianceconsultants.net`.
- AssurMatch back-office — HTTP 200/401 on `https://backoffice-assurmatch.allianceconsultants.net`.
- PostgreSQL TCP probe `127.0.0.1:5432`.
- Redis TCP probe `127.0.0.1:6379`.

Notification channel: operator email.

## J. Open follow-ups

- Wildcard cert vs three single-host certs decision.
- Whether to install Mailpit on the VPS for preview-mode email inspection.
- Offsite backup target (deferred).
- Switch to a transactional ESP for production (separate spec).
