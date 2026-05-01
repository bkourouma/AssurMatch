# Runtime PostgreSQL Smoke Tests

This suite proves that the AssurMatch backend can start outside `NODE_ENV=test`
with real PostgreSQL and Prisma-runtime repositories. It must run against the
dedicated runtime smoke Docker Compose environment by default, not a local
PostgreSQL service on `5432`.

## Dedicated Docker Smoke Environment

Start PostgreSQL and Redis smoke services:

```powershell
npm run test:runtime:postgres:up
```

Default smoke targets:

```text
PostgreSQL: localhost:55432
Redis:      localhost:56379
Database:   assurmatch_runtime_smoke
User:       assurmatch_smoke
Password:   assurmatch_smoke
```

The credentials above are non-sensitive local/CI smoke credentials. Do not
replace them with production, staging, preproduction or personal credentials.

## Run The Smoke

```powershell
npm run test:runtime:postgres
```

The npm wrapper provides safe defaults when the operator has not already set
them. The sanitized target looks like:

```text
NODE_ENV=runtime-smoke
APP_ENV=runtime-smoke
ASSURMATCH_RUNTIME_SMOKE=true
DATABASE_URL=postgresql://assurmatch_smoke:***@localhost:55432/assurmatch_runtime_smoke
REDIS_URL=redis://localhost:56379
```

The runner logs a sanitized database target and never needs the Windows/local
PostgreSQL service on `127.0.0.1:5432`.

## Full Local Lifecycle

```powershell
npm run test:runtime:postgres:docker
```

This starts the dedicated Docker services, runs the runtime PostgreSQL smoke and
stops the smoke containers afterward.

## Stop And Cleanup

Stop smoke containers while keeping smoke volumes:

```powershell
npm run test:runtime:postgres:down
```

Stop smoke containers and remove smoke-scoped volumes:

```powershell
npm run test:runtime:postgres:clean
```

Both commands use the dedicated Compose project and file. They must not target
non-smoke Docker resources.

## Guardrails

The smoke refuses to start before migrations, seed or HTTP calls when:

- `NODE_ENV=test`;
- `DATABASE_URL` is missing or invalid;
- the database name does not contain `smoke`;
- `DATABASE_URL` contains `schema=runtime_smoke`;
- the target is `localhost:5432` or `127.0.0.1:5432` without explicit override;
- the target looks production-like, including `prod`, `production`, `staging`,
  `preprod` or `live`;
- any `ASSURMATCH_*_MEMORY=true` variable is present.

If an operator explicitly allows `localhost:5432` for a dedicated smoke
database, the override must be documented in that environment. It is never the
default.

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

## Port Conflicts

If `55432` or `56379` is already occupied, the Docker start command fails. Free
the port or set an explicit smoke port override for both the Compose command and
the smoke runner. Do not fall back to `5432` or `6379`.

## CI

CI can run the same command contract:

```bash
npm ci
npm run test:runtime:postgres:up
npm run test:runtime:postgres
npm run test:runtime:postgres:down
```

If Docker is unavailable in a runner, validate the guardrail tests and run the
Docker smoke on a Docker-capable runner. This is an environment limitation, not
a code failure.
