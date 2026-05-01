# Quickstart: Runtime Smoke Docker Compose

## Prerequisites

- Node >=24.15.0
- npm dependencies installed
- Docker with `docker compose`

## Start The Dedicated Smoke Services

```powershell
npm run test:runtime:postgres:up
```

Expected dedicated ports:

- PostgreSQL: `localhost:55432`
- Redis: `localhost:56379`

## Run The Runtime PostgreSQL Smoke

```powershell
npm run test:runtime:postgres
```

The command sets safe smoke defaults when values are not already provided. The
sanitized target looks like:

```text
NODE_ENV=runtime-smoke
APP_ENV=runtime-smoke
ASSURMATCH_RUNTIME_SMOKE=true
DATABASE_URL=postgresql://assurmatch_smoke:***@localhost:55432/assurmatch_runtime_smoke
REDIS_URL=redis://localhost:56379
```

## Full Lifecycle

```powershell
npm run test:runtime:postgres:docker
```

This starts the dedicated services, runs the runtime smoke and stops the
containers afterward.

## Stop Or Cleanup

```powershell
npm run test:runtime:postgres:down
npm run test:runtime:postgres:clean
```

Use `down` to stop containers and keep smoke volumes. Use `clean` to remove
smoke volumes too.

## Guardrails

The smoke refuses:

- `NODE_ENV=test`
- `DATABASE_URL` without `smoke` in the database name
- `DATABASE_URL` with `?schema=runtime_smoke`
- `localhost:5432` or `127.0.0.1:5432` by default
- production-like names such as `prod`, `production`, `staging`, `preprod` or
  `live`
- any `ASSURMATCH_*_MEMORY=true`

If `55432` or `56379` is already occupied, free the port before running the
smoke. Do not fall back to `5432` or `6379`.

## CI Usage

A CI job can run:

```bash
npm ci
npm run test:runtime:postgres:up
npm run test:runtime:postgres
npm run test:runtime:postgres:down
```

If a CI runner cannot run Docker, validate guardrail tests and scripts, then run
the same commands on an environment where Docker is available.
