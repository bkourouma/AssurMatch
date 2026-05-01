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

## Data Safety

The launcher runs Prisma migrations and the existing seed. Seeded records are
synthetic/internal and regulated feature flags remain disabled by default.
