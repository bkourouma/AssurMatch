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
2. Reverse proxy (Nginx/Caddy/Traefik) configured for `assurmatch.net`, `backoffice.assurmatch.net`, `api.assurmatch.net`.
3. GitHub secrets provisioned: `GHCR_TOKEN`, `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS`, `DEPLOY_NETWORK_NAME` (optional).
4. Directory layout created on VPS:

```bash
sudo -u deployer mkdir -p /home/deployer/apps/assurmatch/{data,uploads,imports,backups,env-history}
sudo -u deployer touch /home/deployer/apps/assurmatch/.env.production
sudo chmod 0600 /home/deployer/apps/assurmatch/.env.production
sudo chown deployer:deployer /home/deployer/apps/assurmatch/.env.production
```

5. Fill `.env.production` from the variable matrix; never commit.

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
curl -X PATCH https://api.assurmatch.net/admin/feature-flags/<flag-id-country-public-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "country CI go-no-go signed by compliance 2026-05-04"}'

curl -X PATCH https://api.assurmatch.net/admin/feature-flags/<flag-id-product-public-auto-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "product auto/CI activation 2026-05-04"}'
```

Verify:

```bash
curl https://api.assurmatch.net/countries
curl https://api.assurmatch.net/countries/CI/products
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

## H. Open follow-ups

- Provision DNS records for the three domains.
- Confirm the reverse proxy config and CSP precise rules.
- Confirm SMTP decision (Mailpit for preprod or off entirely).
- Confirm offsite backup location (rsync, rclone target).
