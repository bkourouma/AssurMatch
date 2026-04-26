# Runtime Hardening Contract

This contract defines the internal acceptance boundary for spec 007. It is not a
new public API and does not add business functionality.

## Runtime Mode Contract

### Normal Runtime

- `PrismaService` connects to a real PrismaClient using `DATABASE_URL`.
- Redis-dependent providers bind `RuntimeRedisClient` using `REDIS_URL`.
- Queue providers bind `BullMqQueuePort` using Redis-backed BullMQ queues.
- AuditLog writer binds a Prisma-backed repository.
- Memory repositories, memory Redis and memory queues are not registered.
- Missing required dependencies fail startup or fail the affected sensitive path
  closed with an explicit operational error.

### Test Runtime

- Unit tests may bind `MemoryFeatureFlagRepository`, `InMemoryRedisClient`,
  `InMemoryQueue` and other explicit memory repositories.
- Test memory adapters must be selected explicitly by test module/factory.
- Runtime integration tests must prove the normal module graph does not default
  to memory adapters.

## Repository Port Contract

Every critical domain repository must expose the minimum operations used by its
service without leaking Prisma details into business decisions.

Required properties:

- `mode`: `prisma-runtime` or `memory-test`.
- Read methods must preserve tenant, country, product and permission filters.
- Write methods must return durable identifiers and timestamps.
- Transaction-aware methods must accept the active transaction context when
  called inside quote submission, routing or action mutations.

Critical domain ports:

- country repository
- product repository
- offer repository
- prospect repository
- quote request repository
- consent record repository
- lead assignment repository
- partner repository
- partner license repository
- partner user/user repository
- feature flag repository
- audit log repository
- Starter action/history repository
- CRM action/history repository
- notification/job repository
- document metadata repository if already planned

## Redis Port Contract

The Redis port must support:

- `get(key)`
- `set(key, value, ttlSeconds?)`
- `del(key)`
- `incr(key, ttlSeconds?)`
- `setNx(key, value, ttlSeconds)`
- `expire(key, ttlSeconds)`
- `health()`

Acceptance rules:

- `setNx` is required for routing locks and idempotency.
- Counter operations must apply TTL on first increment.
- Keys must pass PII safety tests.
- Sensitive feature flag and routing decisions fail closed on Redis/source
  errors unless a documented safe fallback reads PostgreSQL and still refuses
  uncertain actions.

## Queue Port Contract

The queue port must support:

- enqueue job with queue name, job type, payload reference and correlation id
- transition or record job status when applicable
- health/status for system health
- idempotency key support for repeated enqueue attempts

Acceptance rules:

- BullMQ is bound outside tests.
- Memory queue is bound only in tests.
- Enqueue returns or records a durable job reference.
- HTTP handlers do not wait for delivery completion.
- Payloads use durable references and minimized context.

## Audit Contract

Sensitive actions must produce durable audit records with:

- actor id when authenticated
- action
- target type and id
- scope
- result
- reason or error category when refused/failed
- PII-minimized context
- correlation id when available
- occurred timestamp
- retention timestamp

Required acceptance actions:

- login/logout if applicable
- quote request created/refused
- consent granted/refused/missing
- routing success/refusal
- lead detail access
- Starter accept/reject/dispute
- CRM status/note/task/reminder/assignment/export
- admin sensitive read/mutation
- RBAC refusal

## Environment Contract

Variables to document and validate:

- `DATABASE_URL`
- `REDIS_URL`
- `NODE_ENV`
- `APP_ENV`
- `ASSURMATCH_PRISMA_MEMORY`
- `ASSURMATCH_REDIS_MEMORY`
- `ASSURMATCH_QUEUE_MEMORY`
- queue namespace/prefix if introduced
- existing auth secrets
- existing feature flag defaults, all safe false by default

Production rules:

- Memory override variables are rejected.
- Missing `DATABASE_URL` is fatal.
- Missing `REDIS_URL` is fatal for Redis/BullMQ-dependent runtime.
- Regulated module flags default false.

Implemented adapter mode names:

- Prisma: `prisma-client` / `test-adapter`
- Redis: `redis-client` / `memory-test`
- Queue: `bullmq` / `memory-test`
- Audit: `durable-boundary` / `memory-test`

## Acceptance Contract

The implementation is acceptable when:

- Fresh database migrations and seed complete from zero.
- Runtime-normal adapter inventory shows no memory adapters.
- HTTP persistence tests prove critical writes survive new app instance or
  database readback.
- Feature flag tests cover absent, false, true, cache hit and cache miss.
- Redis tests cover catalog cache, rate limit, anti-spam, duplicate and locks.
- BullMQ tests prove visitor and broker notification jobs are enqueued.
- Durable audit tests cover listed sensitive actions and refusals.
- Constitutional tests remain green.
