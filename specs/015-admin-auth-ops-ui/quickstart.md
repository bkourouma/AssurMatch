# Quickstart: Admin/Auth Operations UI Batch

## Requirements

- Node.js v24.15.0 or newer.
- Docker Desktop for the preproduction local path.
- No real secrets are stored in this repository. Batch scripts use local-only placeholder values.

## Local memory-backed stack

Use this when you only need UI/API smoke testing without PostgreSQL persistence:

```powershell
cmd /c launch-local.bat
cmd /c stop-local.bat
```

URLs:
- Public: `http://127.0.0.1:3701`
- Admin: `http://127.0.0.1:3702/login`
- Broker: `http://127.0.0.1:3703/login`
- API: `http://127.0.0.1:3700`

## Local preproduction runtime stack

Use this when you need PostgreSQL, Redis, Prisma migrations and Mailpit:

```powershell
cmd /c launch-preprod.bat
cmd /c stop-preprod.bat
```

`launch-preprod.bat` performs:
- `docker compose up -d postgres redis minio mailpit`
- `npx prisma migrate deploy --schema backend/prisma/schema.prisma`
- API launch on `http://127.0.0.1:3700`
- public/admin/broker Next dev apps on ports `3701`, `3702`, `3703`

Mailpit is available at `http://127.0.0.1:8025`. Activation and password reset emails can be verified there when SMTP is configured to `127.0.0.1:1025`.

## Bootstrap admin

The local preproduction script does not store or print a bootstrap password.
Set the bootstrap values in your shell before running the script when a fresh
database needs its first Super Admin:

```powershell
$env:LOCAL_BOOTSTRAP_ADMIN_EMAIL="admin@assurmatch.local"
$env:LOCAL_BOOTSTRAP_ADMIN_PASSWORD="<choose a 12+ character local password>"
cmd /c launch-preprod.bat
```

After first login, complete MFA at `/mfa`, then rotate the password at `/password-change`.

## Admin user management

- List/create users: `http://127.0.0.1:3702/users`
- Detail/update/lifecycle actions: `http://127.0.0.1:3702/users/<userId>`
- Every sensitive action requires a reason and is enforced/audited by the backend.

## Broker account operations

- Account security: `http://127.0.0.1:3703/account`
- Tenant-safe team listing: `http://127.0.0.1:3703/team`
