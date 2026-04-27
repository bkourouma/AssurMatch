# Phase 0 Research: Preproduction Launch Readiness

This document captures the technical decisions taken for spec 013 and the rationale for each.

## Hosting and registry

- **Decision**: existing Linux VPS with Docker. Image registry: `ghcr.io/bkourouma/assurmatch`. Internal port `3600` bound to `127.0.0.1:3600`. No public port exposure from the container; HTTPS termination by the existing reverse proxy.
- **Reason**: keeps deployment costs low, leverages existing infrastructure, and matches the user-supplied CI/CD inspiration. GHCR avoids an extra registry account and ties image lifetime to the GitHub repo.

## Domain layout

- **Decision**: three separate hosts.
  - `assurmatch.net` (and `www.assurmatch.net` redirecting) → public visitor surface.
  - `backoffice.assurmatch.net` → broker + admin Next apps.
  - `api.assurmatch.net` → backend API.
- **Reason**: enforces the constitutional separation between Web Publique Client and Back-office at the infra layer, lets the reverse proxy apply different security headers, simplifies CORS (`CORS_ORIGINS` is a small explicit list).
- **Variables**: `PUBLIC_APP_URL`, `BACKOFFICE_APP_URL`, `API_BASE_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN` are env-driven so non-final domains can be swapped without code changes.

## Container topology (A vs B)

- **Option A**: one container runs API on 3600 and serves both Next apps internally on 3601/3602 via a process supervisor.
- **Option B (recommended)**: one image, three containers — `assurmatch-app` (3600), `assurmatch-public` (3601), `assurmatch-backoffice` (3602).
- **Recommendation**: Option B. Cleaner runtime separation matches the constitutional separation, scales independently, no in-container supervisor maintenance.
- **Decision deferred**: final pick made before /speckit.tasks. Both paths are documented in the deployment contract.

## Package manager

- **Decision**: npm. The repo ships `package-lock.json`, no pnpm config.
- **Reason**: avoids an out-of-scope migration. The CI inspiration (which used pnpm for another app) is adapted: `npm ci` replaces `pnpm install --frozen-lockfile`.

## CI/CD shape

- **Decision**: two-job GitHub Actions workflow at `.github/workflows/ci.yml`.
  - `verify` runs on `pull_request` and `push: main`.
  - `build-and-deploy` runs only on `push: main`, depends on verify.
- **Reason**: same shape as the inspiration workflow, adapted to npm and to AssurMatch's monorepo (apps + backend + packages).

## Secrets and `.env`

- **Decision**: `.env.production` lives only on the VPS at `/home/deployer/apps/assurmatch/.env.production` with mode `0600`. Repo only ships `.env.example` and a new `.env.preproduction.example` (no real values). GitHub secrets hold `GHCR_TOKEN`, `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS`, optional `DEPLOY_NETWORK_NAME`.
- **Reason**: respects the constitution (no secret in Git), gives the deploy script enough context, and keeps the credential surface minimal.
- **Generation**: `openssl rand -base64 48` for JWT/SESSION/ENCRYPTION secrets (≥ 32 bytes). Documented in the runbook for first install.

## Storage

- **Decision**: documents stored locally in a Docker volume. Host path `/home/deployer/apps/assurmatch/uploads`, container path `/app/uploads` (configured via `LOCAL_STORAGE_ROOT`).
- **Reason**: the user requested local storage for now. Avoids adding S3 plumbing/tests to this scope. S3 remains optional via env if a future spec migrates.
- **Persistence**: backed up daily.

## SMTP / notifications

- **Decision**: SMTP variables are wired in env but **defaulted off**. Preprod ships with Mailpit available (optional container) or with notifications disabled entirely. Real SMTP is not provisioned by this plan.
- **Reason**: avoids accidental real-mail emission to operational contacts during preprod runs. Keeps the notification module ready to flip on once a transactional provider is chosen.

## Monitoring

- **Decision**: minimal monitoring built on what already exists.
  - `/admin/system/health` covers DB/Redis/queues.
  - Logs are structured JSON to stdout (existing pattern); host-level `logrotate` or Docker log rotation captures them.
  - Optional Uptime Kuma + Sentry for richer monitoring, but neither is imposed.
- **Reason**: matches the VPS context, avoids new dependencies, leaves the monitoring choice to the team.

## Backups

- **Decision**: PostgreSQL `pg_dump` daily 02:00 UTC; uploads volume `tar.gz` daily 02:30 UTC; retention 14 days locally; symmetric encryption with `gpg` if `BACKUP_PASSPHRASE` is configured. Restore test mandatory before a global go.
- **Reason**: simple, well-understood, matches a single-VPS context. Offsite copy is a follow-up.

## Reference vs operational data split

- **Decision**: two clearly separated tracks.
  - Reference catalogs (countries, currencies, languages, product categories, products, statuses, default flags, regulatory regime templates, consent text *templates*) → versioned in repo as JSON/YAML, applied via `scripts/preprod/seed-reference.ts`.
  - Operational confidential data (real partners, real licenses, real offers, advisor users, contact emails, accreditation documents) → imported from a signed/encrypted bundle on the VPS via `scripts/preprod/import-partners.ts`. Never committed.
- **Reason**: matches the user's explicit instruction. Lets developers work with realistic-looking but synthetic reference data in PRs while keeping confidential data out of the repo and out of CI logs.

## Country and product target lists

- **Decision**: lists are *external inputs* required before /speckit.tasks. Templates exist:
  - Country template fields: `isoCode`, `name`, `currency`, `languages`, `timezone`, `regulatoryRegimeId`, `status`, default flags (`country_public_enabled=false`, `country_quote_enabled=false`, `country_comparison_enabled=false`, `country_broker_onboarding_enabled=false`, `country_ai_enabled=false`, `country_waitlist_enabled=false`).
  - Product template fields: `key`, `name`, default flags (`product_public_enabled=false`, `product_quote_enabled=false`, `product_comparison_enabled=false`, `product_document_upload_enabled=false`, `product_sensitive_data_enabled=false`, `product_manual_review_required=true`, `product_ai_scoring_enabled=false`, `product_ai_form_assistant_enabled=false`).
- **Reason**: avoids guessing CIMA/FANAF lists; the product/compliance team supplies them. The plan ships templates; tasks fill them in.

## Activation publique

- **Decision**: per-scope and gated. No new activation endpoint. Operators flip flags via the existing `AdminFeatureFlagsController` after passing the per-scope go/no-go checklist.
- **Reason**: minimal change, full audit, matches the constitution.

## Multi-broker routing

- **Decision**: `multi_broker_routing_enabled` stays `false` by default. Enabling is a separate decision with conformity validation.
- **Reason**: deferred per user instruction.

## Reverse proxy

- **Decision**: confirmed by tasks (Nginx, Caddy, or Traefik). Plan documents only the route map and required headers; the actual proxy config is owned by the VPS operator and lives outside this repo.
- **Reason**: respects existing infra without forcing a re-platform.

## Pre-commit secret scanner

- **Decision**: deferred to /speckit.tasks. Recommended: `gitleaks` in CI verify; optional local pre-commit hook.
- **Reason**: useful but not blocking for the planning artifact.

## What was rejected

- **Migrating to pnpm**: out of scope; would touch every CI step and lockfile.
- **S3 storage now**: not requested; adds testing surface.
- **A managed hosting platform (Render / Railway / Fly.io)**: VPS is the chosen target.
- **A monolithic single container with reverse-proxy inside**: keeps responsibility split with the existing proxy on the VPS.
- **Global "go" button**: violates the per-scope activation requirement.

## Inputs still needed before /speckit.tasks

1. Final container topology (A or B).
2. Final reverse-proxy product (Nginx / Caddy / Traefik) and current config layout on the VPS.
3. Final domain decision (assurmatch.net or alternative).
4. Final country target list.
5. Final product target list.
6. Operational import format (JSON or CSV; signing/encryption choice).
7. Real partner data delivery channel (one-shot bundle vs continuous trickle).
8. SMTP decision (off / Mailpit / real provider).
9. Monitoring decision (host only / Uptime Kuma / Sentry).
10. Backup destination decision (local only or local + offsite).
11. Custodian list for GitHub secrets and the VPS env file.
