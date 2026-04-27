# Contract: Deployment, CI/CD, and Runtime

## 1. Repository assets to add (no implementation in this spec invocation)

```
.github/workflows/ci.yml
backend/Dockerfile
apps/public/Dockerfile               # Option B only
apps/admin/Dockerfile                # Option B only (or merged with broker)
apps/broker/Dockerfile               # Option B only (or merged with admin)
.dockerignore                        # extend the existing one
.env.preproduction.example
scripts/preprod/pre-deploy-check.sh
scripts/preprod/seed-reference.ts
scripts/preprod/import-partners.ts
scripts/preprod/seeds/reference/*.json
docs/preproduction/architecture.md
docs/preproduction/environments.md
docs/preproduction/domains.md
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
      # Option B only: build and push public + back-office images
      - name: Build and push image (public)
        if: ${{ env.TOPOLOGY == 'B' }}
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/public/Dockerfile
          push: true
          tags: |
            ghcr.io/bkourouma/assurmatch-public:latest
            ghcr.io/bkourouma/assurmatch-public:sha-${{ github.sha }}
      - name: Build and push image (back-office)
        if: ${{ env.TOPOLOGY == 'B' }}
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
            cd /home/deployer/apps/assurmatch
            ./scripts/pre-deploy-check.sh
            docker pull ghcr.io/bkourouma/assurmatch:sha-${{ github.sha }}
            docker stop assurmatch-app || true
            docker rm assurmatch-app || true
            docker run -d \
              --name assurmatch-app \
              --restart unless-stopped \
              --env-file /home/deployer/apps/assurmatch/.env.production \
              -p 127.0.0.1:3600:3600 \
              -v /home/deployer/apps/assurmatch/uploads:/app/uploads \
              -v /home/deployer/apps/assurmatch/data:/app/data \
              ${{ secrets.DEPLOY_NETWORK_NAME && format('--network {0}', secrets.DEPLOY_NETWORK_NAME) || '' }} \
              ghcr.io/bkourouma/assurmatch:sha-${{ github.sha }}
            # repeat for assurmatch-public and assurmatch-backoffice when TOPOLOGY=B
            for i in 1 2 3 4 5 6 7 8 9 10; do
              if curl -fsS http://127.0.0.1:3600/admin/system/health > /dev/null; then
                echo "OK"; exit 0
              fi
              sleep 3
            done
            echo "Health check failed"; exit 1
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

For Option B, `apps/public/Dockerfile` and `apps/admin/Dockerfile` follow the same pattern but `CMD` runs `next start -p 3601` and `next start -p 3602` respectively, with their build outputs.

## 5. Runtime contract

The container expects the following environment (see `plan.md` §1 for full matrix). Mandatory failure on missing values. The backend's `ConfigModule` is responsible for the validation; the deploy script is responsible for ensuring the env file is in place.

## 6. Health contract

- `GET /admin/system/health` returns 200 with body `{ status: "ok", postgres: "ok", redis: "ok"|"degraded"|"down", queues: "ok"|"degraded" }`.
- The deploy script polls this endpoint with backoff. If healthy after deploy, the script proceeds; if not, it auto-reverts to the prior image tag.

## 7. Reverse proxy contract

Documented at `docs/preproduction/domains.md` (post-implement). Required headers:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (back-office) / `SAMEORIGIN` (public if needed)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: <basic CSP per surface>` (refined in tasks)
- `Permissions-Policy: <minimal>`

The backend also sets these so misconfigured proxies do not silently weaken security.

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

Final pick (A or B) recorded here before /speckit.tasks. Default recommendation: **B**.
