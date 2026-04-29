# Quickstart: Auth and Users Persistence

Implementation status: 014 auth/users persistence includes Prisma user runtime wiring, argon2id password hashing, encrypted TOTP MFA, admin lifecycle endpoints, back-office auth clients and bootstrap safeguards.

Use Node.js `>=24.15.0` for all commands. On this workstation, prepend the WinGet Node directory before validation:

```powershell
$env:Path="C:\Users\BABA\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64;$env:Path"
node -v # v24.15.0
```

## A. Locally test the auth flow

```bash
# 1. Start the preprod stack
docker compose -f docker-compose.preproduction.yml up -d

# 2. Apply the auth/users migration
MSYS_NO_PATHCONV=1 docker compose -f docker-compose.preproduction.yml run --rm assurmatch-app \
  npx prisma migrate deploy --schema /app/backend/prisma/schema.prisma

# 3. Set bootstrap env vars in docker-compose.preproduction.yml or .env.preproduction
#    LOCAL_BOOTSTRAP_ADMIN_EMAIL=admin@assurmatch.local
#    LOCAL_BOOTSTRAP_ADMIN_PASSWORD=<choose a 12+ char password>
docker compose -f docker-compose.preproduction.yml restart assurmatch-app

# 4. Watch the logs for bootstrap created/skipped/refused state
docker compose -f docker-compose.preproduction.yml logs assurmatch-app | grep bootstrap
```

Migration path: `backend/prisma/migrations/0005_auth_users_persistence/migration.sql`.

## B. Log in via the back-office

```text
Browse:   http://localhost:3602/login
Email:    admin@assurmatch.local
Password: <the value of LOCAL_BOOTSTRAP_ADMIN_PASSWORD>
```

The bootstrap admin starts with `mfaStatus=required`. Log in, call `/auth/mfa/enroll`, scan the returned `otpauthUri`, then verify at `/auth/mfa/verify`. No MFA secret, password or backup code is written to logs.

## C. Create a regular admin

```bash
curl -X POST https://localhost:3600/admin/users \
  -H "Authorization: Bearer <mfa-verified-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "compliance@assurmatch.local",
    "displayName": "Compliance Officer",
    "roles": ["compliance_admin"],
    "scopes": { "countryIds": [], "productIds": [] },
    "reason": "onboarding compliance"
  }'
```

If SMTP is configured, the activation email lands in Mailpit. Otherwise, the response payload contains `activationToken` once.

## D. Activate the new user

```bash
curl -X POST https://localhost:3600/auth/activate \
  -H "Content-Type: application/json" \
  -d '{ "token": "<activation-token>", "password": "<12+ char password>" }'
```

## E. Password change and reset

```bash
curl -X POST https://localhost:3600/auth/password-change \
  -H "Authorization: Bearer <mfa-verified-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "oldPassword": "<current password>", "newPassword": "<new 12+ char password>" }'

curl -X POST https://localhost:3600/admin/users/<user-id>/password-reset \
  -H "Authorization: Bearer <mfa-verified-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "verified support reset request" }'

curl -X POST https://localhost:3600/auth/password-reset \
  -H "Content-Type: application/json" \
  -d '{ "token": "<reset-token>", "newPassword": "<new 12+ char password>" }'
```

## F. Enrol MFA for the new user

```bash
TOKEN=$(curl -X POST https://localhost:3600/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "compliance@assurmatch.local", "password": "..." }' | jq -r .accessToken)

curl -X POST https://localhost:3600/auth/mfa/enroll \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
# Response includes secret + otpauthUri + backupCodes once.

curl -X POST https://localhost:3600/auth/mfa/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "code": "<6-digit TOTP>" }'
```

## G. Validate locally

```bash
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

Expected focused auth/user status from implementation: typecheck passes under Node 24.15.0, focused auth/user tests pass, and source-marker Playwright auth separation tests pass.

## H. Production safety

- `APP_ENV=production` plus bootstrap env vars is a fatal startup error and audits `local_bootstrap_admin.refused_in_production`.
- Migration is non-breaking on existing rows; rollback uses the standard database backup procedure.
- `ENCRYPTION_KEY` is mandatory in preproduction and production.
