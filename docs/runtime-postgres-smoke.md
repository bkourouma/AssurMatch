# Runtime PostgreSQL Smoke Tests

This suite proves that the AssurMatch backend can start outside `NODE_ENV=test`
with real PostgreSQL and Prisma-runtime repositories.

## Required Environment

```powershell
$env:NODE_ENV="runtime-smoke"
$env:APP_ENV="runtime-smoke"
$env:ASSURMATCH_RUNTIME_SMOKE="true"
$env:DATABASE_URL="postgresql://assurmatch:assurmatch@localhost:5432/assurmatch_runtime_smoke"
```

`DATABASE_URL` must point to a dedicated smoke database and include a smoke
marker in the database name or query string. Production-like targets are
rejected before migrations or seed.

`REDIS_URL` is optional for this PostgreSQL smoke suite. If supplied, it must
point to a disposable runtime-smoke Redis instance.

## Local Docker

```powershell
docker compose up -d postgres
```

Create a dedicated database such as `assurmatch_runtime_smoke` in that
PostgreSQL instance, then run:

```powershell
npm run test:runtime:postgres
```

## Covered Scenarios

- runtime health via `GET /admin/system/health`;
- Prisma-runtime repository guard;
- public catalog from PostgreSQL;
- consented `POST /quote-requests` with DB verification;
- no-consent refusal;
- Broker Starter tenant isolation;
- Broker CRM Pro enabled and disabled by persisted `broker_crm_enabled`;
- sensitive feature flags fail-closed;
- durable audit in DB and admin audit endpoint.

## Cleanup

Every run uses a generated smoke run id and synthetic data. Cleanup is scoped to
that run id, synthetic prefixes and related IDs. Set
`ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA=true` only for debugging a dedicated smoke
database.

## CI

CI can run this as a separate job with an ephemeral PostgreSQL service, migration
deploy, then `npm run test:runtime:postgres`. Keep logs sanitized; the runner
does not print full credentials.
