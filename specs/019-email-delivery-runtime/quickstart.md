# Quickstart: Email Delivery Runtime

## Local safe mode

```powershell
$env:EMAIL_SERVICE_TYPE="disabled"
npm run test:integration -- backend/tests/integration/auth
```

Disabled mode sends no email and keeps existing one-time admin token preview
fallback for activation/reset flows.

## Local/preproduction Mailpit verification

Start the preproduction helper or Docker services:

```powershell
cmd /c launch-preprod.bat
```

Mailpit UI is available at `http://127.0.0.1:8025` and SMTP capture at
`127.0.0.1:1025`. Configure:

```text
EMAIL_SERVICE_TYPE=mailpit
EMAIL_FROM=no-reply@assurmatch.local
EMAIL_SMTP_HOST=127.0.0.1
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_PREVIEW_MODE=true
```

Then create an admin user or issue a password reset from the back-office/admin
API. Mailpit should show one activation or reset email per token issuance.

## SMTP/Gmail app password boundary

For a production-like SMTP test, provide values via runtime environment or a
secret manager only:

```text
EMAIL_SERVICE_TYPE=smtp
EMAIL_FROM=AssurMatch <no-reply@example.com>
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=REDACTED
EMAIL_SMTP_PASS=REDACTED
EMAIL_SEND_TIMEOUT_MS=5000
```

Gmail requires an app password for SMTP. Do not store the real password in
`.env.example`, `.env.preproduction.example`, batch scripts, docs, logs, tests
or Git history. Gmail is acceptable for low-volume validation, but a dedicated
transactional provider is recommended before larger production volume.

## Final validation checklist

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:web
npm run build
npx prisma validate --schema backend/prisma/schema.prisma
npm audit --audit-level=high
git diff --check
npm run test:runtime:postgres
```

Also run a secret scan or equivalent search confirming no real
`EMAIL_SMTP_PASS` or Gmail app password is committed.
