# Contract: Local App Launcher

## Commands

- `launch-local.bat`: Windows entry point that starts local infrastructure, migrates/seeds data and launches app processes.
- `stop-local.bat`: Windows entry point that stops documented app ports and local Docker services.
- `npm run local:health`: executable local health check.
- `npm run test:web:local`: opt-in Playwright browser smoke against local running servers.

## URLs

- API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Plateforme/Admin: `http://localhost:3602`
- Back-office Courtier auxiliary: `http://localhost:3603`
- Mailpit: `http://localhost:8025`

## Environment

- `APP_ENV=local`
- `NODE_ENV=development`
- `DATABASE_URL=postgresql://assurmatch:***@127.0.0.1:55433/assurmatch`
- `REDIS_URL=redis://127.0.0.1:56380`
- `EMAIL_SERVICE_TYPE=mailpit`
- `EMAIL_FROM=local@assurmatch.local`

Bootstrap admin credentials are never part of the default contract. Operators may set `LOCAL_BOOTSTRAP_ADMIN_EMAIL` and `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` in their shell before launching.

## Refusals

- Production-like `APP_ENV` must not be used by the local launcher.
- Missing Docker, occupied app ports or failed migrations must stop launch before misleading browser validation.
- Browser smoke must skip unless explicitly enabled or invoked by `npm run test:web:local`.
