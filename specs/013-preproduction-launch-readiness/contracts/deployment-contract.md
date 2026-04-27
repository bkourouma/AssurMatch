# Contract: Deployment, CI/CD, and Runtime

## 0. Decisions (confirmed)

- **Topology**: B (three containers).
- **Reverse proxy**: Nginx (terminates HTTPS, sub-domain routing).
- **Domains**:
  - `assurmatch.allianceconsultants.net` → public (3601).
  - `backoffice-assurmatch.allianceconsultants.net` → back-office (3602).
  - `api-assurmatch.allianceconsultants.net` → API (3600).
- **Email**: Gmail SMTP (`smtp.gmail.com:587`); preprod default `EMAIL_DELIVERY_MODE=preview`.
- **Monitoring**: Uptime Kuma initial.
- **Backups**: local 14 days.
- **Import signature**: deferred (procedural controls suffice for 013).

## 1. Repository assets to add (no implementation in this spec invocation)

```
.github/workflows/ci.yml
backend/Dockerfile                   # API image
apps/public/Dockerfile               # public Next image
apps/admin/Dockerfile                # back-office Next image (packages both apps/admin and apps/broker)
.dockerignore                        # extend the existing one
.env.preproduction.example
scripts/preprod/pre-deploy-check.sh
scripts/preprod/seed-reference.ts
scripts/preprod/import-partners.ts
scripts/preprod/seeds/reference/*.json
docs/preproduction/architecture.md
docs/preproduction/environments.md
docs/preproduction/domains.md
docs/preproduction/nginx.md
docs/runbooks/*.md
```

## 2. CI workflow contract

`.github/workflows/ci.yml` shape (npm, not pnpm):

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx prisma generate --schema backend/prisma/schema.prisma
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build
      - name: Prisma validate
        env:
          DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
        run: npx prisma validate --schema backend/prisma/schema.prisma
      - run: npm audit --audit-level=high
      - run: npx playwright install --with-deps chromium
      - run: npm run test:web

  build-and-deploy:
    needs: verify
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}
      - name: Build and push image (API)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: backend/Dockerfile
          push: true
          tags: |
            ghcr.io/bkourouma/assurmatch:latest
            ghcr.io/bkourouma/assurmatch:sha-${{ github.sha }}
      - name: Build and push image (public)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/public/Dockerfile
          push: true
          tags: |
            ghcr.io/bkourouma/assurmatch-public:latest
            ghcr.io/bkourouma/assurmatch-public:sha-${{ github.sha }}
      - name: Build and push image (back-office)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/admin/Dockerfile
          push: true
          tags: |
            ghcr.io/bkourouma/assurmatch-backoffice:latest
            ghcr.io/bkourouma/assurmatch-backoffice:sha-${{ github.sha }}
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_SSH_USER }}
          key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}
          script_stop: true
          script: |
            set -euo pipefail
            cd /home/deployer/apps/assurmatch
            ./scripts/pre-deploy-check.sh

            SHA=sha-${{ github.sha }}
            NETWORK_FLAG=""
            if [ -n "${{ secrets.DEPLOY_NETWORK_NAME }}" ]; then
              NETWORK_FLAG="--network ${{ secrets.DEPLOY_NETWORK_NAME }}"
            fi

            docker pull ghcr.io/bkourouma/assurmatch:$SHA
            docker pull ghcr.io/bkourouma/assurmatch-public:$SHA
            docker pull ghcr.io/bkourouma/assurmatch-backoffice:$SHA

            # API
            docker stop assurmatch-app || true
            docker rm assurmatch-app || true
            docker run -d \
              --name assurmatch-app \
              --restart unless-stopped \
              --env-file /home/deployer/apps/assurmatch/.env.production \
              -p 127.0.0.1:3600:3600 \
              -v /home/deployer/apps/assurmatch/uploads:/app/uploads \
              -v /home/deployer/apps/assurmatch/data:/app/data \
              $NETWORK_FLAG \
              ghcr.io/bkourouma/assurmatch:$SHA

            # Public Next
            docker stop assurmatch-public || true
            docker rm assurmatch-public || true
            docker run -d \
              --name assurmatch-public \
              --restart unless-stopped \
              --env-file /home/deployer/apps/assurmatch/.env.production \
              -p 127.0.0.1:3601:3601 \
              $NETWORK_FLAG \
              ghcr.io/bkourouma/assurmatch-public:$SHA

            # Back-office Next
            docker stop assurmatch-backoffice || true
            docker rm assurmatch-backoffice || true
            docker run -d \
              --name assurmatch-backoffice \
              --restart unless-stopped \
              --env-file /home/deployer/apps/assurmatch/.env.production \
              -p 127.0.0.1:3602:3602 \
              $NETWORK_FLAG \
              ghcr.io/bkourouma/assurmatch-backoffice:$SHA

            # Health probes (10 attempts each, 3 s back-off)
            for surface in "127.0.0.1:3600/admin/system/health" "127.0.0.1:3601" "127.0.0.1:3602"; do
              ok=0
              for i in 1 2 3 4 5 6 7 8 9 10; do
                if curl -fsS "http://${surface}" > /dev/null; then ok=1; break; fi
                sleep 3
              done
              if [ "$ok" -ne 1 ]; then
                echo "Health check failed for $surface"
                exit 1
              fi
            done

            docker image prune -f
```

This is the *shape*. Final implementation must:

- adapt to the chosen topology (A or B),
- inject the precise `--network` value or omit it,
- validate the actor `${{ github.actor }}` is permitted to push to GHCR,
- include rollback-on-failure (auto-redeploy previous SHA) — see runbook.

## 3. Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `GHCR_TOKEN` | PAT with `write:packages` for `ghcr.io/bkourouma/*` |
| `VPS_HOST` | DNS or IP of the VPS |
| `VPS_SSH_USER` | typically `deployer` |
| `VPS_SSH_PRIVATE_KEY` | OpenSSH-format key without passphrase, restricted to deploy account |
| `VPS_KNOWN_HOSTS` | the VPS host key, used by ssh-action |
| `DEPLOY_NETWORK_NAME` | optional; omit if no shared Docker network |

## 4. Dockerfile contract (API)

`backend/Dockerfile` (multi-stage, Node 24 alpine, npm):

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY apps ./apps
COPY packages ./packages
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3600
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/backend/dist ./backend/dist
COPY --from=build --chown=app:app /app/packages ./packages
COPY --from=build --chown=app:app /app/backend/prisma ./backend/prisma
USER app
EXPOSE 3600
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3600/admin/system/health || exit 1
CMD ["node", "backend/dist/main.js"]
```

(Adjust paths if Nest emits to `dist/` rather than `backend/dist/`. Implementation team verifies during /speckit.tasks.)

`apps/public/Dockerfile` and `apps/admin/Dockerfile` follow the same multi-stage pattern but their `CMD` runs `next start -p 3601` and `next start -p 3602` respectively, with their build outputs. They share the monorepo `node_modules` for build (so `npm ci` is run once at the repo root in the deps stage) and they set `NEXT_PUBLIC_*` env vars at build time as needed.

## 5. Runtime contract

The container expects the following environment (see `plan.md` §1 for full matrix). Mandatory failure on missing values. The backend's `ConfigModule` is responsible for the validation; the deploy script is responsible for ensuring the env file is in place.

## 6. Health contract

- `GET /admin/system/health` returns 200 with body `{ status: "ok", postgres: "ok", redis: "ok"|"degraded"|"down", queues: "ok"|"degraded" }`.
- The deploy script polls this endpoint with backoff. If healthy after deploy, the script proceeds; if not, it auto-reverts to the prior image tag.

## 7. Reverse proxy contract (Nginx)

Sub-domain layout. Each `server { ... }` block forwards a sub-domain to its container port on `127.0.0.1`.

Skeleton snippets (full files land in `docs/preproduction/nginx.md` during /speckit.implement):

```nginx
# /etc/nginx/conf.d/assurmatch-public.conf
server {
    listen 80;
    server_name assurmatch.allianceconsultants.net;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name assurmatch.allianceconsultants.net;
    ssl_certificate     /etc/letsencrypt/live/assurmatch.allianceconsultants.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/assurmatch.allianceconsultants.net/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location / {
        proxy_pass http://127.0.0.1:3601;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# /etc/nginx/conf.d/assurmatch-backoffice.conf — same pattern, port 3602, X-Frame-Options DENY
# /etc/nginx/conf.d/assurmatch-api.conf      — same pattern, port 3600, no Next-specific tweaks
```

Required response headers (set in Nginx and also in the backend as defense in depth):

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (back-office) / `SAMEORIGIN` (public)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: <basic CSP per surface>` (refined in tasks)
- `Permissions-Policy: <minimal>`

Certificates: Let's Encrypt via certbot's `--nginx` plugin, one cert per sub-domain (or a wildcard for `*.allianceconsultants.net` if the DNS provider supports DNS-01).

## 8. Rollback contract

- `docker run` previous SHA tag from GHCR.
- `.env.production` is preserved.
- Volumes (`uploads`, `data`) are preserved.
- Database schema is unchanged for this plan (no new migration introduced).

## 9. Security expectations

- Image runs as non-root (`USER app`).
- No secrets baked into the image.
- `npm audit --audit-level=high` gates the verify job.
- Optional `gitleaks` scan to be added in a future step.

## 10. Topology decision

**Confirmed: Option B — three containers.**

## 11. Email contract (preprod default = preview mode)

Env vars (full values held only in `.env.production` on the VPS):

```
EMAIL_SERVICE_TYPE=smtp
EMAIL_FROM=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_PASS=REDACTED              # Gmail app password — never in Git
EMAIL_DELIVERY_MODE=preview            # preview | send
EMAIL_TEST_RECIPIENT=                  # optional override that redirects all preprod emails
```

Behavior:

- `preview`: log message metadata at `info`, store the body in Mailpit if available, do NOT call `smtp.gmail.com`.
- `send`: real delivery via Gmail SMTP. Requires explicit operator opt-in.
- If `EMAIL_TEST_RECIPIENT` is set, all delivered emails go to that single address regardless of original recipient (defense against accidental partner contact).

Gmail prerequisites:

- 2-step verification enabled on the Gmail account.
- An **app password** generated for "AssurMatch SMTP" — that 16-char value is stored in `EMAIL_SMTP_PASS`. The regular account password will not authenticate via SMTP.
- The app password can be revoked from the Google account at any time. Rotation runbook documents the steps.

## 12. Monitoring contract (Uptime Kuma)

Initial monitor list (configured in Uptime Kuma admin UI, on the same VPS):

| Monitor | Type | Target | Notes |
|---------|------|--------|-------|
| AssurMatch API health | HTTP keyword | `https://api-assurmatch.allianceconsultants.net/admin/system/health` keyword `"ok"` | Add admin Bearer header if Kuma supports it; otherwise use a public sub-endpoint |
| AssurMatch public | HTTP | `https://assurmatch.allianceconsultants.net` 200 | |
| AssurMatch back-office | HTTP | `https://backoffice-assurmatch.allianceconsultants.net` 200 or 401 | |
| PostgreSQL | TCP | `127.0.0.1:5432` | only from VPS-internal Kuma |
| Redis | TCP | `127.0.0.1:6379` | only from VPS-internal Kuma |

Notification channel(s): operator email by default. Telegram/Slack optional.

## 13. Backup contract

| Asset | Tool | Schedule (UTC) | Retention | Encryption |
|-------|------|----------------|-----------|------------|
| PostgreSQL | `pg_dump -Fc` piped to `gzip` | daily 02:00 | 14 days | `gpg --symmetric --cipher-algo AES256` if `BACKUP_PASSPHRASE` is set |
| Uploads volume | `tar -czf` | daily 02:30 | 14 days | same |

Storage path: `/home/deployer/apps/assurmatch/backups/{postgres,uploads}/<date>.{sql.gz,tar.gz}[.gpg]`.

Restore-test runbook is mandatory before global go.
