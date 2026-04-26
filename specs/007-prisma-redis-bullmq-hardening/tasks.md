# Tasks: Prisma Redis BullMQ Hardening AssurMatch

**Input**: Design documents from `/specs/007-prisma-redis-bullmq-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, contracts/runtime-hardening-contract.md

**Continuous Workflow**: The user explicitly requested automatic continuation from `/speckit.tasks` to `/speckit.implement`. Stop only for constitutional conflict, major ambiguity, security/data leakage risk, forbidden activation, migration/data-loss blocker or blocking validation failure. Do not commit automatically.

**Tests**: Tests are required for runtime adapter guardrails, migrations/base-fresh validation, Prisma validation, durable audit, feature flags/cache, Redis behavior, BullMQ enqueue, public abuse controls, tenant isolation and constitutional regression.

## Phase 1: Setup And Baseline Guardrails

**Purpose**: Establish executable boundaries before runtime rewiring.

- [x] T001 Verify `.gitignore` and project ignore patterns for Node/TypeScript runtime artifacts in `.gitignore`
- [x] T002 [P] Add runtime environment validation tests for memory adapter rejection in `backend/tests/unit/config/runtime-config.spec.ts`
- [x] T003 [P] Add runtime adapter inventory tests for Prisma/Redis/BullMQ/audit modes in `backend/tests/integration/runtime-adapters.spec.ts`
- [x] T004 Add runtime configuration helper and fail-fast rules in `backend/src/config/config.module.ts`
- [x] T005 Update `.env.example` with explicit PostgreSQL, Redis, BullMQ and memory override documentation

---

## Phase 2: Foundational Database And Adapter Ports

**Purpose**: Blocking prerequisites for all runtime stories.

- [x] T006 Add Prisma migration/base-fresh validation coverage in `backend/tests/integration/prisma-migrations.spec.ts`
- [x] T007 Replace placeholder foundation migration with real baseline SQL in `backend/prisma/migrations/0001_foundation/migration.sql`
- [x] T008 Add minimal development seed with safe disabled defaults in `backend/prisma/seed.ts`
- [x] T009 Expose real PrismaClient runtime, transaction and delegate access in `backend/src/modules/common/prisma/prisma.service.ts`
- [x] T010 Add Redis client port with real Redis and explicit memory-test adapters in `backend/src/modules/common/redis/redis.module.ts`
- [x] T011 Add BullMQ queue port with real BullMQ and explicit memory-test queue in `backend/src/modules/common/queues/queues.module.ts`
- [x] T012 Update system health to report real database, Redis and queue adapter modes in `backend/src/modules/admin/system-health.module.ts`

---

## Phase 3: User Story 1 - Durable Persistence Outside Tests (Priority: P1)

**Goal**: Runtime-normal backend uses durable Prisma-backed repositories or explicit runtime adapters instead of silent memory defaults.

**Independent Test**: Runtime adapter tests show no memory adapter binding outside tests; migration/base-fresh validation succeeds.

### Tests for User Story 1

- [x] T013 [P] [US1] Add repository/memory-boundary guardrail tests in `backend/tests/guardrails/runtime-memory-boundaries.spec.ts`
- [x] T014 [P] [US1] Add Prisma schema validation script coverage in `backend/tests/integration/prisma-schema.spec.ts`

### Implementation for User Story 1

- [x] T015 [US1] Add repository mode contracts for runtime/test boundaries in `backend/src/modules/common/repositories/runtime-repository.ts`
- [x] T016 [US1] Update PrismaService consumers to use runtime mode checks instead of silent degraded memory in `backend/src/modules/common/prisma/prisma.service.ts`
- [x] T017 [US1] Document transaction strategy in `specs/007-prisma-redis-bullmq-hardening/quickstart.md`

---

## Phase 4: User Story 2 - Durable Audit (Priority: P1)

**Goal**: Sensitive actions can write durable PostgreSQL AuditLogs and memory audit repositories remain test-only.

**Independent Test**: Audit repository and HTTP audit tests prove persistent writes and no silent failure for sensitive runtime paths.

### Tests for User Story 2

- [x] T018 [P] [US2] Add durable audit writer tests in `backend/tests/integration/runtime-audit-repository.spec.ts`
- [x] T019 [P] [US2] Add audit failure behavior tests in `backend/tests/unit/audit-logs/audit-log-writer.spec.ts`

### Implementation for User Story 2

- [x] T020 [US2] Make AuditLogWriter awaitable and expose writeAsync in `backend/src/modules/audit-logs/audit-log-writer.service.ts`
- [x] T021 [US2] Harden audit repositories and Prisma persistence in `backend/src/modules/audit-logs/audit-log-repository.ts`
- [x] T022 [US2] Bind Prisma audit repository for runtime module construction in `backend/src/modules/audit-logs/audit-logs.module.ts`

---

## Phase 5: User Story 3 - Persistent Feature Flags With Redis Cache (Priority: P1)

**Goal**: Feature flags use PostgreSQL as source, Redis as cache and fail closed for sensitive modules.

**Independent Test**: Tests cover absent, false, true, cache hit, cache miss and invalidation/fail-closed behavior.

### Tests for User Story 3

- [x] T023 [P] [US3] Add feature flag repository/cache tests in `backend/tests/integration/feature-flags/runtime-feature-flags.spec.ts`
- [x] T024 [P] [US3] Extend fail-closed cache unit tests in `backend/tests/unit/feature-flags/fail-closed-cache.spec.ts`

### Implementation for User Story 3

- [x] T025 [US3] Add FeatureFlagRepository memory-test and Prisma-runtime implementations in `backend/src/modules/feature-flags/feature-flag-repository.ts`
- [x] T026 [US3] Update FeatureFlagsService to use repository plus Redis cache in `backend/src/modules/feature-flags/feature-flags.module.ts`
- [x] T027 [US3] Update feature flag cache to use RedisClientPort and safe keys in `backend/src/modules/feature-flags/feature-flag-cache.service.ts`

---

## Phase 6: User Story 4 - Redis Runtime For Cache, Abuse, Duplicates And Locks (Priority: P1)

**Goal**: Redis runtime covers catalog cache, rate limiting, anti-spam, duplicate detection and routing locks, while memory Redis stays test-only.

**Independent Test**: Redis tests prove runtime client behavior, PII-safe keys, lock idempotency and abuse controls.

### Tests for User Story 4

- [x] T028 [P] [US4] Add Redis port behavior tests in `backend/tests/unit/common/redis-client-port.spec.ts`
- [x] T029 [P] [US4] Add routing lock Redis tests in `backend/tests/integration/leads/routing-lock.spec.ts`
- [x] T030 [P] [US4] Add runtime public abuse Redis tests in `backend/tests/integration/public-quotes/runtime-abuse-controls.spec.ts`

### Implementation for User Story 4

- [x] T031 [US4] Update catalog caches to use RedisClientPort in `backend/src/modules/countries/catalog-cache.service.ts` and `backend/src/modules/offers/offer-cache.service.ts`
- [x] T032 [US4] Update rate limit guard and public quote abuse services to use RedisClientPort in `backend/src/modules/common/guards/rate-limit.guard.ts` and `backend/src/modules/quote-requests/`
- [x] T033 [US4] Add atomic routing lock/idempotency helpers in `backend/src/modules/common/redis/redis.module.ts`

---

## Phase 7: User Story 5 - BullMQ Runtime Jobs (Priority: P1)

**Goal**: Notifications and already planned async jobs enqueue through BullMQ outside tests.

**Independent Test**: Runtime queue tests prove visitor and broker notification jobs enqueue through BullMQ adapter or controlled runtime adapter.

### Tests for User Story 5

- [x] T034 [P] [US5] Add queue port tests in `backend/tests/unit/common/queue-port.spec.ts`
- [x] T035 [P] [US5] Add runtime BullMQ enqueue tests in `backend/tests/integration/notifications/runtime-bullmq.spec.ts`

### Implementation for User Story 5

- [x] T036 [US5] Update notification services to use QueuePort in `backend/src/modules/notifications/notifications.module.ts`
- [x] T037 [US5] Update quote notification service to use QueuePort and idempotent payload references in `backend/src/modules/notifications/quote-notification.service.ts`
- [x] T038 [US5] Update notification processor types for QueuePort in `backend/src/jobs/notifications/notification.processor.ts`

---

## Phase 8: User Story 6 - Configuration, Documentation And Constitutional Validation (Priority: P2)

**Goal**: Runtime setup is documented, testable and constitutionally safe.

**Independent Test**: Quickstart and full validation commands run or report explicit environmental blockers.

### Tests for User Story 6

- [x] T039 [P] [US6] Add production memory override guardrail tests in `backend/tests/guardrails/runtime-adapter-production.spec.ts`
- [x] T040 [P] [US6] Add frontend separation regression assertion for unchanged apps in `backend/tests/guardrails/content/frontend-separation.spec.ts`

### Implementation for User Story 6

- [x] T041 [US6] Update quickstart with implemented commands and migration/base-fresh notes in `specs/007-prisma-redis-bullmq-hardening/quickstart.md`
- [x] T042 [US6] Update runtime hardening contract with implemented adapter names in `specs/007-prisma-redis-bullmq-hardening/contracts/runtime-hardening-contract.md`

---

## Phase 9: Polish And Final Validation

**Purpose**: Complete task bookkeeping and required final validations.

- [x] T043 Run `npx prisma validate --schema backend/prisma/schema.prisma`
- [x] T044 Run migration/base-fresh validation or documented equivalent from `backend/tests/integration/prisma-migrations.spec.ts`
- [x] T045 Run `npm run typecheck`
- [x] T046 Run `npm run lint`
- [x] T047 Run `npm run test`
- [x] T048 Run `npm run test:web`
- [x] T049 Run `npm run build`
- [x] T050 Run `npm audit --audit-level=high`
- [x] T051 Run `git diff --check`
- [x] T052 Mark all completed tasks in `specs/007-prisma-redis-bullmq-hardening/tasks.md`
- [x] T053 Produce final implementation report with changed files, migrations, tests, validation results, unfinished points, residual risks and commit recommendation

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 can start immediately.
- Phase 2 depends on Phase 1 and blocks all runtime user stories.
- Phases 3-7 depend on Phase 2. They are ordered by risk because audit, flags, Redis and queues share runtime adapter boundaries.
- Phase 8 depends on Phases 3-7.
- Phase 9 depends on all implementation phases.

### Parallel Opportunities

- T002/T003 can be authored independently.
- T013/T014, T018/T019, T023/T024, T028/T029/T030, T034/T035 and T039/T040 can be developed in parallel if owners avoid shared files.
- Documentation tasks T041/T042 can run after adapter names settle.

## Implementation Strategy

1. Create guardrail tests for runtime adapter modes.
2. Introduce runtime config and adapter ports.
3. Repair migration baseline and seed.
4. Harden audit, feature flags, Redis and BullMQ in that order.
5. Update documentation and run final validations.
6. Do not commit automatically.
