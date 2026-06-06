# Local App Quickstart

## How to see the app locally

From `D:\APP\AssurMatch`, start the full local stack:

```powershell
cmd /c launch-local.bat
```

Open these URLs:

- API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Plateforme/Admin: `http://localhost:3602`
- Mailpit: `http://localhost:8025`

The broker back-office remains a separate authenticated app for constitutional
separation and is launched at `http://localhost:3603`.

The launcher maps local/dev PostgreSQL to `127.0.0.1:55433` and Redis to
`127.0.0.1:56380` to avoid collisions with default services already installed
on Windows machines.

Useful checks:

```powershell
npm run local:health
npm run test:web:local
```

Stop local processes and Docker services without deleting local volumes:

```powershell
cmd /c stop-local.bat
```

## Bootstrap Admin

The launcher never commits or prints a bootstrap password. To create a local
admin, set credentials in your shell before launching:

```powershell
$env:LOCAL_BOOTSTRAP_ADMIN_EMAIL = "admin@assurmatch.local"
$env:LOCAL_BOOTSTRAP_ADMIN_PASSWORD = "<local password with 12+ chars>"
cmd /c launch-local.bat
```

The runtime refuses local bootstrap when `APP_ENV=production`.

## Broker Demo Data

The broker back-office can be populated with synthetic local-only broker data
for UX review. Start the local stack first, then run:

```powershell
$env:APP_ENV = "local"
$env:DATABASE_URL = "postgresql://assurmatch:assurmatch@127.0.0.1:55433/assurmatch"
$env:LOCAL_DEMO_BROKER_PASSWORD = "<local password with 12+ chars>"
npm run local:seed:broker-demo
```

Demo broker users:

- `starter.owner@broker.example`
- `pro.owner@broker.example`
- `pro.manager@broker.example`
- `pro.agent@broker.example`
- `pro.readonly@broker.example`
- `enterprise.owner@broker.example`

To verify the CRM unavailable state for Pro/Enterprise brokers:

```powershell
npm run local:seed:broker-demo:crm-off
```

The seed refuses production/preproduction, uses fake data only, keeps regulated
modules disabled and does not change the Prisma schema.

## Data Safety

The launcher runs Prisma migrations and the existing seed. Seeded records are
synthetic/internal and regulated feature flags remain disabled by default.
