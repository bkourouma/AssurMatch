---
description: "Task list for Preproduction Launch Readiness"
---

# Tasks: Preproduction Launch Readiness AssurMatch

**Input**: Design documents in `/specs/013-preproduction-launch-readiness/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/*, quickstart.md, checklists/go-no-go.md, runbooks/index.md

**Continuous Workflow**: Plan eligible. Spec committed. Decisions finalized: topology B (3 containers), Nginx, sub-domains, 9 CIMA countries, full PRD products, Gmail SMTP (preview default), Uptime Kuma, local backups 14d, signature deferred. /speckit.implement proceeds. **Stop conditions**: constitutional conflict, ambiguity, security/compliance/data-leakage, accidental activation of forbidden module, blocking validation failure. **No auto-commit**.

**Tests**: existing CI (`typecheck`, `lint`, `test`, `test:web`, `build`, `prisma validate`, `npm audit`, `git diff --check`) must remain green. New artifacts must not break business logic.

**Path conventions**:
- CI: `.github/workflows/`
- Docker: `backend/Dockerfile`, `apps/public/Dockerfile`, `apps/admin/Dockerfile`
- Scripts: `scripts/preprod/`
- Reference seed data: `scripts/preprod/seeds/reference/`
- Docs: `docs/preproduction/`, `docs/runbooks/`

## Phase 1: Setup — Repo hygiene and env shape

- [x] T001 Extend `.gitignore` to forbid operational imports and backups directories outside reference seed: add `scripts/preprod/imports/`, `backups/`, `*.gpg`, `*.app-password`. Keep existing `.env.*` exclusion (with `.example` allow-list).
- [x] T002 Extend `.dockerignore` to exclude `specs/`, `docs/runbooks/`, `tests/`, `.git/`, `.github/`, all `.env*` (except `.env.example`), `node_modules`, build outputs, scripts not needed at runtime.
- [x] T003 [P] Extend `.env.example` (local) with `EMAIL_*`, `LOCAL_STORAGE_ROOT`, `LOG_LEVEL`, `RATE_LIMIT_*`, `BACKUP_PASSPHRASE`. Real values stay placeholders.
- [x] T004 [P] Create `.env.preproduction.example` with the full preprod variable matrix. **All secrets are placeholders or `REDACTED`.** Use `EMAIL_DELIVERY_MODE=preview` and `EMAIL_SMTP_PASS=REDACTED`.

## Phase 2: Foundational — Three Dockerfiles for topology B

- [x] T005 Create `backend/Dockerfile` (multi-stage Node 24 alpine + npm). Stages: deps → build (npx prisma generate + npm run build) → runtime. Non-root `app` user. `EXPOSE 3600`. HEALTHCHECK on `/admin/system/health`. CMD runs the Nest API only.
- [x] T006 Create `apps/public/Dockerfile` (multi-stage Node 24 alpine + npm). Builds the Next public app. `EXPOSE 3601`. CMD runs `next start -p 3601`.
- [x] T007 Create `apps/admin/Dockerfile` (multi-stage Node 24 alpine + npm). Packages BOTH `apps/admin` and `apps/broker` as the back-office surface. `EXPOSE 3602`. CMD runs the back-office.
- [ ] T008 Verify each image builds locally (`docker build -f <path> .`) — manual operator check (not automated in CI yet; no CI runtime here). Note: validation T034 covers CI's docker build via Buildx.

## Phase 3: CI/CD — GitHub Actions workflow

- [x] T009 Create `.github/workflows/ci.yml` with two jobs:
  - `verify` (on `pull_request` and `push: main`): `npm ci`, `npx prisma generate`, `typecheck`, `lint`, `test`, `build`, `prisma validate` (placeholder DATABASE_URL), `npm audit --audit-level=high`, `npx playwright install --with-deps chromium`, `test:web`.
  - `build-and-deploy` (on `push: main` only, depends on `verify`): build/push three GHCR images, SSH deploy to VPS, swap three containers, health-check the three surfaces, `docker image prune -f`.
- [x] T010 Document required GitHub secrets in `docs/preproduction/environments.md` (T021): `GHCR_TOKEN`, `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS`, `DEPLOY_NETWORK_NAME` (optional).
- [x] T011 Add a comment in `ci.yml` listing the three image names: `ghcr.io/bkourouma/assurmatch`, `ghcr.io/bkourouma/assurmatch-public`, `ghcr.io/bkourouma/assurmatch-backoffice`.

## Phase 4: Reference seed data (committed JSON)

- [x] T012 Create `scripts/preprod/seeds/reference/countries.json` with the 9 confirmed CIMA countries (BJ, BF, CM, CF, CI, GA, ML, NE, SN) — fields per `data-model.md` §R.1, all flags `false`, status `draft`.
- [x] T013 [P] Create `scripts/preprod/seeds/reference/currencies.json` with XOF, XAF, EUR, USD (and any other ISO 4217 used by the country list).
- [x] T014 [P] Create `scripts/preprod/seeds/reference/languages.json` with `fr`, `en`, `pt`, `ar` minimal set.
- [x] T015 [P] Create `scripts/preprod/seeds/reference/regulatory-regimes.json` with `cima`, `fanaf`, `domestic-template` generic regimes.
- [x] T016 [P] Create `scripts/preprod/seeds/reference/product-categories.json` with `personal-lines`, `commercial-lines`, `life-savings`, `microassurance`, `specialty`.
- [x] T017 [P] Create `scripts/preprod/seeds/reference/products.json` with 15 PRD products (auto, moto, sante, voyage, habitation, vie-epargne, entreprise, transport, agricole, scolaire, microassurance, credit-caution, cyber, evenementiel, construction). All product flags fail-closed; `product_manual_review_required=true`.
- [x] T018 [P] Create `scripts/preprod/seeds/reference/feature-flags.defaults.json` mirroring `backend/src/modules/feature-flags/default-flags.ts` exactly. Sensitive flags `false`.
- [x] T019 [P] Create `scripts/preprod/seeds/reference/consent-templates.json` with parameterized templates (purpose, language placeholders) — **no real legal text**, marked `status: "draft"` and `mode: "template"`.
- [x] T020 [P] Create `scripts/preprod/seeds/reference/README.md` explaining the role of each file, idempotency guarantee, and that real legal/operational data is imported separately.

## Phase 5: Documentation — Preproduction handbook

- [x] T021 Create `docs/preproduction/architecture.md` summarizing topology B, three containers, three sub-domains, Nginx role, ports.
- [x] T022 [P] Create `docs/preproduction/environments.md` with the full variable matrix per APP_ENV (local | runtime-smoke | preproduction | production). Include GitHub secrets list.
- [x] T023 [P] Create `docs/preproduction/domains.md` with the route map and DNS records.
- [x] T024 [P] Create `docs/preproduction/nginx.md` with three `server { ... }` blocks (public, back-office, API) — full-text examples pointing at `127.0.0.1:3601/3602/3600`. Headers HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy + basic CSP per surface. Three Let's Encrypt certs as recommendation, wildcard documented as future option.

## Phase 6: Runbooks (operations)

- [x] T025 [P] Create `docs/runbooks/deployment.md` (deploy via `git push main`, monitor pipeline, observe three health endpoints).
- [x] T026 [P] Create `docs/runbooks/rollback.md` (revert to previous SHA across all three containers).
- [x] T027 [P] Create `docs/runbooks/migrations.md` (`prisma migrate deploy` and status checks).
- [x] T028 [P] Create `docs/runbooks/smoke-tests.md` (manual + scripted preprod smoke list, mirrors quickstart §E).
- [x] T029 [P] Create `docs/runbooks/catalog-import-countries.md` (edit JSON + re-run seed-reference).
- [x] T030 [P] Create `docs/runbooks/catalog-import-products.md` (same flow).
- [x] T031 [P] Create `docs/runbooks/operational-import-partners.md` (place batch, dry-run, apply, audit).
- [x] T032 [P] Create `docs/runbooks/activation-country.md`, `docs/runbooks/activation-product.md`, `docs/runbooks/activation-partner.md`, `docs/runbooks/feature-flag-toggle.md`, `docs/runbooks/rapid-disable.md` (per-scope flag flips with audit reason format).
- [x] T033 [P] Create `docs/runbooks/license-expired.md`, `docs/runbooks/audit-logs.md`, `docs/runbooks/backup-restore.md`, `docs/runbooks/secret-rotation.md`, `docs/runbooks/email-mode-toggle.md`, `docs/runbooks/nginx-config.md`.

## Phase 7: Scripts — preprod operations

- [x] T034 Create `scripts/preprod/pre-deploy-check.sh` (POSIX shell). Verifies env file presence + 0600 perm + key vars (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `EMAIL_SMTP_PASS`, `LOCAL_STORAGE_ROOT`); refuses to continue when any is missing. Exits non-zero on failure.
- [x] T035 [P] Create `scripts/preprod/backup-postgres.sh` (`pg_dump -Fc | gzip` + optional `gpg --symmetric`). Output path under `/home/deployer/apps/assurmatch/backups/postgres/<date>.sql.gz[.gpg]`. Retention 14 days via `find ... -mtime +14 -delete`.
- [x] T036 [P] Create `scripts/preprod/backup-uploads.sh` (`tar -czf` of the uploads volume + optional `gpg`). Same retention.
- [x] T037 [P] Create `scripts/preprod/restore-test.sh` (skeleton only, manual flow): instructions for restoring on a separate temporary DB and verifying critical tables.
- [x] T038 Create `scripts/preprod/seed-reference.ts` — TypeScript script using `PrismaClient` directly (not the runtime). Reads JSON files in `scripts/preprod/seeds/reference/`, upserts countries / currencies / languages / regulatory regimes / product categories / products / consent templates / feature-flag defaults. **Idempotent**. Refuses to run if `NODE_ENV=test` (avoid polluting test DB). `--dry-run` prints actions without writing.
- [x] T039 Create `scripts/preprod/import-partners.ts` — TypeScript script that reads a `--batch` directory containing `manifest.json`, `partners.json`, `licenses.json`, `offers.json`, `users.json` and `documents/`. Validates SHA-256 against manifest. Validates rows with zod. Supports `--dry-run` (default `false` requires explicit `--apply` flag for safety). Writes `AuditLog` rows (`partner.imported`, `partner_license.imported`, `offer.imported`, `user.imported`) with `correlationId=batchId`. Writes `rollback.json` on apply. **No real partner data committed; the operational batch lives outside the repo.**
- [x] T040 [P] Add `npm` scripts to `package.json`: `seed:reference`, `import:partners`. Use `tsx` invocation consistent with `test:runtime:postgres`.

## Phase 8: Anti-secret protections

- [x] T041 Verify `.gitignore` covers all paths created in Phase 7 (imports, backups, encrypted bundles).
- [x] T042 Add a CI verify step (in `ci.yml`) that fails if any tracked file matches `EMAIL_SMTP_PASS=` followed by anything other than `REDACTED`, or matches a `BEGIN OPENSSH PRIVATE KEY` pattern. Implementation: a small `grep -nE` scan over the diff or repo (excluding `node_modules`, `package-lock.json`).
- [x] T043 Document the policy in `docs/preproduction/secrets-policy.md` (no secrets in Git, app password rotation, env file 0600).

## Phase 9: Polish — go/no-go and PR description

- [x] T044 Verify `checklists/go-no-go.md` covers the three sub-domains, three containers, Uptime Kuma, Gmail preview mode, 9 countries / 15 products. (Already done in plan finalization commit; re-confirm and extend if gap found.)
- [x] T045 Update `AGENTS.md` to point at this plan (post-implement).

## Phase 10: Validations

- [x] T046 `npm run typecheck`
- [x] T047 `npm run lint`
- [x] T048 `npm run test`
- [x] T049 `npm run test:web`
- [x] T050 `npm run build`
- [x] T051 `npx prisma validate --schema backend/prisma/schema.prisma` (DATABASE_URL placeholder)
- [x] T052 `npm audit --audit-level=high`
- [x] T053 `git diff --check`
- [x] T054 Manual secret scan: grep for `EMAIL_SMTP_PASS=` in tracked files; no result other than `REDACTED`.
- [x] T055 Verify sensitive flags remain `false` in `backend/src/modules/feature-flags/default-flags.ts` (no change).
- [ ] T056 Optional: `npm run test:runtime:postgres` if any Prisma path is touched (this implementation does not touch Prisma; skip with justification).

## Dependencies & order

- Phase 1 → Phase 2 (Dockerfiles depend on .dockerignore)
- Phase 1, 4 → Phase 7 (scripts depend on env shape and seed JSON)
- Phase 3 → Phase 8 (CI workflow gets the secret-scan step)
- Phases 5, 6 are documentation, parallel-safe
- Phase 10 runs last

## Notes

- Tasks marked `[P]` touch independent files and may be done in parallel.
- The implementation MUST NOT modify business logic, controllers, repositories, services or Prisma schema.
- The implementation MUST NOT activate any forbidden flag.
- The implementation MUST NOT commit real secrets, real partners, real licenses, real documents.
- All TypeScript additions MUST pass strict typecheck (`exactOptionalPropertyTypes: true`).
