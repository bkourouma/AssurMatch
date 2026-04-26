# Quickstart: Runtime PostgreSQL Smoke Tests

This quickstart describes the intended local and CI flow for spec 011. It is a
plan artifact only; implementation may adjust exact script names while keeping
the safety contract.

## Purpose

Run a dedicated smoke suite that starts the backend outside `NODE_ENV=test`,
uses PostgreSQL through Prisma, calls real HTTP routes and verifies rows
directly in the smoke database.

Do not run this against production, staging shared data or real PII.

## Local PostgreSQL Option With Docker Compose

Start the repository services:

```powershell
docker compose up -d postgres
```

Create or choose a dedicated smoke database inside PostgreSQL, for example:

```powershell
$env:DATABASE_URL="postgresql://assurmatch:assurmatch@localhost:5432/assurmatch_runtime_smoke"
```

If the database does not exist yet, create it with your preferred PostgreSQL
client. The smoke database name must clearly include `smoke` or another
accepted marker.

## External PostgreSQL Option

Use any PostgreSQL instance if the URL is dedicated to smoke data:

```powershell
$env:DATABASE_URL="postgresql://user:password@host:5432/assurmatch_runtime_smoke"
```

The future script must reject URLs that look like production, staging or shared
non-smoke databases.

## Required Environment

```powershell
$env:NODE_ENV="runtime-smoke"
$env:ASSURMATCH_RUNTIME_SMOKE="true"
$env:DATABASE_URL="postgresql://assurmatch:assurmatch@localhost:5432/assurmatch_runtime_smoke"
$env:BULLMQ_PREFIX="assurmatch-runtime-smoke"
```

`REDIS_URL` is optional for the PostgreSQL smoke suite. If it is set, point it
to a disposable runtime-smoke Redis instance; otherwise the suite focuses on the
Prisma/PostgreSQL repository proof.

Ensure memory overrides are not enabled:

```powershell
Remove-Item Env:\ASSURMATCH_PRISMA_MEMORY -ErrorAction SilentlyContinue
Remove-Item Env:\ASSURMATCH_REDIS_MEMORY -ErrorAction SilentlyContinue
Remove-Item Env:\ASSURMATCH_QUEUE_MEMORY -ErrorAction SilentlyContinue
Remove-Item Env:\ASSURMATCH_AUDIT_MEMORY -ErrorAction SilentlyContinue
```

## Migration Validation

The future smoke script should run these steps or their npm equivalents:

```powershell
npx prisma validate
npx prisma migrate deploy
```

The suite must stop before seeding if migrations fail or the schema is not
valid.

## Run Smoke Suite

Recommended command:

```powershell
npm run test:runtime:postgres
```

The implemented command uses `node --import tsx backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts`.
It sets a default `NODE_ENV=runtime-smoke` only when `NODE_ENV` is absent, and
it refuses to continue if `NODE_ENV=test`, `ASSURMATCH_RUNTIME_SMOKE` is not
`true`, memory overrides are enabled, or `DATABASE_URL` does not look like a
dedicated smoke PostgreSQL target.

Expected high-level phases:

1. Validate smoke environment and DATABASE_URL safety.
2. Validate/apply migrations.
3. Start NestJS backend on an ephemeral port.
4. Verify repositories are Prisma-runtime.
5. Seed synthetic smoke data.
6. Call real HTTP routes.
7. Verify PostgreSQL rows with PrismaClient.
8. Clean or isolate smoke data.

## Scenarios Covered

- Health/runtime via `GET /admin/system/health` or existing equivalent.
- Public catalog via `GET /countries`,
  `GET /countries/:countryCode/products` and
  `GET /countries/:countryCode/products/:productKey/offers`.
- Consented `POST /quote-requests` with direct DB verification.
- No-consent `POST /quote-requests` refusal and absence of non-compliant rows.
- Broker Starter tenant isolation through `GET /broker/starter/leads`.
- Broker CRM Pro success when `broker_crm_enabled=true`.
- Broker CRM Pro refusal when `broker_crm_enabled=false` or absent.
- Persisted feature flags and fail-closed sensitive defaults.
- Durable `AuditLog` verified in DB and optionally through admin audit endpoint.

## Cleanup

Every run creates a smoke run id. Data must be tagged or prefixed by that id and
cleaned with scoped filters only.

If debugging is needed, a future option may keep data:

```powershell
$env:ASSURMATCH_RUNTIME_SMOKE_KEEP_DATA="true"
npm run test:runtime:postgres
```

When keeping data, record the run id and clean it later with the documented
cleanup helper. Never delete without a smoke run id or prefix.

## Optional CI Strategy

A future CI job can:

1. Provision PostgreSQL service.
2. Create an ephemeral smoke database.
3. Set `NODE_ENV=runtime-smoke` and `ASSURMATCH_RUNTIME_SMOKE=true`.
4. Run schema validation and migrations.
5. Run `npm run test:runtime:postgres`.
6. Upload sanitized logs and test output.

Keep this job separate from fast unit/integration checks until stable.

## Troubleshooting

- **Suite says NODE_ENV=test**: ensure the smoke runner is not using the default
  test command that forces test mode.
- **DATABASE_URL rejected**: use a dedicated PostgreSQL DB whose name or marker
  clearly identifies it as smoke.
- **Memory repository detected**: check `NODE_ENV`, memory override env vars and
  runtime provider bindings.
- **CRM still allowed after disabling flag**: invalidate feature flag cache,
  restart the smoke app between flag checks or use the documented runtime cache
  refresh path.
- **Cleanup failed**: rerun cleanup with the printed smoke run id; do not use
  broad deletes.
- **Audit rows remain**: this can be intentional when audit deletion is not
  acceptable. They must be isolated by smoke run id.
