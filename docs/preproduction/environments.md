# Environments

| Env              | NODE_ENV   | APP_ENV         | Notes                                                              |
|------------------|------------|------------------|--------------------------------------------------------------------|
| local            | local      | local           | Developer machine. `.env.example` covers it.                       |
| runtime-smoke    | runtime-smoke | runtime-smoke | Existing dedicated smoke (spec 011). Untouched by 013.             |
| preproduction    | production | preproduction   | New. VPS-hosted. NODE_ENV=production for runtime correctness.       |
| production       | production | production      | Spec 057: `docker-compose.production.yml`, per-app env files, see `docs/runbooks/deployment-production.md`. |

## Mandatory variables (as actually read by the code, audited by spec 057)

```
NODE_ENV, APP_ENV, PORT
DATABASE_URL, REDIS_URL                       (boot fails without them outside local/test)
ENCRYPTION_KEY (>= 32 bytes)                  (boot fails without it in preproduction/production)
ASSURMATCH_AUTH_TOKEN_SECRET (>= 32 chars)    (no back-office login possible without it)
CORS_ORIGINS                                  (public site origin; see below)
APP_BASE_URL, PUBLIC_APP_URL, BROKER_APP_URL  (links written into e-mails)
TRUSTED_PROXY_HOPS                            (optional, default 1 = nginx; 0..5, boot fails otherwise)
```

**Declared historically but never read by the code**: `JWT_SECRET`, `SESSION_SECRET`,
`BACKOFFICE_APP_URL`, `API_BASE_URL`, `LOCAL_STORAGE_ROOT`, `COOKIE_DOMAIN`, `LOG_LEVEL`,
`RATE_LIMIT_*`, `S3_*` without the `ASSURMATCH_` prefix, `MFA_REQUIRED` and most `*_ENABLED` (feature
flags live in the database). `scripts/preprod/pre-deploy-check.sh` still requires some of them for
the preproduction env file; production uses `scripts/production/pre-deploy-check.sh`, aligned with
the code. Documents use `ASSURMATCH_DOCUMENT_STORAGE`, `ASSURMATCH_S3_*`, `ASSURMATCH_ANTIVIRUS`,
`ASSURMATCH_CLAMAV_*` (see `.env.production.api.example`).

The frontends read only `NEXT_PUBLIC_*` values, **compiled at `next build`**: images built without
build arguments fall back to `http://127.0.0.1:3000` for the API. Pass them as build arguments
(see the Dockerfiles). In CI, the `build-images` job (whose frontend images are the ones deployed
to preproduction) reads them from the repository variables `PREPROD_API_URL`, `PREPROD_PUBLIC_URL`
and `PREPROD_BROKER_URL` (Settings > Secrets and variables > Actions > Variables) and warns when
one is missing; production frontends are rebuilt with the `PROD_*` variables.

`CORS_ORIGINS` is a comma-separated allowlist of browser origins permitted to call the API
cross-origin, and it must list the Web Publique Client's origin: the visitor's browser submits the
quote request itself, so without it the preflight fails and no quote can be sent, while curl and
every server-side call keep working. The two back-offices call the API from their own server and do
not need an entry. Outside `APP_ENV=local` an unset value means no cross-origin browser call is
allowed at all; `*` is never accepted.

## Email (Gmail SMTP, preview default)

```
EMAIL_SERVICE_TYPE=smtp
EMAIL_FROM=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=rotaryabidjan2plateaux@gmail.com
EMAIL_SMTP_PASS=REDACTED   # Gmail app password — never in Git
EMAIL_PREVIEW_MODE=true # true = preview, false = real SMTP send
EMAIL_TEST_RECIPIENT=
```

The Gmail account must have 2FA enabled and a 16-char **app password** generated in Google account
settings. `EMAIL_PREVIEW_MODE=true` does NOT call Gmail; switch it to `false` only after compliance signoff.

## GitHub secrets (historical; the current workflow uses the self-hosted runner and `github.token`)

- `GHCR_TOKEN` — PAT with `write:packages`.
- `VPS_HOST`, `VPS_SSH_USER` (typically `deployer`).
- `VPS_SSH_PRIVATE_KEY` — OpenSSH-format key.
- `VPS_KNOWN_HOSTS` — VPS host key.
- `DEPLOY_NETWORK_NAME` — optional Docker network name on the VPS.

## Memory adapters (must remain false in preprod and production)

```
ASSURMATCH_PRISMA_MEMORY=false
ASSURMATCH_REDIS_MEMORY=false
ASSURMATCH_QUEUE_MEMORY=false
ASSURMATCH_AUDIT_MEMORY=false
```
