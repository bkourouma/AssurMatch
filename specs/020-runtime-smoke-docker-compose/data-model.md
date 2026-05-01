# Data Model: Runtime Smoke Docker Compose

This feature introduces no persistent business data model, Prisma schema change
or migration. The entities below are operational contracts used by scripts,
guardrails and documentation.

## RuntimeSmokeEnvironment

**Purpose**: Represents one disposable runtime smoke environment.

**Fields**:
- `projectName`: Docker Compose project name, default
  `assurmatch-runtime-smoke`
- `postgresPort`: host port, default `55432`
- `redisPort`: host port, default `56379`
- `databaseUrl`: sanitized PostgreSQL target for smoke
- `redisUrl`: Redis smoke target
- `nodeEnv`: must be `runtime-smoke`
- `runtimeSignal`: `ASSURMATCH_RUNTIME_SMOKE=true`

**Validation Rules**:
- Must not use `NODE_ENV=test`
- Must not target `localhost:5432` or `127.0.0.1:5432` by default
- Must not contain production-like names
- Must not allow `ASSURMATCH_*_MEMORY=true`

## SmokePostgresService

**Purpose**: Dedicated PostgreSQL service for the runtime smoke.

**Fields**:
- `image`: PostgreSQL container image
- `hostPort`: `55432`
- `databaseName`: `assurmatch_runtime_smoke`
- `username`: non-sensitive smoke user
- `password`: non-sensitive smoke password
- `volume`: smoke-scoped Docker volume

**Validation Rules**:
- Database name must include `smoke`
- Credentials must be local/CI-only examples
- Service must be distinguishable from normal local PostgreSQL

## SmokeRedisService

**Purpose**: Dedicated Redis service for runtime smoke dependencies.

**Fields**:
- `image`: Redis container image
- `hostPort`: `56379`
- `url`: `redis://localhost:56379`

**Validation Rules**:
- Must not silently fall back to `6379`
- Must be scoped to smoke compose lifecycle

## RuntimeSmokeGuardrail

**Purpose**: Executable validation run before migrations, seed or HTTP smoke.

**Fields**:
- `databaseUrl`
- `nodeEnv`
- `allowLocal5432`
- `memoryEnvKeys`
- `productionMarkers`

**Validation Rules**:
- Reject invalid or missing `DATABASE_URL`
- Reject database names without `smoke`
- Reject `schema=runtime_smoke`
- Reject production-like targets: `prod`, `production`, `staging`, `preprod`,
  `live`
- Reject `localhost:5432` and `127.0.0.1:5432` unless explicitly overridden
- Reject any `ASSURMATCH_*_MEMORY=true`

## SmokeLifecycleCommand

**Purpose**: Operator-facing npm command.

**States**:
- `up`: start services
- `test`: execute runtime PostgreSQL smoke against dedicated services
- `down`: stop services
- `cleanup`: stop services and remove smoke volumes

**Validation Rules**:
- Commands must be idempotent where possible
- Cleanup must only target smoke-scoped resources
- Output must not print full credentials
