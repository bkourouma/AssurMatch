# Contract: Runtime Smoke Docker Compose Commands

## Compose Contract

The repository exposes a dedicated Docker Compose file:

```text
docker-compose.runtime-smoke.yml
```

Required services:

| Service | Host Port | Purpose |
|---------|-----------|---------|
| `runtime-smoke-postgres` | `55432` | Dedicated PostgreSQL smoke database |
| `runtime-smoke-redis` | `56379` | Dedicated Redis smoke service |

Required smoke database:

```text
assurmatch_runtime_smoke
```

Required non-sensitive credentials:

```text
user: assurmatch_smoke
password: assurmatch_smoke
```

## Npm Command Contract

### Start

```powershell
npm run test:runtime:postgres:up
```

Starts only the runtime smoke Compose services.

### Run Existing Smoke Against Dedicated Environment

```powershell
npm run test:runtime:postgres
```

Runs the existing runtime PostgreSQL smoke with a safe default environment:

```text
NODE_ENV=runtime-smoke
APP_ENV=runtime-smoke
ASSURMATCH_RUNTIME_SMOKE=true
DATABASE_URL=postgresql://assurmatch_smoke:***@localhost:55432/assurmatch_runtime_smoke
REDIS_URL=redis://localhost:56379
```

### Full Lifecycle

```powershell
npm run test:runtime:postgres:docker
```

Starts the smoke services, runs the runtime smoke, then stops services. The
cleanup behavior is documented and must not target non-smoke resources.

### Stop

```powershell
npm run test:runtime:postgres:down
```

Stops smoke containers while keeping volumes unless cleanup is requested.

### Cleanup

```powershell
npm run test:runtime:postgres:clean
```

Stops smoke containers and removes smoke-scoped volumes.

## Guardrail Contract

The smoke runner must fail before migrations, seed or HTTP calls when:

- `NODE_ENV=test`
- `DATABASE_URL` is missing or invalid
- database name does not include `smoke`
- query parameter `schema=runtime_smoke` is present
- target is `localhost:5432` or `127.0.0.1:5432` without explicit override
- target appears production-like: `prod`, `production`, `staging`, `preprod`,
  `live`
- any environment variable matching `ASSURMATCH_*_MEMORY=true` is present

The error message must be clear and must not print the full password-bearing
`DATABASE_URL`.
