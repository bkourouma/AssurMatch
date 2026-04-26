# Tasks: Prisma Domain Persistence AssurMatch

**Input**: Design documents from `/specs/010-prisma-domain-persistence/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/prisma-domain-persistence-contract.md, quickstart.md

**Continuous Workflow**: This feature is validated and the user explicitly requested automatic continuation from `/speckit.tasks` to `/speckit.implement`. Stop only for constitutional conflict, major ambiguity, compliance/security/data leakage risk, forbidden activation, uncovered product decision, destructive migration risk or blocking validation failure. Do not commit automatically after implementation.

**Tests**: Required. Repository, HTTP, consent, tenant isolation, feature flag, audit, migrations/fresh database and guardrail tests must be added or adapted with the implementation.

**Organization**: Tasks are grouped by independently testable user stories from `spec.md`.

## Phase 1: Setup And Inventory

**Purpose**: Establish the exact repository/runtime surface before code changes.

- [x] T001 Inventory existing priority repository ports and consumers in `backend/src/modules/*/*.repository.ts`
- [x] T002 [P] Inventory Prisma model coverage for priority domains in `backend/prisma/schema.prisma`
- [x] T003 [P] Inventory existing HTTP and guardrail tests that must remain green in `backend/tests/`
- [x] T004 Document implementation status and Prisma-runtime domains in `specs/010-prisma-domain-persistence/quickstart.md`

---

## Phase 2: Foundational Guardrails

**Purpose**: Blocking controls required before runtime repository conversion.

- [x] T005 Update async repository runtime contract and guard helpers in `backend/src/modules/common/repositories/runtime-repository.ts`
- [x] T006 Add or adapt guardrail test forbidding memory repositories outside test in `backend/tests/guardrails/domain-repository-memory.spec.ts`
- [x] T007 Add guardrail test forbidding incomplete Prisma adapter methods in `backend/tests/guardrails/domain-repository-memory.spec.ts`
- [x] T008 Align `AuditLogRepository` and `FeatureFlagRepository` with common runtime repository metadata in `backend/src/modules/audit-logs/audit-log-repository.ts` and `backend/src/modules/feature-flags/feature-flag-repository.ts`

---

## Phase 3: User Story 1 - Resolve Critical Repositories As Prisma Runtime (Priority: P1)

**Goal**: Backend runtime resolves priority domains to complete Prisma implementations outside test.

**Independent Test**: A runtime provider/guardrail test proves priority repositories are Prisma-runtime and memory adapters fail outside test.

### Tests for User Story 1

- [x] T009 [P] [US1] Add repository runtime completeness tests in `backend/tests/unit/repositories/domain-repository-contracts.spec.ts`
- [x] T010 [P] [US1] Add runtime provider binding tests in `backend/tests/integration/runtime-adapters.spec.ts`

### Implementation for User Story 1

- [x] T011 [US1] Convert priority repository interfaces to async contracts in `backend/src/modules/*/*.repository.ts`
- [x] T012 [US1] Add complete Prisma repository classes for all priority domain ports in `backend/src/modules/*/*.repository.ts`
- [x] T013 [US1] Bind runtime modules to Prisma repositories and tests to memory repositories in `backend/src/modules/*/*.module.ts`

---

## Phase 4: User Story 2 - Serve Public Catalog From PostgreSQL (Priority: P1)

**Goal**: Public country/product/offer routes read persisted PostgreSQL records through Prisma.

**Independent Test**: Seed PostgreSQL catalog records, call public routes, and verify disabled/expired records are excluded.

### Tests for User Story 2

- [x] T014 [P] [US2] Add Prisma catalog repository tests in `backend/tests/integration/catalog/prisma-catalog-repositories.spec.ts`
- [x] T015 [P] [US2] Adapt public catalog HTTP non-regression tests in `backend/tests/integration/catalog/public-catalog-flags.spec.ts`

### Implementation for User Story 2

- [x] T016 [US2] Implement `PrismaCountriesRepository`, `PrismaProductsRepository` and `PrismaOffersRepository` mappings in catalog repository files
- [x] T017 [US2] Adapt catalog services/controllers to await async repositories in `backend/src/modules/countries/`, `backend/src/modules/products/` and `backend/src/modules/offers/`

---

## Phase 5: User Story 3 - Persist Consented Quote Requests Durably (Priority: P1)

**Goal**: Consented quote submissions persist Prospect, ConsentRecord and QuoteRequest durably, with no non-compliant persistence without consent.

**Independent Test**: Submit valid and no-consent quote requests and inspect persisted records, routing state, audit and notifications.

### Tests for User Story 3

- [x] T018 [P] [US3] Add Prisma quote-flow repository tests in `backend/tests/integration/public-quotes/prisma-quote-flow-repositories.spec.ts`
- [x] T019 [P] [US3] Adapt quote HTTP consent/no-consent tests in `backend/tests/integration/public-quote-runtime-http.spec.ts`

### Implementation for User Story 3

- [x] T020 [US3] Implement `PrismaConsentRecordsRepository`, `PrismaProspectsRepository` and `PrismaQuoteRequestsRepository`
- [x] T021 [US3] Adapt quote submission, consent and prospect services/controllers to async durable repositories in `backend/src/modules/quote-requests/`, `backend/src/modules/consent/` and `backend/src/modules/prospects/`
- [x] T022 [US3] Add transactional quote persistence or equivalent unit-of-work in `backend/src/modules/quote-requests/quote-submission.service.ts`

---

## Phase 6: User Story 4 - Read And Mutate Broker Leads From Prisma (Priority: P1)

**Goal**: Starter and CRM lead reads/actions use Prisma-backed lead assignment and CRM activity repositories with tenant, role, plan and flag controls.

**Independent Test**: Seed multiple tenants and verify Starter/CRM reads, mutations and denials are durable and tenant-scoped.

### Tests for User Story 4

- [x] T023 [P] [US4] Add Prisma lead assignment repository tests in `backend/tests/integration/leads/prisma-lead-assignment-repository.spec.ts`
- [x] T024 [P] [US4] Add Prisma CRM activity repository tests in `backend/tests/integration/leads/prisma-crm-activity-repository.spec.ts`
- [x] T025 [P] [US4] Adapt Starter and CRM HTTP tenant tests in `backend/tests/integration/leads/`

### Implementation for User Story 4

- [x] T026 [US4] Implement `PrismaLeadAssignmentsRepository` and tenant-scoped history methods in `backend/src/modules/leads/lead-assignments.repository.ts`
- [x] T027 [US4] Implement `PrismaCrmActivityRepository` in `backend/src/modules/leads/crm-activity.repository.ts`
- [x] T028 [US4] Adapt Starter and CRM services/controllers to await async repositories in `backend/src/modules/leads/`

---

## Phase 7: User Story 5 - Persist Routing, Partners, Licenses And Notifications (Priority: P1)

**Goal**: Routing decisions, partner eligibility, license checks and notification traces are persisted durably without changing delivery behavior.

**Independent Test**: Seed partners/licenses, execute routing success/refusal and notification flows, then inspect persisted decisions/traces.

### Tests for User Story 5

- [x] T029 [P] [US5] Add Prisma partner/license repository tests in `backend/tests/integration/partners/prisma-partner-license-repositories.spec.ts`
- [x] T030 [P] [US5] Add Prisma routing/notification repository tests in `backend/tests/integration/leads/prisma-routing-notification-repositories.spec.ts`
- [x] T031 [P] [US5] Adapt routing blocker and notification HTTP tests in `backend/tests/integration/leads/` and `backend/tests/integration/notifications/`

### Implementation for User Story 5

- [x] T032 [US5] Implement `PrismaPartnersRepository` and `PrismaPartnerLicensesRepository`
- [x] T033 [US5] Implement `PrismaRoutingDecisionsRepository` and adapt routing services to async repositories
- [x] T034 [US5] Implement `PrismaNotificationsRepository` and adapt notification services without synchronous delivery coupling

---

## Phase 8: User Story 6 - Reconstruct Fresh Database With Minimal Seeds (Priority: P2)

**Goal**: Fresh database reconstruction and minimal seeds support the durable scenarios without opening forbidden modules.

**Independent Test**: Validate Prisma schema/migrations and run fixture-backed repository/HTTP tests.

### Tests for User Story 6

- [x] T035 [P] [US6] Adapt Prisma schema and migration tests in `backend/tests/integration/prisma-schema.spec.ts` and `backend/tests/integration/prisma-migrations.spec.ts`
- [x] T036 [P] [US6] Add seed safety assertions in `backend/tests/guardrails/runtime-adapter-production.spec.ts`

### Implementation for User Story 6

- [x] T037 [US6] Add migrations only if required in `backend/prisma/migrations/`
- [x] T038 [US6] Update minimal seed and reusable fixtures in `backend/prisma/seed.ts` and `backend/tests/integration/helpers/`

---

## Phase 9: Polish, Documentation And Validation

**Purpose**: Complete cross-cutting documentation, task tracking and final validations.

- [x] T039 Update Prisma-runtime domain documentation in `specs/010-prisma-domain-persistence/quickstart.md`
- [x] T040 Run required searches for `requires async Prisma service integration` and `TODO Prisma`
- [x] T041 Run final validation commands from the user request
- [x] T042 Check off every completed task in `specs/010-prisma-domain-persistence/tasks.md`
- [x] T043 Produce final implementation report with validations, migrations, seeds, risks and commit recommendation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies.
- **Phase 2**: Depends on Phase 1 and blocks all user stories.
- **Phases 3-7**: Depend on Phase 2. They should execute in order because async contract changes affect shared services.
- **Phase 8**: Can start after schema needs are known from Phases 4-7.
- **Phase 9**: Depends on all implementation phases.

### Parallel Opportunities

- T002, T003 can run in parallel with T001.
- Tests marked [P] can be created in parallel when they touch different files.
- Repository implementations in different modules can be parallelized after T011 if owners avoid shared module binding files.

## Implementation Strategy

### MVP First

1. Complete setup and guardrails.
2. Convert repository interfaces and provider bindings.
3. Deliver catalog Prisma runtime slice and validate public routes.
4. Continue quote, broker, routing and notification slices.

### Incremental Delivery

Each story is independently validated through repository tests plus HTTP non-regression. Do not proceed past a slice that breaks consent, RBAC, tenant isolation, durable audit, feature flags or route contracts.

## Notes

- Do not commit automatically after implementation.
- Memory repositories remain test-only.
- Do not add business features or frontend screens.
- Do not activate forbidden regulated modules.
