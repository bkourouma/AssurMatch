# Phase 0 Research: Preproduction Launch Readiness

This document captures the technical decisions taken for spec 013 and the rationale for each.

## Hosting and registry

- **Decision**: existing Linux VPS with Docker. Image registry: `ghcr.io/bkourouma/assurmatch`. Internal port `3600` bound to `127.0.0.1:3600`. No public port exposure from the container; HTTPS termination by the existing reverse proxy.
- **Reason**: keeps deployment costs low, leverages existing infrastructure, and matches the user-supplied CI/CD inspiration. GHCR avoids an extra registry account and ties image lifetime to the GitHub repo.

## Domain layout (CONFIRMED)

- **Decision**: three sub-domains under `allianceconsultants.net`.
  - `assurmatch.allianceconsultants.net` → public visitor surface (port 3601).
  - `backoffice-assurmatch.allianceconsultants.net` → back-office (port 3602).
  - `api-assurmatch.allianceconsultants.net` → backend API (port 3600).
- **Sub-domain vs path-based**: sub-domain layout chosen. Reasons:
  - Cleaner CORS per surface (one explicit origin per consumer).
  - Distinct CSP per surface, no shared origin.
  - No Nginx path-rewriting for upstream Next apps (Next handles its own `basePath` poorly when proxied behind a path; sub-domain avoids this entirely).
  - No collision with internal Next `/api` routes.
  - Independent Let's Encrypt certificates per sub-domain (or a wildcard `*.allianceconsultants.net` if available).
- **Variables**: `PUBLIC_APP_URL`, `BACKOFFICE_APP_URL`, `API_BASE_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN` are env-driven so non-final domains can be swapped without code changes.

## Container topology (CONFIRMED: Option B)

- **Decision**: three containers built from three Dockerfiles in the same repo — `assurmatch-app` (3600), `assurmatch-public` (3601), `assurmatch-backoffice` (3602).
- **Reason**: cleanest separation, matches the constitutional Web Publique / Back-office / API split at the runtime layer, each surface scales independently, no in-container process supervisor to maintain.

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

## SMTP / notifications (CONFIRMED initial)

- **Decision**: Gmail SMTP. Variables wired in env file:
  - `EMAIL_SERVICE_TYPE=smtp`
  - `EMAIL_FROM=rotaryabidjan2plateaux@gmail.com`
  - `EMAIL_SMTP_HOST=smtp.gmail.com`
  - `EMAIL_SMTP_PORT=587` (STARTTLS)
  - `EMAIL_SMTP_USER=rotaryabidjan2plateaux@gmail.com`
  - `EMAIL_SMTP_PASS` — **Gmail app password** (not the regular account password). Generated from the Google account security settings while 2FA is enabled. The value lives only in `.env.production` on the VPS, never in Git.
  - `EMAIL_DELIVERY_MODE=preview` by default in preprod. Two modes:
    - `preview`: emails are logged at `info` and stored in a local Mailpit if configured, but never sent over SMTP.
    - `send`: real SMTP delivery; an operator opt-in is required to flip to this mode after validation.
  - `EMAIL_TEST_RECIPIENT` (optional): if set, all preprod emails are redirected to this address regardless of the recipient field — useful for end-to-end testing without affecting real broker contacts.
- **Reason**: confirmed by product. Gmail SMTP is acceptable for preprod volume; production may move to a dedicated transactional provider (Postmark / Resend / SendGrid) in a future spec to avoid Gmail's deliverability quirks and quota limits.
- **Risk**: Gmail can suspend the account if it detects unusual sending patterns. Preview mode mitigates this in preprod.
- **Out of scope of 013**: provisioning a transactional ESP, DKIM/SPF/DMARC alignment for `allianceconsultants.net` (deferred; required before any production rollout).

## Monitoring (CONFIRMED initial)

- **Decision**: Uptime Kuma is the initial monitoring tool.
  - `/admin/system/health` covers DB/Redis/queues.
  - Uptime Kuma probes:
    - `https://api-assurmatch.allianceconsultants.net/admin/system/health` — keyword check on `"ok"`.
    - `https://assurmatch.allianceconsultants.net` — HTTP 200.
    - `https://backoffice-assurmatch.allianceconsultants.net` — HTTP 200/401 acceptable.
    - TCP probes for PostgreSQL `127.0.0.1:5432` and Redis `127.0.0.1:6379`.
  - Notifications: email to operator inbox.
  - Logs remain structured JSON to stdout; Docker log rotation captures them.
- **Sentry** stays optional / future.
- **Reason**: Uptime Kuma is lightweight, self-hostable on the same VPS, and well-suited to multi-domain HTTP probes.

## Backups (CONFIRMED initial: local only)

- **Decision**: PostgreSQL `pg_dump` daily 02:00 UTC; uploads volume `tar.gz` daily 02:30 UTC; retention 14 days **locally only** for the initial setup; symmetric encryption with `gpg --symmetric --cipher-algo AES256` if `BACKUP_PASSPHRASE` is configured. Restore test mandatory before a global go.
- **Storage path**: `/home/deployer/apps/assurmatch/backups/{postgres,uploads}/<date>.{sql.gz,tar.gz}[.gpg]`.
- **Offsite**: deferred. A future spec will document offsite (rsync to remote, rclone to S3-compatible, etc.). Plan documents this as a follow-up improvement.
- **Reason**: confirmed by product. Local backups are sufficient to begin operating; offsite is a hardening step.

## Reference vs operational data split

- **Decision**: two clearly separated tracks.
  - Reference catalogs (countries, currencies, languages, product categories, products, statuses, default flags, regulatory regime templates, consent text *templates*) → versioned in repo as JSON/YAML, applied via `scripts/preprod/seed-reference.ts`.
  - Operational confidential data (real partners, real licenses, real offers, advisor users, contact emails, accreditation documents) → imported from a signed/encrypted bundle on the VPS via `scripts/preprod/import-partners.ts`. Never committed.
- **Reason**: matches the user's explicit instruction. Lets developers work with realistic-looking but synthetic reference data in PRs while keeping confidential data out of the repo and out of CI logs.

## Country and product target lists (CONFIRMED initial)

- **Countries**: 9 CIMA countries.
  - Benin (BJ, XOF, fr, Africa/Porto-Novo, regulatoryFamily=cima)
  - Burkina Faso (BF, XOF, fr, Africa/Ouagadougou, cima)
  - Cameroun (CM, XAF, fr+en, Africa/Douala, cima)
  - Republique Centrafricaine (CF, XAF, fr, Africa/Bangui, cima)
  - Cote d'Ivoire (CI, XOF, fr, Africa/Abidjan, cima)
  - Gabon (GA, XAF, fr, Africa/Libreville, cima)
  - Mali (ML, XOF, fr, Africa/Bamako, cima)
  - Niger (NE, XOF, fr, Africa/Niamey, cima)
  - Senegal (SN, XOF, fr, Africa/Dakar, cima)
  - Default flags fail-closed: `country_public_enabled=false`, `country_quote_enabled=false`, `country_comparison_enabled=false`, `country_broker_onboarding_enabled=false`, `country_ai_enabled=false`, `country_waitlist_enabled=false`.
  - Status: `draft` initially.
- **Products**: full PRD list — `auto`, `moto`, `sante`, `voyage`, `habitation`, `vie-epargne`, `entreprise`, `transport`, `agricole`, `scolaire`, `microassurance`, `credit-caution`, `cyber`, `evenementiel`, `construction`. Any additional product modeled in the PRD is added in the same JSON file.
  - Default flags fail-closed: `product_public_enabled=false`, `product_quote_enabled=false`, `product_comparison_enabled=false`, `product_document_upload_enabled=false`, `product_sensitive_data_enabled=false`, `product_manual_review_required=true`, `product_ai_scoring_enabled=false`, `product_ai_form_assistant_enabled=false`.
- **Adding more countries/products later**: edit the JSON files under `scripts/preprod/seeds/reference/` and re-run the seed; `seed-reference.ts` is idempotent.

## Activation publique

- **Decision**: per-scope and gated. No new activation endpoint. Operators flip flags via the existing `AdminFeatureFlagsController` after passing the per-scope go/no-go checklist.
- **Reason**: minimal change, full audit, matches the constitution.

## Multi-broker routing

- **Decision**: `multi_broker_routing_enabled` stays `false` by default. Enabling is a separate decision with conformity validation.
- **Reason**: deferred per user instruction.

## Reverse proxy (CONFIRMED: Nginx)

- **Decision**: Nginx terminates HTTPS and reverse-proxies each sub-domain to its container.
- **Route map**:
  ```
  assurmatch.allianceconsultants.net            -> 127.0.0.1:3601
  backoffice-assurmatch.allianceconsultants.net -> 127.0.0.1:3602
  api-assurmatch.allianceconsultants.net        -> 127.0.0.1:3600
  ```
- **Per-server-block requirements**:
  - Force HTTP → HTTPS redirect at the listening 80 block.
  - Listen 443 ssl http2.
  - Strict-Transport-Security 1 year with includeSubDomains and preload.
  - X-Frame-Options DENY (back-office), SAMEORIGIN (public if needed).
  - X-Content-Type-Options nosniff.
  - Referrer-Policy strict-origin-when-cross-origin.
  - Content-Security-Policy: refined per surface in tasks.
  - `proxy_set_header Host $host`, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, `proxy_set_header X-Forwarded-Proto $scheme`.
  - For Next.js apps: also set `proxy_http_version 1.1` and the `Upgrade`/`Connection` headers for websockets/HMR (HMR is dev-only; preprod doesn't need it).
- **Certificate strategy**: Let's Encrypt via certbot with `--nginx` plugin, one cert per sub-domain (or a wildcard for `*.allianceconsultants.net` if the DNS provider supports DNS-01).
- **Out of scope of 013**: the actual `/etc/nginx/conf.d/*.conf` files; templates are documented in `docs/preproduction/nginx.md` during /speckit.implement.

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

The following items are confirmed in this update: container topology (B), reverse-proxy (Nginx), domains (sub-domains under allianceconsultants.net), country list (9 CIMA countries), product list (full PRD), SMTP (Gmail with preview mode default), monitoring (Uptime Kuma initial), backup (local 14 days). Remaining items:

1. Operational import format (JSON or CSV — recommendation: JSON; final decision in tasks).
2. Real partner data delivery channel (one-shot bundle vs continuous trickle — operator workflow detail).
3. Custodian list for GitHub secrets and the VPS env file (who holds `GHCR_TOKEN`, the `BACKUP_PASSPHRASE`, and the Gmail app password).
4. Whether a wildcard cert `*.allianceconsultants.net` is available, or three single-host certs are issued (operational choice).
5. Whether to install Mailpit on the VPS for preview-mode email inspection, or rely on logs alone.
6. Confirmation of the production transactional ESP target (Postmark / Resend / SendGrid / other) — for a future spec, not blocking 013.

## Import signature (deferred)

- **Decision**: cryptographic signature of import bundles is **not required for 013**.
- **Why deferred**: keeps the initial setup simple. The security model relies on procedural controls (out-of-Git delivery, file-based ingestion on the VPS, dry-run mandatory, zod validation, SHA-256 manifest checksum, full audit trail).
- **Future hardening**: a separate spec adds ed25519 signing of bundles + verification at ingest. Until then, operational discipline is the control.
