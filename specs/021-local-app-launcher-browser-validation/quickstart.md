# Quickstart: Local App Launcher Browser Validation

## How to see the app locally

Prerequisites:

- Node >= 24.15.0
- Docker Desktop with Docker Compose
- Dependencies installed with `npm install`

Start the local stack from the repository root:

```powershell
cmd /c launch-local.bat
```

Open:

- API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Plateforme/Admin: `http://localhost:3602`
- Mailpit: `http://localhost:8025`

The broker back-office is also launched separately for partner smoke coverage:

- Back-office Courtier: `http://localhost:3603`

The launcher maps local/dev PostgreSQL to `127.0.0.1:55433` and Redis to
`127.0.0.1:56380` so an existing Windows PostgreSQL or Redis on the default
ports is not used accidentally.

Run health checks:

```powershell
npm run local:health
```

Run live browser smoke after the stack is up:

```powershell
npm run test:web:local
```

Stop the stack:

```powershell
cmd /c stop-local.bat
```

## Local bootstrap admin

The launcher does not commit or invent a password. To bootstrap a local admin,
set operator-owned local credentials before launch:

```powershell
$env:LOCAL_BOOTSTRAP_ADMIN_EMAIL = "admin@assurmatch.local"
$env:LOCAL_BOOTSTRAP_ADMIN_PASSWORD = "<local password with 12+ chars>"
cmd /c launch-local.bat
```

The runtime refuses bootstrap when `APP_ENV=production`. Do not use real
production, partner, license, contact or offer data in local bootstrap flows.

## Expected data

`launch-local.bat` runs migrations and `backend/prisma/seed.ts`. The seed creates
synthetic internal reference data and keeps regulated feature flags disabled.

## Troubleshooting

- Port conflict on `3600-3603`: run `cmd /c stop-local.bat`, then retry.
- Docker unavailable: start Docker Desktop and rerun the launcher.
- Mailpit unavailable: check `docker compose ps mailpit` and open `http://localhost:8025`.
- Browser smoke skipped in default web tests: this is expected; run `npm run test:web:local` after launching servers.
