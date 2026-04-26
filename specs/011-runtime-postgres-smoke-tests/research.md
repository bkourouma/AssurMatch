# Research: Runtime PostgreSQL Smoke Tests AssurMatch

## Decision 1: Use a dedicated non-test runtime environment

**Decision**: Use `NODE_ENV=runtime-smoke` plus
`ASSURMATCH_RUNTIME_SMOKE=true` for the smoke suite.

**Rationale**: `AssurMatchRuntime` currently selects Prisma repositories when
`NODE_ENV !== "test"`. The smoke suite must therefore be explicitly outside
test mode while still opt-in and recognizable by config validation, logs and
operator intent.

**Alternatives considered**:
- `NODE_ENV=production`: rejected because local/CI smoke should not inherit
  production assumptions or risk production database targeting.
- `NODE_ENV=local`: rejected because it is too easy to confuse with ordinary
  development runs and lacks a clear destructive-test signal.
- Only `ASSURMATCH_RUNTIME_SMOKE=true`: rejected because some libraries and
  project checks already key off `NODE_ENV`.

## Decision 2: Require explicit smoke DATABASE_URL with safety heuristics

**Decision**: Require `DATABASE_URL` to be present, PostgreSQL-based and
smoke-identifiable, with fail-fast rejection of production/staging-looking
hosts, database names or connection metadata.

**Rationale**: The suite seeds and cleans data. It must never run against
production or shared data. A smoke marker in the DB name, schema, query param or
configured allow-list makes accidental misuse much less likely.

**Alternatives considered**:
- Use the default local `assurmatch` database: rejected because it can contain
  non-smoke development data and makes cleanup risky.
- Allow any local PostgreSQL URL: rejected because host alone is insufficient to
  prove safety.
- Rely only on operator discipline: rejected because the spec explicitly
  requires production protection.

## Decision 3: Apply migrations with deploy-style semantics

**Decision**: Validate schema and use deploy-style migration application against
the smoke database before seeding.

**Rationale**: Smoke tests should prove a fresh runtime database can run with
the committed migrations. Development migration generation is out of scope and
should not occur during smoke.

**Alternatives considered**:
- `migrate dev`: rejected because it can create migrations and is a development
  workflow, not a smoke validation workflow.
- Skip migrations and assume the DB is ready: rejected because the smoke suite
  must prove runtime readiness.
- Reset/drop database on every run: rejected as a default because it increases
  destructive risk; it can remain an optional local cleanup path for a known
  smoke DB.

## Decision 4: Reuse Docker Compose PostgreSQL, but do not require Docker

**Decision**: Document the existing root `docker-compose.yml` PostgreSQL service
as the default local option, while allowing any safe PostgreSQL instance through
explicit `DATABASE_URL`.

**Rationale**: The repository already provides PostgreSQL, Redis and MinIO
services. Reusing them lowers setup cost. CI and some local environments may
prefer managed or pre-existing PostgreSQL, so the plan should not hard-require
Docker.

**Alternatives considered**:
- Add a new Compose file immediately: deferred until implementation proves it
  is needed.
- Require Docker only: rejected because CI and developer machines can provide
  PostgreSQL differently.
- Use SQLite or in-memory DB: rejected because the feature is specifically
  PostgreSQL runtime proof.

## Decision 5: Start the real Nest app on an ephemeral port

**Decision**: Start `AppModule` via `NestFactory`, listen on port `0`, and call
routes with real `fetch` requests.

**Rationale**: This provides real HTTP behavior while avoiding fixed port
collisions. Existing runtime HTTP utilities already use this pattern, and the
smoke suite can adapt it while enforcing non-test env.

**Alternatives considered**:
- Call controller methods directly: rejected because it is not an HTTP smoke
  test and can miss routing/filter/guard behavior.
- Start an external server process: possible but heavier; in-process Nest
  server with network calls provides sufficient HTTP proof for this phase.
- Use frontend Playwright: rejected because frontend apps are out of scope.

## Decision 6: Verify persistence with a separate PrismaClient

**Decision**: Use a verifier `PrismaClient` connected to the same smoke
`DATABASE_URL` for direct DB assertions.

**Rationale**: The proof must not rely on runtime memory, service arrays or
controller internals. A separate client makes the persisted-state assertion
explicit and independent from HTTP responses.

**Alternatives considered**:
- Use repository services for verification: rejected because it can accidentally
  verify the same abstraction under test.
- Query through admin endpoints only: rejected because not every row has an
  admin endpoint and the requirement asks for direct DB verification.
- Use raw SQL only: unnecessary by default; PrismaClient keeps assertions tied
  to the schema.

## Decision 7: Isolate by smokeRunId and clean by scoped filters

**Decision**: Generate a smoke run id and use it in correlation ids, synthetic
names, emails, license numbers, feature flag reasons and other traceable fields.
Cleanup deletes only rows matching smoke filters; audit rows may be retained if
deletion conflicts with audit semantics.

**Rationale**: The suite must be repeatable and safe. Scoped cleanup prevents
accidental deletion of non-smoke data, and run id isolation makes leftovers
diagnosable after failures.

**Alternatives considered**:
- Full database reset: rejected as a default because it is too destructive if
  misconfigured.
- No cleanup: rejected because repeated local/CI runs would accumulate data and
  create false positives.
- Clean by timestamps only: rejected because timestamps can overlap with
  non-smoke data.

## Decision 8: Keep CI optional until stable

**Decision**: Specify CI as optional and separable from fast validation until
the smoke suite is stable.

**Rationale**: PostgreSQL-backed runtime smoke tests add high value but can be
slower and infrastructure-sensitive. Making the job separate reduces disruption
while preserving a clear path to required status later.

**Alternatives considered**:
- Make CI required immediately: rejected until the suite proves stable.
- Keep local-only forever: rejected because runtime proof should eventually
  protect shared integration.

