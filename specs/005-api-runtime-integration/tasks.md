# Tasks: API Runtime Integration AssurMatch

**Input**: Design documents from `/specs/005-api-runtime-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/runtime-api-alignment.md, quickstart.md

**Continuous Workflow**: User explicitly requested `/speckit.tasks` then automatic `/speckit.implement` with no intermediate confirmation. Stop only on constitutional conflict, major ambiguity, security/compliance/data leakage risk, accidental activation of forbidden modules, or blocking validation failure. Do not commit automatically after implementation.

**Tests**: Required for runtime routes, RBAC, tenant isolation, consent, feature flags, durable audit, migration/fresh database validation, frontend separation and Playwright smoke.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: Prepare runtime implementation and test harness.

- [x] T001 Verify Spec Kit feature context points to `specs/005-api-runtime-integration` in `.specify/feature.json`
- [x] T002 Verify ignore/config hygiene for Node/Nest/Next/Prisma generated files in `.gitignore` and eslint config
- [x] T003 [P] Add shared HTTP runtime test helpers in `backend/tests/integration/runtime-http-test-utils.ts`
- [x] T004 [P] Add route inventory test scaffold in `backend/tests/integration/runtime-route-inventory.spec.ts`

---

## Phase 2: Foundational Runtime Wiring

**Purpose**: Blocking prerequisites for every HTTP story.

- [x] T005 Implement real Nest metadata in `backend/src/app.module.ts` with runtime controllers/providers registered
- [x] T006 Implement Nest bootstrap configuration for validation, errors and shutdown in `backend/src/main.ts`
- [x] T007 Add or update runtime provider/factory wiring for existing domain services in `backend/src/app.module.ts`
- [x] T008 Add standard HTTP error mapping in `backend/src/modules/common/filters/error-response.filter.ts`
- [x] T009 Add request ActorContext/correlation helpers for HTTP routes in `backend/src/modules/common/http/actor-context.ts`
- [x] T010 Add executable Auth/RBAC/MFA Nest guards in `backend/src/modules/auth/guards/`
- [x] T011 Add runtime adapter boundary for PrismaService in `backend/src/modules/common/prisma/prisma.service.ts`
- [x] T012 Add runtime adapter boundary for Redis in `backend/src/modules/common/redis/redis.module.ts`
- [x] T013 Add runtime adapter boundary for BullMQ queues in `backend/src/modules/common/queues/queues.module.ts`
- [x] T014 Add durable-audit runtime path or testable persistence boundary in `backend/src/modules/audit-logs/audit-log-writer.service.ts`
- [x] T015 Add migration/fresh database validation script or test in `backend/tests/integration/prisma-migrations.spec.ts`

---

## Phase 3: User Story 1 - Exposer un runtime HTTP reel (Priority: P1)

**Goal**: Boot the backend as a real Nest HTTP application and expose non-zero route inventory for all required route groups.

**Independent Test**: Start Nest testing module and assert expected public, auth, broker, CRM, admin and health route groups are registered.

### Tests for User Story 1

- [x] T016 [P] [US1] Add route inventory expectations in `backend/tests/integration/runtime-route-inventory.spec.ts`
- [x] T017 [P] [US1] Add contract smoke test for runtime HTTP route existence in `backend/tests/contract/runtime-api.contract.spec.ts`

### Implementation for User Story 1

- [x] T018 [US1] Decorate auth HTTP controller routes in `backend/src/modules/auth/auth.controller.ts`
- [x] T019 [US1] Decorate public country/product/offer/form/quote controllers in `backend/src/modules/*/*public*.controller.ts`
- [x] T020 [US1] Decorate broker Starter and broker base lead controllers in `backend/src/modules/leads/`
- [x] T021 [US1] Decorate broker CRM controller in `backend/src/modules/leads/broker-crm.controller.ts`
- [x] T022 [US1] Decorate admin minimal controllers in `backend/src/modules/**/admin-*.controller.ts` and `backend/src/modules/admin/system-health.controller.ts`
- [x] T023 [US1] Ensure `createAssurMatchApp` in `backend/src/main.ts` returns a Nest app for HTTP tests without breaking legacy tests

---

## Phase 4: User Story 2 - Executer le parcours public via API reelle (Priority: P1)

**Goal**: Public country/product/offer/quote/status routes execute through HTTP and public frontend can call them without broker/admin coupling.

**Independent Test**: GET public countries/products/offers and POST quote request with/without consent through HTTP.

### Tests for User Story 2

- [x] T024 [P] [US2] Add public catalog HTTP e2e tests in `backend/tests/integration/public-runtime-http.spec.ts`
- [x] T025 [P] [US2] Add public quote consent/refusal HTTP e2e tests in `backend/tests/integration/public-quote-runtime-http.spec.ts`
- [x] T026 [P] [US2] Add public frontend API separation smoke test in `apps/public/tests/public-runtime-api.spec.ts`

### Implementation for User Story 2

- [x] T027 [US2] Add public API client boundary in `apps/public/app/lib/public-api.ts`
- [x] T028 [US2] Wire critical public pages/components to API client with loading/error/empty handling in `apps/public/app/`
- [x] T029 [US2] Ensure public controllers enforce feature flags, valid offers, consent and non-heavy sync boundaries in `backend/src/modules/`
- [x] T030 [US2] Ensure public quote status returns minimal visitor-safe data in `backend/src/modules/quote-requests/public-quote-status.controller.ts`

---

## Phase 5: User Story 3 - Proteger broker/admin par auth RBAC MFA tenant (Priority: P1)

**Goal**: Starter, CRM and admin routes enforce real HTTP guards, plan/flag/tenant/read-only rules and audit refusals.

**Independent Test**: HTTP tests prove Starter own-lead access, cross-tenant refusal, Starter CRM denial, Pro CRM flag behavior and read-only mutation refusal.

### Tests for User Story 3

- [x] T031 [P] [US3] Add broker Starter tenant HTTP tests in `backend/tests/integration/broker-starter-runtime-http.spec.ts`
- [x] T032 [P] [US3] Add broker CRM auth/flag/read-only HTTP tests in `backend/tests/integration/broker-crm-runtime-http.spec.ts`
- [x] T033 [P] [US3] Add audit refusal tests for RBAC and tenant blockers in `backend/tests/integration/runtime-audit-http.spec.ts`

### Implementation for User Story 3

- [x] T034 [US3] Apply Auth/RBAC/MFA guards to broker and admin controllers in `backend/src/modules/`
- [x] T035 [US3] Map HTTP ActorContext into Starter services in `backend/src/modules/leads/broker-starter.controller.ts`
- [x] T036 [US3] Map HTTP ActorContext into CRM services in `backend/src/modules/leads/broker-crm.controller.ts`
- [x] T037 [US3] Ensure CRM rejects Starter and false/absent `broker_crm_enabled` by default in `backend/src/modules/leads/broker-crm-access-policy.ts`
- [x] T038 [US3] Ensure read-only mutation/export refusals are returned as HTTP errors and audited in `backend/src/modules/leads/`

---

## Phase 6: User Story 4 - Donnees et infrastructures durables (Priority: P1)

**Goal**: Runtime adapters for Prisma, Redis, BullMQ and AuditLog are real outside tests, with memory adapters test-only.

**Independent Test**: Adapter tests prove non-test runtime does not register memory stores and migration validation succeeds or fails explicitly.

### Tests for User Story 4

- [x] T039 [P] [US4] Add Prisma/adapter runtime tests in `backend/tests/integration/runtime-adapters.spec.ts`
- [x] T040 [P] [US4] Add migration/fresh schema validation test or documented validation in `backend/tests/integration/prisma-migrations.spec.ts`

### Implementation for User Story 4

- [x] T041 [US4] Update `PrismaService` to wrap real PrismaClient outside tests while preserving test-safe transaction behavior
- [x] T042 [US4] Update `RedisModule` to create real Redis client outside tests and memory client only for test mode
- [x] T043 [US4] Update `QueuesModule` to create BullMQ queues outside tests and memory queue only for test mode
- [x] T044 [US4] Update `AuditLogWriter` to use durable persistence boundary outside tests and keep memory writer for tests
- [x] T045 [US4] Verify `backend/prisma/schema.prisma` and migrations cover runtime entities without enabling forbidden modules

---

## Phase 7: User Story 5 - Aligner OpenAPI DTOs erreurs (Priority: P2)

**Goal**: Runtime contracts, DTO validation and HTTP errors match real controllers.

**Independent Test**: Contract tests call real routes and invalid DTOs fail before service mutation.

### Tests for User Story 5

- [x] T046 [P] [US5] Add invalid DTO/error mapping tests in `backend/tests/contract/runtime-validation.contract.spec.ts`
- [x] T047 [P] [US5] Add OpenAPI/runtime alignment notes or generated artifact check in `specs/005-api-runtime-integration/contracts/runtime-api-alignment.md`

### Implementation for User Story 5

- [x] T048 [US5] Add reusable Zod/Nest validation helper in `backend/src/modules/common/http/zod-validation.ts`
- [x] T049 [US5] Apply DTO validation helpers to decorated controllers in `backend/src/modules/`
- [x] T050 [US5] Standardize public/broker/admin HTTP error responses in `backend/src/modules/common/filters/error-response.filter.ts`

---

## Phase 8: User Story 6 - Prouver par HTTP et Playwright reels (Priority: P2)

**Goal**: Tests navigate real apps and exercise real HTTP paths rather than file reads or mocks.

**Independent Test**: `npm run test:web` opens public and back-office apps and verifies protected/public journeys.

### Tests for User Story 6

- [x] T051 [P] [US6] Add Playwright public runtime smoke in `apps/public/tests/public-runtime-smoke.spec.ts`
- [x] T052 [P] [US6] Add Playwright broker Starter/CRM runtime smoke in `apps/broker/tests/runtime-broker-smoke.spec.ts`
- [x] T053 [P] [US6] Add frontend separation guardrail in `backend/tests/guardrails/content/frontend-separation.spec.ts`

### Implementation for User Story 6

- [x] T054 [US6] Add broker API client boundary in `apps/broker/app/lib/broker-api.ts`
- [x] T055 [US6] Wire critical Starter/CRM broker views to API client with loading/error/empty/forbidden handling in `apps/broker/app/`
- [x] T056 [US6] Add admin API client boundary or runtime notes for admin endpoints in `apps/admin/app/lib/admin-api.ts`

---

## Final Phase: Validation And Closeout

**Purpose**: Complete checks, task status and final evidence.

- [x] T057 Run `npm run typecheck`
- [x] T058 Run `npm run lint`
- [x] T059 Run `npm run test`
- [x] T060 Run `npm run test:web`
- [x] T061 Run `npm run build`
- [x] T062 Run `npx prisma validate --schema backend/prisma/schema.prisma`
- [x] T063 Run migration/base-fresh validation or equivalent documented check
- [x] T064 Run `npm audit --audit-level=high`
- [x] T065 Run `git diff --check`
- [x] T066 Update this `specs/005-api-runtime-integration/tasks.md` with completed checkboxes
- [x] T067 Produce final report with task counts, modified files, controllers, routes, migrations, tests, validation results, unfinished items, residual risks and commit recommendation

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 Setup has no dependencies.
- Phase 2 Foundational depends on Phase 1 and blocks all stories.
- US1 proves real HTTP route exposure and should complete before US2-US6.
- US2 and US3 both depend on US1 route wiring and foundational guards.
- US4 can progress after foundational adapter boundaries and must complete before final validation claims durable runtime.
- US5 depends on decorated controllers from US1-US3.
- US6 depends on frontend API clients and real routes.
- Final validation depends on all implemented phases.

### Parallel Opportunities

- T003/T004, T016/T017, T024/T025/T026, T031/T032/T033, T039/T040, T046/T047, and T051/T052/T053 can be worked in parallel by separate owners because they touch different files.

## Implementation Strategy

1. Establish route inventory and Nest runtime skeleton.
2. Add guards, validation, error mapping and adapter boundaries.
3. Expose public routes and prove consent/flags/offers via HTTP.
4. Expose broker/admin routes and prove RBAC/MFA/tenant/CRM blockers.
5. Add durable runtime checks and contract alignment.
6. Replace critical frontend mocks with API clients without UI redesign.
7. Run required validations and report residual risk.
