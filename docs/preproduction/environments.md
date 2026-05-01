# Environments

| Env              | NODE_ENV   | APP_ENV         | Notes                                                              |
|------------------|------------|------------------|--------------------------------------------------------------------|
| local            | local      | local           | Developer machine. `.env.example` covers it.                       |
| runtime-smoke    | runtime-smoke | runtime-smoke | Existing dedicated smoke (spec 011). Untouched by 013.             |
| preproduction    | production | preproduction   | New. VPS-hosted. NODE_ENV=production for runtime correctness.       |
| production       | production | production      | Reserved. Not activated by spec 013.                               |

## Mandatory variables (boot fails on missing)

```
NODE_ENV, APP_ENV, PORT
DATABASE_URL, REDIS_URL
JWT_SECRET (>= 32 bytes), SESSION_SECRET (>= 32 bytes)
PUBLIC_APP_URL, BACKOFFICE_APP_URL, API_BASE_URL, CORS_ORIGINS
LOCAL_STORAGE_ROOT
```

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

## GitHub secrets (required for build-and-deploy)

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
