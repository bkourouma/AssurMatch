# Research: Prisma Redis BullMQ Hardening AssurMatch

## Decision 1: Repository Ports With Prisma Runtime Adapters

**Decision**: Introduce explicit repository interfaces for critical domains and
bind Prisma implementations in runtime modules. Keep memory implementations only
in test factories or `memory-test` files.

**Rationale**: Many services currently own arrays directly or default to memory
repositories. Ports let implementation move to Prisma without changing business
rules, and they make runtime/test boundaries auditable.

**Alternatives considered**:
- Inject `PrismaService` directly into every service: faster, but mixes
  persistence details with decision logic and makes unit tests harder.
- Keep arrays and periodically sync them: rejected because it does not satisfy
  durable source-of-truth requirements.

## Decision 2: Production Fail-Fast For Missing Runtime Dependencies

**Decision**: Runtime-normal and production modes must fail fast when required
PostgreSQL, Redis or BullMQ dependencies are missing. Memory override variables
are valid only in tests.

**Rationale**: Silent fallback to memory is the residual risk this feature is
meant to remove. Failing early is safer than accepting leads or audits without
durable infrastructure.

**Alternatives considered**:
- Soft degrade to memory in local/production: rejected for compliance risk.
- Permit degraded catalog-only mode: acceptable only if explicit, tested and
  limited to non-sensitive cache bypass, never for flags, consent, audit,
  routing, rate limiting, locks or queues.

## Decision 3: Repair Fresh Database By Making 0001 A Real Baseline

**Decision**: Replace the placeholder `0001_foundation` migration with SQL that
creates the base enums, tables, constraints and indexes required by
`schema.prisma` and later migrations, then validate 0001-0004 from an empty DB.

**Rationale**: The current placeholder cannot rebuild a fresh database. Fresh
database rebuild is required for CI, onboarding and operational confidence.

**Alternatives considered**:
- Add a new 0005 migration that backfills everything: rejected because an empty
  database would still fail before later migrations that depend on missing base
  types/tables.
- Rely only on `prisma db push`: rejected because the repo uses migrations and
  needs reproducible history.

## Decision 4: Durable-Write-First Transaction Strategy

**Decision**: Persist domain state and AuditLog in the database transaction
where feasible, then enqueue BullMQ jobs using idempotency keys. Record enqueue
failure as retryable metadata or operational failure without claiming delivery.

**Rationale**: PostgreSQL and Redis/BullMQ cannot be committed atomically
without extra infrastructure. Durable-write-first preserves compliance evidence
and makes failed enqueue visible for retry.

**Alternatives considered**:
- Enqueue before database commit: rejected because jobs could run for rolled
  back or missing records.
- Block HTTP until notification delivery: rejected by the constitution because
  public endpoints must not run heavy work synchronously.

## Decision 5: Feature Flags Use PostgreSQL Source And Redis Cache

**Decision**: Store flags and history in PostgreSQL. Use Redis cache entries
with explicit TTL or invalidation. Sensitive flags fail closed on absence,
invalid values, stale cache or source/cache errors.

**Rationale**: Flags are compliance controls, not convenience settings. A
cache-only or environment-only flag system cannot provide history, audit or
deterministic rollback.

**Alternatives considered**:
- Environment variables as source of truth: insufficient for admin mutation,
  history and scope precedence.
- Redis as source of truth: rejected because cache loss would lose compliance
  state and history.

## Decision 6: Redis Port With Atomic Runtime Operations

**Decision**: Define a `RedisClientPort` that supports get/set/del, increment
with TTL, set-if-not-exists with TTL, expire and health. The real adapter uses
Redis outside tests; the memory adapter is test-only.

**Rationale**: Current services type against `InMemoryRedisClient`, making
memory the shape of the runtime. A port lets services express required atomic
behavior while keeping unit tests independent of Redis.

**Alternatives considered**:
- Pass raw `redis` client into all services: rejected because service code would
  scatter low-level Redis details and complicate test doubles.
- Keep current in-memory-compatible methods only: insufficient for routing
  locks and idempotency, which need atomic set-if-not-exists behavior.

## Decision 7: BullMQ Queue Port And Durable Job Metadata

**Decision**: Define a `QueuePort` for enqueue/transition/list-status needs.
Bind BullMQ in runtime and memory in explicit tests. Store or update durable
`QueueJobRecord` and `Notification` status around enqueue/processing.

**Rationale**: Notifications need observability, retry and no synchronous
delivery dependency. BullMQ is already a project dependency and constitutionally
selected.

**Alternatives considered**:
- Use in-memory queue plus worker loop: rejected because jobs disappear on
  restart and cannot be observed reliably.
- Use database polling only: possible later, but BullMQ is the established
  stack and already present.

## Decision 8: Test Strategy Uses Real Services For Runtime Acceptance

**Decision**: Unit tests may use memory adapters. Runtime acceptance tests use a
migrated database and real Redis/BullMQ or contract-compatible integration
adapters that prove normal runtime does not bind memory defaults.

**Rationale**: The purpose is to catch hidden runtime fallbacks. Pure unit tests
cannot prove the Nest runtime module graph uses the correct adapters.

**Alternatives considered**:
- Mock every adapter: rejected for runtime hardening acceptance.
- Require external services for all tests: rejected because unit tests should
  stay fast and isolated.

## Decision 9: No Frontend Functional Refactor

**Decision**: Keep frontend changes out of scope except compatibility fixes and
guardrail tests preserving separation.

**Rationale**: Specs 005 and 006 already connected HTTP and session behavior.
This feature is infrastructure hardening and must not expand UI scope.

**Alternatives considered**:
- Add admin UI for runtime health/flags: rejected as a business/UI expansion.
- Rewrite public data fetching around cache details: rejected because cache is
  backend-owned.
