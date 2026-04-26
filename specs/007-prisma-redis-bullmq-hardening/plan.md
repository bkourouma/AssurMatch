# Implementation Plan: Prisma Redis BullMQ Hardening AssurMatch

**Branch**: `007-prisma-redis-bullmq-hardening` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-prisma-redis-bullmq-hardening/spec.md`

**Continuous Workflow Eligibility**: Eligible after this plan is accepted. The
user explicitly stated that spec 007 is created and validated, and the spec has
no `[NEEDS CLARIFICATION]` marker. This invocation must stop after planning
because the user explicitly requested no `tasks.md` and no implementation.
Future `/speckit.tasks` or `/speckit.implement` may proceed only if no
constitutional, security, data leakage, migration or blocking validation risk
appears. Do not auto-commit unless the user asks.

## Summary

Replace the remaining runtime memory/stub boundaries with real, testable
PostgreSQL/Prisma, Redis and BullMQ integrations. Keep memory repositories,
Redis and queues only behind explicit test factories. The plan hardens the
Backend API and shared contracts/test helpers while preserving the Web Publique
Client and Back-office Partenaires/Plateforme behavior delivered by 001-006.

The implementation approach is progressive: first lock configuration and fresh
database rebuild, then introduce repository contracts and Prisma repositories,
then make audit durable, then move feature flags/cache, Redis abuse controls and
BullMQ notifications to real runtime adapters, and finally add HTTP/integration
validation that proves no runtime-normal path silently falls back to memory.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Redis client 5.12.1; BullMQ 5.76.2; Next.js 16.2.4 and React 19.2.5 are present but not planned for functional UI changes.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@prisma/client`, `prisma`, `redis`, `bullmq`, `zod`, `vitest`, `@playwright/test`, TypeScript.
**Storage**: PostgreSQL via Prisma is the source of truth for critical entities. Redis is runtime infrastructure for public catalog cache, feature flag cache, rate limiting, anti-spam, duplicate detection, routing locks, notification idempotency and OTP/MFA if already used. BullMQ uses Redis for asynchronous jobs. S3-compatible document storage remains out of scope except document metadata already modeled.
**Testing**: Vitest unit/integration/contract/guardrail suites, existing Playwright smoke tests where frontend separation must be proved, migration/base-fresh tests, adapter tests for Prisma/Redis/BullMQ, HTTP tests through the Nest runtime. Existing scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:guardrails`, `npm run test:web`, `npm run validate`.
**Target Platform**: SaaS B2B2C regulated insurance marketplace with two separated web applications, one Backend API and shared packages.
**Impacted Application(s)**: Backend API: primary. Packages shared: only contracts/types/test helpers if needed. Web Publique Client: no functional change except separation regression tests or API compatibility fixes. Back-office Partenaires/Plateforme: no functional change except API compatibility fixes.
**Project Type**: Regulated marketplace runtime hardening with compliance and operational reliability constraints.
**Performance Goals**: Public catalog reads remain cacheable; 95% of local acceptance public catalog reads stay under 2 seconds and valid quote submissions return confirmation without waiting for notification delivery. Runtime startup must fail fast within startup/config validation when required production dependencies are missing.
**Constraints**: No new business features. No UI redesign. No payment, subscription, policy issuance, attestation, e-signature, claims, advanced AI, advanced webhooks, insurer API, SSO/OAuth or advanced refresh token work. No CRM activation when `broker_crm_enabled` is absent or false. No lead transmission without consent. No memory adapter in runtime normal/production.
**Scale/Scope**: Domains already present in 001-006: countries, products, offers, prospects, quote requests, lead assignments, consent records, partner licenses, partners, partner users, feature flags, audit logs, broker Starter actions, broker CRM actions, notifications and document metadata already planned.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The plan only replaces infrastructure adapters and does not introduce sale, subscription, premium collection, contract issuance, attestation, claims, payments, insurer API or binding advice.
- **Regulatory and consent**: Pass. ConsentRecord remains mandatory before transmission. Durable audit and Prisma repositories strengthen proof of consent/refusal.
- **Feature flags and activation**: Pass. PostgreSQL is the source for flags, Redis is cache only, and sensitive flags fail closed. `broker_crm_enabled` and regulated modules remain false by default.
- **Frontend application separation**: Pass. No functional frontend work is planned. Any compatibility fix remains scoped to its existing app and must preserve public/back-office separation tests.
- **Security and RBAC**: Pass. Runtime config refuses silent memory fallback in production. RBAC/MFA/tenant checks from 005/006 remain authoritative. PII must be excluded from Redis keys, job payloads, logs and errors.
- **Data and auditability**: Pass. The plan adds Prisma repositories, durable AuditLog persistence, migration rebuild validation and history preservation for flags/offers/licenses/routing/actions.
- **Routing integrity**: Pass. Routing rules do not change. Durable repositories and Redis locks protect consent, license, eligibility, quota and concurrent assignment decisions.
- **AI control**: Pass. No AI feature is activated. Existing AI-related jobs/flags remain disabled unless explicitly already allowed by safe flags and plan. No model calls are introduced.
- **UX and content safety**: Pass. No public copy changes are planned. Existing forbidden wording guardrails remain required.
- **Testing discipline**: Pass. The plan requires unit, integration, HTTP, migration, Redis, BullMQ, feature flag, durable audit, abuse, tenant isolation and constitutional tests.
- **Async and reliability**: Pass. Notifications and already planned jobs move to BullMQ, while public endpoints return after durable state and enqueue intent rather than delivery.
- **Continuous workflow safety**: Pass with stop condition. The spec is validated and eligible for a later tasks phase, but this request explicitly stops after plan artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/007-prisma-redis-bullmq-hardening/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    runtime-hardening-contract.md
  checklists/
    requirements.md
```

`tasks.md` is intentionally not generated in this request.

### Source Code (repository root)

```text
backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts                         # planned if not already present
  src/
    config/
      config.module.ts              # runtime env validation/fail-fast
    jobs/
      notifications/
    modules/
      common/
        prisma/prisma.service.ts
        redis/redis.module.ts
        queues/queues.module.ts
        guards/rate-limit.guard.ts
      audit-logs/
      feature-flags/
      countries/
      products/
      offers/
      prospects/
      quote-forms/
      quote-requests/
      consent/
      partners/
      partner-licenses/
      users/
      leads/
      routing/
      notifications/
      documents/
      auth/
      admin/
  tests/
    unit/
    integration/
    contract/
    guardrails/
packages/
  shared/
    contracts/
apps/
  public/                           # separation tests only unless API compatibility fix is unavoidable
  broker/                           # no functional UI change planned
  admin/                            # no functional UI change planned
```

**Structure Decision**: Keep the current NestJS modular monolith. Introduce
domain-level repository interfaces next to each module or in a local
`repositories/` folder when the module has several adapters. Runtime modules
bind Prisma/Redis/BullMQ adapters. Test modules bind memory adapters through
explicit test factories. Do not create a new frontend surface.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use repository interfaces with runtime Prisma adapters and test-only memory
  adapters rather than allowing services to instantiate arrays or memory
  modules directly.
- Make configuration validation fail fast in production/runtime-normal when
  required PostgreSQL, Redis or BullMQ dependencies are missing.
- Repair the fresh database path by making `0001_foundation` an actual baseline
  migration aligned with `schema.prisma`, then validate all migrations from
  empty database.
- Treat PostgreSQL as feature flag source of truth and Redis as cache with
  explicit TTL/invalidation and fail-closed sensitive defaults.
- Use BullMQ for enqueue/delivery and `QueueJobRecord` or equivalent durable
  metadata for observability/idempotency rather than relying on in-memory job
  arrays.
- Use a durable-write-first pattern for quote submission and routing: persist
  state and audit in a transaction, then enqueue idempotent jobs and record
  retryable failures when enqueue fails.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): runtime adapters, critical Prisma domains,
  Redis state, BullMQ jobs, audit and transaction states.
- [contracts/runtime-hardening-contract.md](./contracts/runtime-hardening-contract.md):
  internal provider contracts, environment contract and acceptance contract.
- [quickstart.md](./quickstart.md): local PostgreSQL/Redis startup, migration,
  seed and validation workflow.

## Technical Plan

### 1. Prisma Runtime Hardening

- Refactor `PrismaService` to wrap a real `PrismaClient` outside tests and to
  reject `ASSURMATCH_PRISMA_MEMORY=true` unless `NODE_ENV=test` or an explicit
  test runtime marker is present.
- Expose typed access to Prisma delegates or a narrow `PrismaDb` abstraction so
  repositories do not depend on ad hoc helper methods such as only
  `persistAuditLog`.
- Introduce repository interfaces per domain, then Prisma implementations for:
  countries, products, offers, prospects, quote requests, lead assignments,
  consent records, partner licenses, partners, partner users, feature flags,
  audit logs, broker Starter actions, broker CRM actions, notifications and
  document metadata already planned.
- Replace runtime arrays in services with repository calls. Keep arrays only in
  `*.memory-test-repository.ts` or test helpers.
- Align `schema.prisma`, migrations and service fields before broad service
  rewrites. Missing fields must be added to schema/migrations, not papered over
  in DTO transforms.
- Correct `backend/prisma/migrations/0001_foundation/migration.sql` so it
  creates the base enums/tables required by later migrations. Then verify
  `0002_comparator_quote`, `0003_broker_starter_portal` and
  `0004_broker_crm_pro` apply from zero.
- Add or update a development seed that creates safe disabled defaults,
  minimal active public catalog data, consent texts, brokers, licenses,
  broker/admin users, permissions and non-regulated fixtures needed by HTTP
  tests.
- Document transaction boundaries:
  quote submission, consent, prospect, quote request, routing decision,
  lead assignment and audit are one durable unit where feasible; notification
  enqueue happens after durable state with idempotency and retryable status.
  Starter/CRM actions persist state/history/audit before enqueueing any
  notification.

### 2. Durable Audit

- Make `AuditLogWriter` require an injected repository in runtime modules.
  Its default memory repository remains only for explicit unit tests.
- Make audit writes awaitable for sensitive paths. Current fire-and-forget
  `Promise.resolve(...).catch(() => undefined)` must not be the runtime
  acceptance path for high-risk actions.
- Use `PrismaAuditLogRepository` for runtime persistence and add read/search
  coverage through existing admin audit services.
- Cover actions from 007 and prior specs: login/logout when applicable,
  quote request creation/refusal, consent grant/refusal, routing/refusal,
  lead detail access, Starter accept/reject/dispute, CRM status/note/task/
  reminder/assignment/export, admin sensitive read/mutation and RBAC refusal.
- Keep audit context PII-minimized via existing masking plus repository-level
  tests that assert no raw email/phone/secret is stored in `context`.

### 3. Persistent Feature Flags And Redis Cache

- Move feature flag storage from `FeatureFlagsService` arrays to a
  `FeatureFlagRepository` backed by Prisma.
- Keep `FeatureFlagHistory` durable and auditable on every mutation.
- Use Redis cache only as acceleration. Resolver order remains deterministic
  across global, country, product, partner, plan and AI scopes.
- Cache keys include flag key, scope type/id and cache version or equivalent.
  Mutations invalidate the exact key family or rely on a short explicit TTL.
- Fail closed for absent, invalid, stale or unreadable sensitive flags.
  `broker_crm_enabled`, payments, e-signature, policy issuance, claims,
  insurer API and AI sensitive flags are false unless true is persisted in the
  exact allowed scope.
- Add tests for absent, false, true, cache miss, cache hit, invalidation/TTL and
  Redis unavailable behavior.

### 4. Redis Runtime

- Replace `InMemoryRedisClient` in runtime providers with a `RedisClientPort`
  that has real Redis and memory-test implementations.
- Refactor `RedisModule` so `client` is real outside tests; memory is available
  only through a test module/factory.
- Cover runtime Redis usages:
  active country cache, active product cache, public offer cache, feature flag
  cache, public catalog rate limit, quote rate limit, anti-spam, duplicate
  quote fingerprints, routing locks, notification idempotency and OTP/MFA if
  existing auth flows require it.
- Preserve existing key helpers such as `QuoteRedisKeys`, with tests proving
  no raw PII appears in keys.
- Use atomic Redis operations where needed: increment with expiry for rate
  limits, `SET NX EX` style locks for routing, and idempotency keys for
  notifications.
- Production/runtime-normal behavior: if Redis is missing for sensitive
  controls, startup or the affected path fails closed. Non-sensitive catalog
  cache may bypass Redis and read PostgreSQL only if this degraded mode is
  explicit, logged and tested.

### 5. BullMQ Runtime

- Replace `InMemoryQueue` in runtime services with a `QueuePort` abstraction.
  Bind BullMQ in normal runtime and memory queues in explicit tests only.
- Configure BullMQ queues from `REDIS_URL` and stable names. Existing names in
  `QuoteQueueNames` remain the domain names for quote notifications; internal
  BullMQ names should use an `assurmatch.*` namespace.
- Minimum runtime queues:
  visitor quote confirmation, broker new lead notification, Starter/CRM action
  notifications already planned, maintenance/report jobs already planned.
- Persist or update `QueueJobRecord`/`Notification` metadata so support can see
  queued, failed, retryable and completed states.
- Jobs carry durable references (`quoteRequestId`, `leadAssignmentId`,
  `notificationId`, `auditLogId`, `correlationId`) rather than full PII.
- Add enqueue tests proving BullMQ receives jobs and HTTP responses are not
  blocked on delivery.

### 6. Rate Limiting, Anti-Spam And Duplicates

- Keep current public controls but move them behind Redis runtime ports:
  `public-quote-rate-limit.service.ts`, `public-anti-spam.service.ts`,
  `quote-duplicate-detection.service.ts`, catalog rate limiting and common
  `rate-limit.guard.ts`.
- Endpoints in scope: public catalog reads, quote form reads if rate-limited,
  `POST /quote-requests`, auth login/MFA if already rate-limited by 005/006.
- Refusal rules:
  rate limit returns a non-sensitive refusal and audit when tied to a sensitive
  action; anti-spam blocks or slows without transmission; duplicate detection
  marks quote request duplicate/non-routable according to existing rules.
- Duplicate keys use non-reversible contact fingerprints and never raw email or
  phone.
- Routing locks prevent double assignment for the same quote request and expire
  automatically.

### 7. Runtime Configuration

- Update config validation to distinguish:
  local/test memory adapters, local runtime real adapters, CI integration
  adapters and production runtime.
- Environment variables to document:
  `DATABASE_URL`, `DIRECT_URL` if Prisma needs it, `REDIS_URL`,
  `BULLMQ_PREFIX` or queue namespace if introduced, `ASSURMATCH_PRISMA_MEMORY`,
  `ASSURMATCH_REDIS_MEMORY`, `ASSURMATCH_QUEUE_MEMORY`, `NODE_ENV`, `APP_ENV`,
  auth secrets and existing feature flag defaults.
- In production, memory override variables are rejected. Missing PostgreSQL is
  fatal. Missing Redis/BullMQ is fatal for sensitive paths and startup unless an
  explicit degraded mode variable is introduced and documented as non-production
  or limited.
- Update `.env.example` with safe defaults: module flags false, local
  PostgreSQL/Redis URLs, no production secrets.
- Add optional local `docker-compose` only if the repository lacks an accepted
  way to run PostgreSQL/Redis. If added, keep it local/dev oriented and do not
  change deployment assumptions.

### 8. Tests And Validation

- Unit tests: repository interfaces, memory-test repositories, feature flag
  precedence, Redis key safety, audit masking, duplicate fingerprints and
  transaction orchestration failure cases.
- Prisma integration: each critical repository round-trips through migrated
  schema; no service-level arrays are used in runtime modules.
- Redis integration: cache TTL/invalidation, rate limiting, anti-spam,
  duplicate detection, routing lock and fail-closed behavior.
- BullMQ integration: enqueue visitor and broker notification jobs with
  idempotency and observable job metadata.
- HTTP persistence: quote request, consent, routing refusal/success, lead
  detail access, Starter actions, CRM actions, admin sensitive reads/mutations
  and audit search survive restart or new app instance.
- Migration/base-fresh: apply all migrations from empty database, run seed,
  run a critical HTTP smoke suite.
- Feature flags/cache: absent/false/true/cache hit/cache miss/stale cache and
  Redis unavailable cases.
- Durable audit: every listed sensitive action persists an AuditLog or is
  explicitly marked not applicable because the path is not implemented.
- Tenant isolation and constitutional tests: no cross-broker access, no
  routing without consent, no expired-license routing, no disabled country/
  product exposure, no CRM without flag true, no regulated module default true.

## Progressive Implementation Strategy

1. Baseline and guardrails: add config validation, adapter mode assertions and
   tests that currently expose memory fallback risk.
2. Fresh database: repair migrations, add seed, add migration/base-fresh tests.
3. Prisma repository slice 1: catalog, flags, audit and users/partners because
   many downstream services depend on them.
4. Prisma repository slice 2: consent, prospects, quote requests, routing,
   lead assignments and notifications.
5. Prisma repository slice 3: Starter/CRM action history and document metadata
   already planned.
6. Redis runtime: introduce `RedisClientPort`, real provider, catalog/flag
   cache, rate limit, anti-spam, duplicate and lock adapters.
7. BullMQ runtime: introduce `QueuePort`, real BullMQ provider, enqueue
   notifications and job metadata.
8. HTTP persistence and constitutional validation: expand integration tests,
   remove runtime memory defaults, keep memory adapters only in test modules.

## Recommended Implementation Order

1. Add failing guardrail tests for production/runtime-normal memory adapters.
2. Update runtime config and adapter ports so tests can select memory explicitly.
3. Repair `0001_foundation`, validate migrations from empty database and add
   seed.
4. Implement Prisma audit repository as the first durable repository and make
   sensitive audit writes awaitable.
5. Implement feature flag Prisma repository plus Redis cache and fail-closed
   tests.
6. Implement catalog Prisma repositories and Redis public caches.
7. Implement quote/consent/prospect/routing/lead repositories and transaction
   orchestration.
8. Implement partner/license/user repositories needed by routing and RBAC.
9. Implement Starter/CRM action repositories and notification metadata.
10. Replace Redis runtime services and routing locks with real Redis provider.
11. Replace queue runtime services with BullMQ provider and enqueue tests.
12. Run full validation: typecheck, lint, unit, integration, contract,
    guardrails, migration/base-fresh and frontend separation tests.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Prisma runtime | Repository integration tests and runtime mode guardrails |
| Migrations | Empty database apply, seed, schema validation and HTTP smoke |
| Audit durable | Persistence tests for success/refusal sensitive actions |
| Feature flags | Persistent source, cache hit/miss, absent/false/true, fail closed |
| Redis | Cache, rate limit, anti-spam, duplicate, locks, PII-safe keys |
| BullMQ | Enqueue visitor/broker jobs, idempotency, no memory queue runtime |
| Public endpoints | Abuse, duplicate, consent, disabled country/product, no heavy sync work |
| Broker/admin | RBAC, MFA, tenant isolation, Starter no CRM, admin sensitive audit |
| Frontend separation | Public app imports/calls no back-office session or clients |
| Constitution | Existing guardrails plus new memory-adapter runtime guardrails |

## Risks

- `0001_foundation` is currently a placeholder; repairing it may require careful
  coordination with already committed 0002-0004 migrations.
- Services directly own arrays today, so repository replacement must avoid
  changing business behavior while moving persistence boundaries.
- Fire-and-forget audit writes may hide persistence failures until changed to
  awaitable behavior on sensitive paths.
- Redis and BullMQ integration can make tests slower or more environment
  dependent unless test adapters and CI setup are explicit.
- Distributed transaction limits mean enqueue failures must be handled through
  idempotency and retryable metadata rather than pretending DB and queue commit
  atomically.
- Strict fail-fast may break local workflows that previously relied on silent
  memory fallback; quickstart and `.env.example` need to make the new setup easy.

## Complexity Tracking

No constitutional violations or exceptions are planned.

## Post-Design Constitution Re-Check

- **Technical platform role**: Pass. Design artifacts cover runtime plumbing and
  do not add regulated business capabilities.
- **Regulatory and consent**: Pass. Data model and contracts preserve durable
  ConsentRecord and no-transmission blockers.
- **Feature flags and activation**: Pass. Feature flag strategy is persistent,
  cached and fail-closed.
- **Frontend application separation**: Pass. Quickstart and contract state no
  functional frontend change; tests retain separation.
- **Security and RBAC**: Pass. Runtime config, PII-safe Redis/job payloads,
  tenant isolation and RBAC tests are required.
- **Data and auditability**: Pass. Durable audit, repository persistence and
  migration rebuild are central deliverables.
- **Routing integrity**: Pass. Redis locks and durable eligibility data support
  existing routing rules without changing them.
- **AI control**: Pass. No AI activation; AI flags remain false by default.
- **UX and content safety**: Pass. No UI/content changes planned.
- **Testing discipline**: Pass. Required tests are explicit and cover forbidden
  cases.
- **Async and reliability**: Pass. BullMQ and retryable metadata are planned for
  asynchronous notifications/jobs.
- **Continuous workflow safety**: Pass. Planning stops here per user request.
