# Implementation Plan: Preproduction Launch Readiness AssurMatch

**Branch**: `013-preproduction-launch-readiness` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-preproduction-launch-readiness/spec.md`

**Continuous Workflow Eligibility**: Eligible for `/speckit.tasks` after this plan is accepted **and** the open questions below receive product/compliance answers. The user explicitly requested no `tasks.md` and no implementation in this invocation. Stop conditions remain: constitutional conflict, ambiguity, security/compliance/data-leakage risk, accidental activation of forbidden modules, missing answer on a blocking open question, blocking validation failure. Do not auto-commit.

## Summary

Prepare a complete, representative AssurMatch preproduction environment on an existing Linux VPS, deployed via GitHub Actions + GHCR + SSH (Docker), with full country and product catalogs, configurable partners (no arbitrary cap), all functional modules wired, and gated public exposure controlled by feature flags scoped per country, product, partner, plan and global. Reuse of memory adapters outside `NODE_ENV=test` remains forbidden; persistence stays Prisma-runtime.

This plan delivers planning artifacts only:

- This plan (`plan.md`).
- Decisions ([research.md](./research.md)).
- Seed/import data model ([data-model.md](./data-model.md)).
- Deployment contract ([contracts/deployment-contract.md](./contracts/deployment-contract.md)).
- Seed/import contract ([contracts/seed-import-contract.md](./contracts/seed-import-contract.md)).
- Quickstart ([quickstart.md](./quickstart.md)).
- Go/no-go checklist per scope ([checklists/go-no-go.md](./checklists/go-no-go.md)).
- Runbook outlines ([runbooks/index.md](./runbooks/index.md)).

No `tasks.md`. No source code changes. No automatic commit.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1; Next.js 16.2.4; React 19.2.5; Redis 5.12.1; BullMQ 5.76.2.
**Package manager**: **npm** (the repo ships `package-lock.json`; there is no `pnpm-lock.yaml`). The CI workflow inspired by another project's pnpm workflow MUST be adapted to npm. Migrating to pnpm is out of scope of this plan.
**Primary Dependencies**: existing `AssurMatchRuntime`, `RuntimeHttpWiringModule`, repositories Prisma-runtime listed in spec 011, dashboards module from spec 012, `packages/shared/contracts/*`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `redis`, `bullmq`, `zod`, `next`, `react`.
**Storage**: PostgreSQL is the source of truth. **Documents are stored locally** for now in a Docker volume (`/home/deployer/apps/assurmatch/uploads` mounted into the container). S3 remains optional and configurable for the future via env vars but is not used in preprod. Redis is enabled for cache, rate limiting, queues. BullMQ is enabled for queued jobs.
**Testing**: existing scripts (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npx prisma validate`, `npm audit --audit-level=high`, `git diff --check`, `npm run test:runtime:postgres`). The CI verify job runs the unit/integration suite; runtime-postgres runs in a dedicated job or on-demand.
**Target Platform**: existing Linux VPS hosting other applications. Docker runtime. Image registry: `ghcr.io/bkourouma/assurmatch`. Internal port 3600 bound to `127.0.0.1:3600` on the host. A reverse proxy already running on the VPS (Nginx/Caddy/Traefik — to confirm) terminates HTTPS and routes domain → container.
**Impacted Application(s)**: Backend API (Dockerfile + runtime config + health), Web Publique Client (Next.js build, public domain), Back-office Partenaires/Plateforme (broker app + admin app, separate routes/domains, MFA/RBAC), Base PostgreSQL (preprod instance, migrations, seeds, backup), Redis/BullMQ (preprod instance, cache and queues), shared packages, scripts, CI/CD workflow.
**Project Type**: B2B2C regulated marketplace; this feature is operational/infrastructure readiness, not business behavior.
**Performance Goals**: Backend boot < 10 s after image pull; health endpoint < 200 ms p95 on warm container; full smoke (without runtime-postgres) < 2 min in CI verify.
**Constraints**: HTTPS only; CORS strict per environment; no secret commit; durable Prisma-runtime audit; sensitive flags fail-closed; no business behavior change; respect package-manager (npm); reuse of existing CI patterns from companion app must adapt to AssurMatch monorepo (apps/* + backend + packages/shared).
**Scale/Scope**: full target country catalog (CIMA, FANAF, hors-CIMA where prevu), full product catalog from PRD (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction and others), partners configurable without arbitrary cap, all functional modules wired (sensitive ones gated). Gated public exposure per scope.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design (see end of file).*

- **Technical platform role**: Pass. Operational/infrastructure readiness only. No direct sale, subscription, premium collection, contract issuance, attestation, claims, signature, AI advanced or insurer API is enabled. Modules prepared but disabled where regulated.
- **Regulatory and consent**: Pass. Consent texts seeded per country/product before public activation. `ConsentRecord` mandatory prior to lead transmission. Activation publique scoped per country and product, blocked until compliance signed.
- **Feature flags and activation**: Pass. Sensitive flags (`payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_recommendation_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_broker_assistant_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `multi_broker_routing_enabled`, `billing_enabled`) remain false on a freshly initialized preprod. Functional flags (`public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, country/product flags) activable explicitly per scope.
- **Frontend application separation**: Pass. Distinct domains for public, back-office and API; CORS strict; no cross-import; existing Playwright source-marker checks extended.
- **Security and RBAC**: Pass. HTTPS, CORS strict, secure cookies, MFA admin/broker per role, rate limiting, anti-spam, RBAC strict, security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, basic CSP), secrets out of Git, env file on VPS, Prisma-runtime audit durable.
- **Data and auditability**: Pass. AuditLog Prisma-runtime durable. All sensitive operations audited including imports of confidential operational data and public activations.
- **Routing integrity**: Pass. Existing routing rules unchanged; verified via smoke. Multi-broker routing remains opt-in.
- **AI control**: Pass. AI modules wired with guardrails but flags closed; no automatic activation. Any activation requires regulatory validation.
- **UX and content safety**: Pass. Public surfaces show technical-platform positioning, indicative offer wording, no forbidden phrases. Mentions legales/privacy/terms per country before public activation.
- **Testing discipline**: Pass. CI runs typecheck/lint/test/test:web/build/prisma validate/npm audit/git diff --check. Runtime-postgres optional per change. Smoke checklist preprod runnable.
- **Async and reliability**: Pass. BullMQ kept for async work. No new heavy synchronous work added.
- **Continuous workflow safety**: Pass with stop condition. Plan stops at /speckit.plan; /speckit.tasks requires answers on open questions.

## Project Structure

### Documentation (this feature)

```text
specs/013-preproduction-launch-readiness/
  spec.md
  plan.md                                # this file
  research.md
  data-model.md
  contracts/
    deployment-contract.md
    seed-import-contract.md
  checklists/
    go-no-go.md
  runbooks/
    index.md                             # outlines (full runbooks live in docs/runbooks/ post-implement)
  quickstart.md
```

`tasks.md` is intentionally not generated.

### Source code (target paths for the future implementation)

```text
.github/
  workflows/
    ci.yml                               # NEW: verify (PR + push main) + build-and-deploy (push main)
backend/
  Dockerfile                             # NEW: multi-stage Node 24 + npm + prisma generate + nest build
backend/src/config/
  config.module.ts                       # extended: env validation per APP_ENV (local|runtime-smoke|staging|preproduction|production)
backend/src/modules/common/
  http/                                  # extended: CORS strict, security headers
docs/
  runbooks/                              # NEW directory; runbooks created during /speckit.implement
    deployment.md
    rollback.md
    migrations.md
    smoke-tests.md
    catalog-import-countries.md
    catalog-import-products.md
    operational-import-partners.md
    activation-country.md
    activation-product.md
    activation-partner.md
    feature-flag-toggle.md
    rapid-disable.md
    license-expired.md
    audit-logs.md
    backup-restore.md
    secret-rotation.md
  preproduction/
    architecture.md                      # diagram + flows
    environments.md                      # variable matrix per env
    domains.md                           # public/back-office/api routing
.env.example                             # extended: PUBLIC_APP_URL, BACKOFFICE_APP_URL, LOCAL_STORAGE_ROOT, LOG_LEVEL, RATE_LIMIT_*, COOKIE_DOMAIN
.env.preproduction.example               # NEW (no real secrets, docs only)
docker-compose.preproduction.yml         # OPTIONAL: local repro of preprod stack (postgres+redis+app+mailpit)
scripts/
  preprod/
    seed-reference.ts                    # NEW: seeds reference catalogs (countries, products, regulatory regimes, default flags, consent text templates)
    import-partners.ts                   # NEW: secure CSV/JSON import of partners + licenses + offers + advisor users (signed input + audit + dry-run)
    pre-deploy-check.sh                  # NEW: env validation + prisma migrate status + image health
    pre-deploy-image-prune.sh            # NEW: prune helper
backend/prisma/
  seed-reference.ts                      # OPTIONAL alternative path; tasks decision
```

**Structure Decision**: 1) Reuse the existing monorepo (`apps/public`, `apps/admin`, `apps/broker`, `backend`, `packages/shared`). 2) Add a single multi-stage `backend/Dockerfile` that builds the Nest backend (and serves the public + back-office Next apps as separate processes inside the container *or* as separate containers — see deployment-contract.md). 3) Add `.github/workflows/ci.yml` mirroring the user-provided CI shape but adapted to npm and to AssurMatch's three-app structure. 4) Documents and runbooks live under `docs/`. 5) Seed and import scripts live under `scripts/preprod/` with secure inputs and audit. 6) No code refactor of existing modules.

## Phase 0 Research Decisions

See [research.md](./research.md). Headlines:

1. **Hosting**: Linux VPS, Docker, GHCR registry `ghcr.io/bkourouma/assurmatch`. Internal port 3600 bound to `127.0.0.1:3600`. Reverse proxy on the VPS terminates HTTPS and routes per-domain (Nginx/Caddy/Traefik — confirm in tasks).
2. **Domains**: `assurmatch.net` (public), `backoffice.assurmatch.net` (back-office), `api.assurmatch.net` (API). Variables let alternative domains be substituted without code changes.
3. **Container topology**: a single image `ghcr.io/bkourouma/assurmatch:latest` exposes the three Next/Nest entry points behind a thin process supervisor (start backend on 3600 and serve the two Next apps from the same image either internally on 3001/3002 or as separately launched containers). The plan recommends **option B: three containers from the same image** (`assurmatch-app` for the API on 3600, `assurmatch-public` for the public Next app on 3601, `assurmatch-backoffice` for the broker+admin Next apps on 3602/3603) so the reverse proxy can map domains directly. The deployment-contract documents both options; the implementation team picks A or B before /speckit.tasks.
4. **Package manager**: npm. CI uses `npm ci` (replaces the pnpm steps in the inspiration workflow).
5. **CI/CD**: `verify` runs on PR + push main; `build-and-deploy` runs only on push main. Docker build uses Buildx; image tagged `latest` and `sha-<short>`. SSH deploy pulls, swaps containers, runs health checks, prunes.
6. **Storage**: local Docker volume mounted at `/app/uploads` (host: `/home/deployer/apps/assurmatch/uploads`). S3 stays optional via env.
7. **SMTP**: defer choice; preprod ships with Mailpit container or with notifications disabled. The plan documents both, default = disabled.
8. **Monitoring**: `/admin/system/health`, structured JSON logs, optional Uptime Kuma + Sentry. Default = host-level monitoring + log file rotation, with explicit upgrade path.
9. **Backups**: `pg_dump` daily on host, retention 14 days, encrypted via `gpg --symmetric` if a passphrase is provisioned. Uploads volume backed up daily. Manual restore test mandatory before global go.
10. **Secrets**: `.env.production` on the VPS only, owned by `deployer:deployer`, `0600`. No secret in repo. JWT/SESSION secrets ≥ 32 bytes from `openssl rand -base64`. Documented rotation runbook.
11. **Reference vs operational data**: reference catalogs (countries, currencies, languages, product categories, products, default flags, statuses, generic regulatory regimes, consent text templates) are seeded from the repo. Real partners/licenses/offers/users/contacts are imported via secure scripts on the VPS, never committed.
12. **Catalogs**: target country list and target product list are *required inputs* before /speckit.tasks. Plan provides templates and seed scaffolding; final lists come from product/compliance.
13. **Activation publique**: per-scope. The runbook + go/no-go checklist are scope-driven. No global "go" button.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): logical seed/import data model — what is committed (reference) vs what is imported (operational confidential), and the entity-by-entity matrix.
- [contracts/deployment-contract.md](./contracts/deployment-contract.md): CI/CD workflow contract (jobs, steps, secrets, deployment script), Docker contract, runtime contract, health contract, reverse-proxy contract, container topology decision (A vs B).
- [contracts/seed-import-contract.md](./contracts/seed-import-contract.md): script signatures, input formats (JSON/CSV with checksum), validation, dry-run, audit, rollback semantics, file conventions.
- [quickstart.md](./quickstart.md): how to run preprod locally for repro (docker-compose.preproduction.yml + Mailpit), how to deploy to VPS via GitHub Actions, how to seed reference data, how to import operational data securely, how to run smoke checks, how to activate a country/product/partner.
- [checklists/go-no-go.md](./checklists/go-no-go.md): per-scope checklist (country, product, partner) plus a global "preprod is operational" pre-check.
- [runbooks/index.md](./runbooks/index.md): outlines for every runbook listed in the spec FR-029.

## Technical Plan

### 1. Environments and variable matrix

Four runtime environments are recognized:

| Environment        | NODE_ENV  | APP_ENV          | Notes                                                                 |
|--------------------|-----------|------------------|------------------------------------------------------------------------|
| local              | local     | local            | Developer machine; existing `.env.example` already covers this.        |
| runtime-smoke      | runtime-smoke | runtime-smoke | Existing dedicated smoke (spec 011); kept untouched.                   |
| staging/preprod    | production | preproduction   | New: full preprod on VPS. NODE_ENV=production for runtime correctness; APP_ENV=preproduction differentiates behavior. |
| production (future)| production | production       | Reserved; not activated by this plan.                                  |

Variable matrix (full list in `docs/preproduction/environments.md`, rendered post-/speckit.implement):

```text
Mandatory (boot fails if absent in preprod/production):
  NODE_ENV, APP_ENV, PORT (default 3600)
  DATABASE_URL (postgres, must NOT match production patterns when APP_ENV=preproduction)
  REDIS_URL
  JWT_SECRET (>= 32 bytes)
  SESSION_SECRET (>= 32 bytes)
  PUBLIC_APP_URL (e.g. https://assurmatch.net)
  BACKOFFICE_APP_URL (e.g. https://backoffice.assurmatch.net)
  API_BASE_URL (e.g. https://api.assurmatch.net)
  CORS_ORIGINS (comma-separated absolute origins, no wildcard)
  LOCAL_STORAGE_ROOT (e.g. /app/uploads)

Mandatory in production only (warn in preprod if missing):
  COOKIE_DOMAIN (.assurmatch.net or scoped)
  ENCRYPTION_KEY (>= 32 bytes; for any field-level encryption when needed)

Optional (with documented defaults):
  BULLMQ_PREFIX (default: assurmatch-{APP_ENV})
  LOG_LEVEL (default: info)
  RATE_LIMIT_GLOBAL_PER_MIN (default: 600)
  RATE_LIMIT_PUBLIC_PER_IP_PER_MIN (default: 60)
  RATE_LIMIT_QUOTE_PER_IP_PER_HOUR (default: 10)
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM (notifications disabled if any missing)
  SENTRY_DSN
  S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY (only if migrating to S3)

Memory overrides (must remain false in preprod/production):
  ASSURMATCH_PRISMA_MEMORY=false
  ASSURMATCH_REDIS_MEMORY=false
  ASSURMATCH_QUEUE_MEMORY=false
  ASSURMATCH_AUDIT_MEMORY=false
  ASSURMATCH_RUNTIME_SMOKE (only set when running the smoke suite)
```

The backend's `ConfigModule` is extended to validate these per `APP_ENV`. Boot fails fast on missing/invalid values without echoing the value.

### 2. Container topology decision (final pick deferred to tasks)

- **Option A (single container)**: one container starts the Nest API on 3600 and serves both Next apps (public + back-office) on 3601/3602 internally via a tiny process supervisor (e.g. `pm2-runtime` or `npm-run-all` with proper signal handling). Reverse proxy maps domains to ports. Simpler ops, single image pull.
- **Option B (three containers from one image)**: image `ghcr.io/bkourouma/assurmatch` is built once. Three containers are launched on the VPS: `assurmatch-app` (API, 3600), `assurmatch-public` (Next public, 3601), `assurmatch-backoffice` (Next broker+admin, 3602). Reverse proxy maps each domain to its container. Cleaner separation, slight resource overhead.

The plan **recommends Option B** because (a) it matches the constitution's "frontend separation" requirement at the runtime layer too, (b) it lets each surface scale independently later, (c) it avoids a process supervisor we'd otherwise have to maintain. The CI/CD contract documents both; the team confirms during /speckit.tasks.

### 3. Dockerfile (multi-stage, npm)

Single `backend/Dockerfile` builds the API image. If Option B is retained, two more thin Dockerfiles (or one Dockerfile with build args) build the Next apps. Pseudocode in deployment-contract.md.

```text
Stage 1 (deps): node:24-alpine, copy package.json + package-lock.json, npm ci --omit=dev=false, copy prisma schema, npx prisma generate
Stage 2 (build): copy source, npm run build (typecheck + nest build + next build per app as needed)
Stage 3 (runtime): node:24-alpine, copy node_modules pruned, copy dist, copy prisma client, copy public next .next outputs (if Option A), expose 3600, USER node, HEALTHCHECK GET /admin/system/health, CMD ["node", "dist/main.js"]
```

### 4. CI/CD workflow shape

`.github/workflows/ci.yml` shape (full text in deployment-contract.md):

- **verify** (on `pull_request` and `push: main`):
  1. checkout
  2. setup-node 24 with npm cache
  3. `npm ci`
  4. `npx prisma generate --schema backend/prisma/schema.prisma`
  5. `npm run typecheck`
  6. `npm run lint`
  7. `npm run test`
  8. `npm run build`
  9. `npx prisma validate --schema backend/prisma/schema.prisma` (with placeholder DATABASE_URL)
  10. `npm audit --audit-level=high`
  11. `npx playwright install --with-deps chromium` then `npm run test:web` (best-effort; the suite uses source-marker checks today, no browser needed for the existing specs but install lets future browser specs run)

- **build-and-deploy** (on `push: main` only, after `verify` succeeds):
  1. checkout
  2. login to GHCR with `${{ secrets.GHCR_TOKEN }}`
  3. docker buildx build → tags `latest` and `sha-<short>`
  4. docker push both tags
  5. ssh into VPS using `${{ secrets.VPS_SSH_PRIVATE_KEY }}` (host `${{ secrets.VPS_HOST }}`, user `${{ secrets.VPS_SSH_USER }}` typically `deployer`)
  6. on the VPS:
     - validate env file presence and 0600 ownership
     - `docker pull ghcr.io/bkourouma/assurmatch:sha-...`
     - run `scripts/preprod/pre-deploy-check.sh` (env validation + `prisma migrate deploy` if appropriate)
     - `docker stop assurmatch-app || true && docker rm assurmatch-app || true`
     - `docker run -d --name assurmatch-app --restart unless-stopped --env-file /home/deployer/apps/assurmatch/.env.production -p 127.0.0.1:3600:3600 -v /home/deployer/apps/assurmatch/uploads:/app/uploads -v /home/deployer/apps/assurmatch/data:/app/data --network <network-tbc> ghcr.io/bkourouma/assurmatch:sha-...`
     - if Option B: same for `assurmatch-public` (3601) and `assurmatch-backoffice` (3602)
     - health check loop on `http://127.0.0.1:3600/admin/system/health` with backoff
     - `docker image prune -f`
  7. summary annotations

GitHub secrets to provision (documented in deployment-contract.md): `GHCR_TOKEN`, `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS`, optionally `DEPLOY_NETWORK_NAME`.

### 5. Reverse proxy contract

The VPS already runs a reverse proxy (probably Nginx, Caddy, or Traefik — to confirm in tasks). The plan defines the route map:

```text
assurmatch.net           -> 127.0.0.1:3601 (public)        # Option B
www.assurmatch.net       -> redirect to assurmatch.net
backoffice.assurmatch.net -> 127.0.0.1:3602 (back-office)
api.assurmatch.net       -> 127.0.0.1:3600 (API)
```

For Option A:

```text
assurmatch.net           -> 127.0.0.1:3601
backoffice.assurmatch.net -> 127.0.0.1:3602
api.assurmatch.net       -> 127.0.0.1:3600
```

(Same ports because the single container exposes all three.)

HTTPS is terminated at the reverse proxy. HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, basic CSP are added at the proxy layer; the backend also sets them so they hold even if the proxy is misconfigured.

### 6. Reference catalog seed (versioned in repo)

Versioned reference data (no PII, publishable):

- Countries: target list (CIMA, FANAF, hors-CIMA where prevu) — final list provided by product before /speckit.tasks.
- Currencies, languages.
- Regulatory regimes (generic templates per zone, e.g. CIMA, FANAF, others).
- Product categories and full product list from PRD (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction, others).
- Default feature flag definitions (sensitive flags fail-closed, country/product flags off until explicit activation).
- Consent text **templates** (parameterized by country and product; *not* the real legally-published texts which require local counsel — those are imported via the operational track or curated and committed only after compliance signoff).
- Status enums.

Implementation: `scripts/preprod/seed-reference.ts` (idempotent, audited). Driven by JSON/YAML files under `scripts/preprod/seeds/reference/` committed to the repo.

### 7. Operational data import (out of Git)

Real partners, licenses, accreditation documents, real offers, advisor users, contact emails are **imported on the VPS only**, via `scripts/preprod/import-partners.ts`:

- Input: signed/encrypted JSON/CSV bundle dropped into `/home/deployer/apps/assurmatch/imports/<batch-id>/`.
- Validation: zod schemas for each row; integrity check via SHA-256 manifest.
- Dry-run mode: `--dry-run` prints validation report without writing.
- Audit: each row import writes an `AuditLog` (`partner.imported`, `license.imported`, etc.) with batch-id, actor, scope.
- Idempotency: identifying keys (legal name + country + license number) prevent duplicates; updates are explicit.
- Rollback: each batch has a `rollback.sql` companion produced by the import; manual rollback documented.
- Documents: stored under `/home/deployer/apps/assurmatch/uploads/<partner-id>/<document-id>` with checksum stored in DB.

The seed-import contract spells out file formats, mandatory fields, and validation rules.

### 8. Activation publique controls

The plan does NOT introduce a new activation endpoint; it relies on the existing `AdminFeatureFlagsController` plus the already-audited `FeatureFlagsService.setFlag`. The runbooks formalize the operator procedure per scope:

- Activate a country: confirm catalog presence + consent text published + at least one valid licensed partner + go/no-go checklist signed → flip `country_public_enabled=true` for that country (scopeId) + flip `country_quote_enabled=true` if quote allowed → record audit.
- Activate a product within a country: confirm form definition + documents + disclaimers + go/no-go for product/country → flip `product_public_enabled=true` (scopeId=`country|product`) + `product_quote_enabled=true` if quote allowed.
- Activate a partner: confirm valid license, agreement docs, plan, contact, scope authorizations → set partner status `active` and audit.

### 9. Smoke checklist preprod

Reuses spec 011's runtime-postgres smoke as a base, plus a simpler "preprod smoke" that runs against the deployed environment via HTTPS. Items covered: backend health, DB, Redis, BullMQ, public catalog (sample of countries/products), consented and refused quote, broker portal, CRM gated, dashboard gated, audit durability, tenant isolation, broker→admin denial, license-expired blocking. Detail in quickstart.md and contracts.

### 10. Backup and restore

- PostgreSQL: `pg_dump` cron daily at 02:00 UTC. Files written to `/home/deployer/backups/postgres/<date>.sql.gz`. Encrypted with `gpg --symmetric --cipher-algo AES256` if `BACKUP_PASSPHRASE` is configured.
- Uploads: `tar -czf` daily at 02:30 UTC. Same dir.
- Retention: 14 days locally; offsite copy plan deferred to /speckit.tasks (rsync to remote, or `rclone` to object storage).
- Restore test: documented in runbook, mandatory before global go on a separate temporary database/container.

### 11. Monitoring (minimal)

- `GET /admin/system/health`: existing endpoint serves PG/Redis/BullMQ status. Probed every 60 s by the reverse proxy or by Uptime Kuma if installed.
- Logs: structured JSON to stdout via existing logger. Docker captures; `docker logs` and host-level log rotation.
- Alerts: optional Uptime Kuma → Telegram/email. Sentry remains optional.
- Custom alerts (license expiring, import failure) ride on the existing audit log + a small daily digest job (deferred to a future spec — not implemented in 013).

### 12. Security hardening

- Force HTTPS at proxy; backend rejects HTTP via env-driven middleware.
- CORS strict using `CORS_ORIGINS`.
- Cookies: HttpOnly + Secure + SameSite=Lax (back-office session cookie already follows this; verified at deploy).
- MFA admin enforced via existing `MfaRequiredHttpGuard`. MFA broker per role.
- Rate limiting: existing public middleware reused; thresholds configurable via env.
- Secrets out of Git: `.gitignore` already excludes `.env*` except `.env.example` and the new `.env.preproduction.example` (no real values).
- Pre-commit hook (optional, deferred): a basic secret scanner (`gitleaks` or `detect-secrets`) wired in CI verify.

### 13. Frontend changes (minimal)

- Public Next app: ensure it reads `PUBLIC_APP_URL` and `API_BASE_URL` at build/runtime; verify no back-office import; verify public-content disclaimers (already covered by existing Playwright source-marker tests).
- Admin Next app: ensure it points at `BACKOFFICE_APP_URL` and `API_BASE_URL`; verify auth cookie domain.
- Broker Next app: same.

No UI redesign. No new pages. Source-marker Playwright tests get *one* additional spec verifying no hardcoded `localhost` domain remains in production builds (deferred to /speckit.tasks).

### 14. What this plan does NOT do

- Does NOT activate any module that is currently fail-closed.
- Does NOT change business logic of existing modules.
- Does NOT migrate to pnpm.
- Does NOT introduce S3.
- Does NOT add new HTTP endpoints.
- Does NOT add new Prisma migrations or schema changes (unless /speckit.tasks discovers a missing column required for catalog scope, in which case it must be a separate spec).
- Does NOT provision the VPS or DNS — that's an operator action covered by the deployment runbook.

## Validation Matrix

| Area                       | Required validation                                                                  |
|----------------------------|--------------------------------------------------------------------------------------|
| Env variables              | Boot fails on missing mandatory; messages actionable; no value echoed                 |
| Migrations                 | `prisma migrate deploy` runs and `prisma migrate status` clean before serving         |
| Health                     | `/admin/system/health` returns OK with PG, Redis, queues                              |
| HTTPS / proxy              | All three domains resolve over HTTPS with valid certs                                 |
| CORS                       | Strict; no wildcard                                                                   |
| Reference seed             | Idempotent; produces full country/product catalogs from versioned files               |
| Operational import         | Dry-run + apply on the VPS; audited; documents land in `/app/uploads`                 |
| Sensitive flags            | False after fresh init                                                                 |
| Activation publique        | Per-scope, audited                                                                     |
| Smoke checklist            | Passes on preprod                                                                      |
| Backup                     | Daily files exist, encrypted when passphrase set; restore test passes                  |
| Logs                       | Structured JSON; PII/secrets masked                                                    |
| CI verify                  | Green on PR and push main                                                              |
| CI deploy                  | Green on push main; container healthy after deploy                                     |
| Rollback                   | Documented runbook reverts to previous image tag with health verified                  |

## Risks

- VPS reverse proxy not yet identified → wrong header set / wrong cert / route mismatch. Mitigation: confirm Nginx/Caddy/Traefik in /speckit.tasks before deploy.
- Catalog target lists not finalized → tasks blocked. Mitigation: provide templates and accept "TBD" rows that won't activate until final.
- Confidential data leaking into Git via accidental commit. Mitigation: explicit `.gitignore`, secret scanner in verify (deferred), runbook training, pre-commit hook recommendation.
- Container topology change between A and B late in tasks. Mitigation: deployment-contract documents both with same secrets/env.
- Existing CI inspiration uses pnpm; copy-pasting it would break npm workflows. Mitigation: this plan explicitly enforces npm.
- npm audit may surface high-severity vulns from transitive deps. Mitigation: existing project already passes `npm audit --audit-level=high`; CI gate confirms.
- BullMQ + Redis versions in the image must match dev. Mitigation: pinned versions in package.json, image build uses package-lock.json.
- Backup passphrase loss → unrecoverable backups. Mitigation: documented passphrase storage in secrets manager; restore test exercises decryption.
- Public activation simultaneous on many countries/products → operator overload. Mitigation: runbook recommends staged activation per scope with a wait/observe period; not enforced by code.

## Rollback And Cleanup Strategy

- Revert: SSH on VPS, run `docker stop && docker rm` current container(s), `docker run` with previous SHA tag pulled from GHCR. Health check loop confirms.
- Schema rollback: not in scope of this plan (no new migrations). If a future implementation introduces a migration, rollback follows Prisma's migration semantics; runbook to be added separately.
- Configuration rollback: keep last-known-good `.env.production` snapshot in `/home/deployer/apps/assurmatch/env-history/` (file, not Git).
- Image hygiene: `docker image prune -f` after each successful deploy.
- Aborted deploy: if health checks fail post-`docker run`, the script auto-reverts to the previous image tag and exits non-zero so the pipeline fails loudly.

## Recommended Implementation Order (for a future /speckit.tasks)

1. Confirm: container topology (A vs B), reverse proxy choice, target country list, target product list, partner import format, SMTP decision, monitoring decision.
2. Add `.dockerignore` adjustments and `backend/Dockerfile` (Option B → also `apps/public/Dockerfile`, `apps/admin/Dockerfile` or shared multi-stage build).
3. Add `.github/workflows/ci.yml` (verify + build-and-deploy).
4. Extend `ConfigModule` env validation per APP_ENV (preproduction).
5. Extend `.env.example` and add `.env.preproduction.example`.
6. Add `scripts/preprod/seed-reference.ts` and JSON files under `scripts/preprod/seeds/reference/`.
7. Add `scripts/preprod/import-partners.ts` with dry-run + audit.
8. Add `scripts/preprod/pre-deploy-check.sh`.
9. Add `docs/preproduction/architecture.md`, `environments.md`, `domains.md`.
10. Add `docs/runbooks/*.md` (the runbooks listed in spec FR-029).
11. Add CI tests: source-marker Playwright spec verifying no hardcoded localhost in built bundles; unit tests for env validation.
12. Manual: provision VPS env file, GitHub secrets, DNS records.
13. First deploy on preprod; run smoke; run go/no-go for the first scope.

## Complexity Tracking

No constitutional violations. No exception requested.

## Post-Design Constitution Re-Check

- Technical platform role: Pass. Infra-only.
- Regulatory and consent: Pass. Activation publique gated; consent texts required per scope.
- Feature flags and activation: Pass. Sensitive flags fail-closed.
- Frontend application separation: Pass. Distinct domains, distinct containers (Option B) or distinct ports (Option A).
- Security and RBAC: Pass. HTTPS, CORS strict, secure cookies, MFA, rate limiting, RBAC, security headers, secrets out of Git.
- Data and auditability: Pass. Imports audited; activations audited.
- Routing integrity: Pass. Existing rules unchanged.
- AI control: Pass. AI flags closed.
- UX and content safety: Pass. Existing wording invariants preserved.
- Testing discipline: Pass. CI + smoke + go/no-go.
- Async and reliability: Pass. BullMQ retained; no new heavy sync work.
- Continuous workflow safety: Pass with stop condition on open product/compliance questions before /speckit.tasks.
