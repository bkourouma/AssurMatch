# Tasks: Domain Repositories Extraction AssurMatch

**Input**: Design documents from `/specs/009-domain-repositories-extraction/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/repository-extraction-contract.md, quickstart.md

**Continuous Workflow**: Spec 009 is validated by the user request and contains no `[NEEDS CLARIFICATION]` markers. Continue automatically into implementation after task generation. Stop only for constitutional conflict, major ambiguity, compliance/security/data leakage risk, forbidden activation, uncovered product decision or blocking validation failure. Do not commit automatically after implementation.

**Tests**: Tests are required for repository extraction, memory-test guardrails, public endpoint non-regression, Starter/CRM tenant and plan/flag behavior, durable audit, persistent feature flags and fresh database/migration validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish task tracking and protect the repository before touching runtime code.

- [x] T001 Verify current branch and Spec Kit prerequisites using `.specify/scripts/powershell/check-prerequisites.ps1`
- [x] T002 [P] Inspect existing repository/memory state in `backend/src/modules/` and document implementation targets in `specs/009-domain-repositories-extraction/tasks.md`
- [x] T003 [P] Verify ignore/config coverage for Node/TypeScript outputs in `.gitignore` and ESLint config files

---

## Phase 2: Foundational (Repository Boundary)

**Purpose**: Blocking repository contracts, provider guardrails and shared test fixtures used by every user story.

- [x] T004 Create common repository provider guard helpers in `backend/src/modules/common/repositories/runtime-repository.ts`
- [x] T005 [P] Add repository test fixtures in `backend/tests/unit/repositories/domain-repository-contracts.spec.ts`
- [x] T006 [P] Add runtime memory guardrail coverage in `backend/tests/guardrails/domain-repository-memory.spec.ts`
- [x] T007 Align `AuditLogRepository` and `AuditLogWriter` with runtime repository guard semantics in `backend/src/modules/audit-logs/`
- [x] T008 Align `FeatureFlagRepository` and `FeatureFlagsService` with runtime repository guard semantics in `backend/src/modules/feature-flags/`

**Checkpoint**: Repository modes, memory-test semantics and durable audit/flag repository ports are guarded before domain extraction.

---

## Phase 3: User Story 1 - Initialiser les repositories comme providers runtime (Priority: P1)

**Goal**: Runtime-normal modules expose domain repositories as injectable providers and reject memory repositories outside tests.

**Independent Test**: Unit/guardrail tests prove all priority repository adapters expose `mode`, memory adapters work only in tests and runtime guard fails outside tests.

### Tests for User Story 1

- [x] T009 [P] [US1] Add provider contract tests for repository modes in `backend/tests/unit/repositories/domain-repository-contracts.spec.ts`
- [x] T010 [P] [US1] Add guardrail test for extracted domain memory state in `backend/tests/guardrails/domain-repository-memory.spec.ts`

### Implementation for User Story 1

- [x] T011 [P] [US1] Create catalog repository ports/adapters in `backend/src/modules/countries/countries.repository.ts`, `backend/src/modules/products/products.repository.ts` and `backend/src/modules/offers/offers.repository.ts`
- [x] T012 [P] [US1] Create quote flow repository ports/adapters in `backend/src/modules/prospects/prospects.repository.ts`, `backend/src/modules/consent/consent-records.repository.ts` and `backend/src/modules/quote-requests/quote-requests.repository.ts`
- [x] T013 [P] [US1] Create lead/routing repository ports/adapters in `backend/src/modules/leads/lead-assignments.repository.ts` and `backend/src/modules/leads/routing-decisions.repository.ts`
- [x] T014 [P] [US1] Create partner/license repository ports/adapters in `backend/src/modules/partners/partners.repository.ts` and `backend/src/modules/partner-licenses/partner-licenses.repository.ts`
- [x] T015 [P] [US1] Create CRM and notification repository ports/adapters in `backend/src/modules/leads/crm-activity.repository.ts` and `backend/src/modules/notifications/notifications.repository.ts`
- [x] T016 [US1] Export repository tokens/providers from impacted modules in `backend/src/modules/*/*.module.ts`

**Checkpoint**: Repositories can be instantiated and guarded independently of business routes.

---

## Phase 4: User Story 2 - Lire le catalogue public depuis les repositories (Priority: P1)

**Goal**: Countries, products and offers services read/write through repositories while preserving public flags, status and offer validity rules.

**Independent Test**: Public catalog unit/integration/HTTP tests use repository-backed seed data and still block disabled/expired/unvalidated data.

### Tests for User Story 2

- [x] T017 [P] [US2] Add catalog repository/service tests in `backend/tests/unit/repositories/catalog-repositories.spec.ts`
- [x] T018 [P] [US2] Extend public catalog HTTP non-regression tests in `backend/tests/integration/public-runtime-http.spec.ts`

### Implementation for User Story 2

- [x] T019 [US2] Refactor `CountriesService` to use `CountriesRepository` in `backend/src/modules/countries/countries.module.ts`
- [x] T020 [US2] Refactor `ProductsService` to use `ProductsRepository` in `backend/src/modules/products/products.module.ts`
- [x] T021 [US2] Refactor offer admin/public catalog services to use `OffersRepository` in `backend/src/modules/offers/`

**Checkpoint**: Public catalog remains route-compatible and no longer uses catalog arrays as primary service state.

---

## Phase 5: User Story 3 - Persister une demande de devis consentie via repositories (Priority: P1)

**Goal**: Quote submission creates Prospect, ConsentRecord and QuoteRequest through repositories, with no routing or notification without consent.

**Independent Test**: Quote submission tests prove durable repository writes for valid consent and no assignment/notification for missing consent.

### Tests for User Story 3

- [x] T022 [P] [US3] Add quote flow repository tests in `backend/tests/unit/repositories/quote-flow-repositories.spec.ts`
- [x] T023 [P] [US3] Extend public quote HTTP non-regression tests in `backend/tests/integration/public-quote-runtime-http.spec.ts`
- [x] T024 [P] [US3] Add no-consent repository guard test in `backend/tests/integration/consent/no-consent-blocker.spec.ts`

### Implementation for User Story 3

- [x] T025 [US3] Refactor `ProspectsService` to use `ProspectsRepository` in `backend/src/modules/prospects/prospects.service.ts`
- [x] T026 [US3] Refactor `ConsentService` record storage to use `ConsentRecordsRepository` in `backend/src/modules/consent/consent.module.ts`
- [x] T027 [US3] Refactor `QuoteSubmissionService` to use `QuoteRequestsRepository` in `backend/src/modules/quote-requests/quote-submission.service.ts`
- [x] T028 [US3] Wire quote repository dependencies in `backend/src/modules/quote-requests/quote-requests.module.ts` and `backend/src/runtime/assurmatch-runtime.ts`

**Checkpoint**: Consented quote flow stores state through repositories and no-consent flow remains non-transmissive.

---

## Phase 6: User Story 4 - Exposer les leads broker depuis les assignments persistants (Priority: P1)

**Goal**: Starter and CRM lead reads/actions use lead assignment and CRM repositories with tenant, plan, flag and read-only controls preserved.

**Independent Test**: Starter and CRM HTTP tests show repository-backed leads, Starter CRM denial, `broker_crm_enabled` fail-closed and cross-tenant denial.

### Tests for User Story 4

- [x] T029 [P] [US4] Add lead assignment repository tests in `backend/tests/unit/repositories/lead-assignment-repository.spec.ts`
- [x] T030 [P] [US4] Add CRM activity repository tests in `backend/tests/unit/repositories/crm-activity-repository.spec.ts`
- [x] T031 [P] [US4] Extend Starter HTTP tests in `backend/tests/integration/broker-starter-runtime-http.spec.ts`
- [x] T032 [P] [US4] Extend CRM HTTP tests in `backend/tests/integration/broker-crm-runtime-http.spec.ts`

### Implementation for User Story 4

- [x] T033 [US4] Refactor `LeadAssignmentService` to use `LeadAssignmentsRepository` in `backend/src/modules/leads/lead-assignment.service.ts`
- [x] T034 [US4] Refactor Starter history/services to use repository-backed lead history in `backend/src/modules/leads/`
- [x] T035 [US4] Refactor CRM activity/history services to use `CRMActivityRepository` in `backend/src/modules/leads/`
- [x] T036 [US4] Preserve CRM plan/flag and tenant controls in `backend/src/modules/leads/broker-crm-access-policy.ts`

**Checkpoint**: Starter and CRM routes remain compatible and repository-backed.

---

## Phase 7: User Story 5 - Conserver le routage et l'audit durables (Priority: P1)

**Goal**: Routing eligibility and decisions use partner, license, assignment and routing repositories while keeping existing blockers and durable audit.

**Independent Test**: Routing tests prove eligible assignment, expired/inactive/unauthorized refusal, durable routing decision and audit.

### Tests for User Story 5

- [x] T037 [P] [US5] Add partner/license repository tests in `backend/tests/unit/repositories/partner-license-repositories.spec.ts`
- [x] T038 [P] [US5] Add routing decision repository tests in `backend/tests/unit/repositories/routing-decision-repository.spec.ts`
- [x] T039 [P] [US5] Extend routing blocker/success tests in `backend/tests/integration/leads/routing-blockers.spec.ts` and `backend/tests/integration/leads/routing-success.spec.ts`
- [x] T040 [P] [US5] Extend durable audit tests in `backend/tests/integration/runtime-audit-repository.spec.ts`

### Implementation for User Story 5

- [x] T041 [US5] Refactor `PartnersService` to use `PartnersRepository` in `backend/src/modules/partners/partners.module.ts`
- [x] T042 [US5] Refactor `PartnerLicensesService` to use `PartnerLicensesRepository` in `backend/src/modules/partner-licenses/partner-licenses.module.ts`
- [x] T043 [US5] Refactor `RoutingDecisionService` to use `RoutingDecisionsRepository` in `backend/src/modules/leads/routing-decision.service.ts`
- [x] T044 [US5] Refactor notifications trace storage to use `NotificationsRepository` in `backend/src/modules/notifications/notifications.module.ts`

**Checkpoint**: Routing remains constitutionally blocked when consent/license/authorization/tenant conditions fail.

---

## Phase 8: User Story 6 - Reduire AssurMatchRuntime sans rupture brutale (Priority: P2)

**Goal**: AssurMatchRuntime keeps only transition orchestration and documents residual dependencies.

**Independent Test**: Guardrails prove extracted domains are not reintroduced as primary memory state and residual runtime ownership is documented.

### Tests for User Story 6

- [x] T045 [P] [US6] Add runtime residual guardrail checks in `backend/tests/guardrails/runtime-memory-boundaries.spec.ts`

### Implementation for User Story 6

- [x] T046 [US6] Reduce extracted domain state ownership in `backend/src/runtime/assurmatch-runtime.ts`
- [x] T047 [US6] Document remaining runtime residuals in `specs/009-domain-repositories-extraction/runtime-residuals.md`

**Checkpoint**: Runtime facade remains compatible but no longer owns extracted primary domain state.

---

## Phase 9: Polish & Cross-Cutting Validation

**Purpose**: Full validation, migration safety and task completion.

- [x] T048 [P] Validate Prisma schema with `npx prisma validate --schema backend/prisma/schema.prisma`
- [x] T049 [P] Validate fresh database/migration equivalence using `backend/tests/integration/prisma-migrations.spec.ts`
- [x] T050 Run `npm run typecheck`
- [x] T051 Run `npm run lint`
- [x] T052 Run `npm run test`
- [x] T053 Run `npm run test:web`
- [x] T054 Run `npm run build`
- [x] T055 Run `npm audit --audit-level=high`
- [x] T056 Run `git diff --check`
- [x] T057 Update all completed checkboxes in `specs/009-domain-repositories-extraction/tasks.md`
- [x] T058 Produce final implementation report with modified files, repositories/providers, migrations, tests, validation results, residual runtime dependencies and commit recommendation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies.
- **Phase 2 Foundational**: depends on Phase 1 and blocks all user stories.
- **US1**: depends on Phase 2; creates repository adapters/tokens needed by all other stories.
- **US2**: depends on US1 catalog repositories.
- **US3**: depends on US1 quote repositories; can proceed after US1.
- **US4**: depends on US1 lead/CRM repositories and US3/US5 where routing seed data is required.
- **US5**: depends on US1 partner/license/routing repositories and integrates with US3 lead creation.
- **US6**: depends on completed extracted domain slices.
- **Polish**: depends on implementation slices intended for this feature.

### Parallel Opportunities

- T005 and T006 can be created in parallel after T004.
- Repository adapter files T011-T015 touch separate domains and can be parallelized after T004.
- Repository tests T017, T022, T029, T030, T037 and T038 touch separate files and can be parallelized after adapters exist.
- HTTP non-regression extensions T018, T023, T031, T032 and T039 touch separate suites and can be parallelized after services are refactored.
- Final validations T048 and T049 can run before full test commands once implementation compiles.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 repository boundary and provider guardrails.
3. Complete US2 public catalog extraction and validate public catalog non-regression.

### Incremental Delivery

1. Add quote flow repositories and validate consent/no-consent behavior.
2. Add partner/license/routing repositories and validate routing blockers.
3. Add Starter and CRM repository-backed reads/actions with tenant/flag checks.
4. Reduce `AssurMatchRuntime` residual ownership.
5. Run full validation matrix.

### Constitutional Stop Conditions

Stop if implementation would add a business feature, change routing policy, expose broker/admin data publicly, allow transmission without consent, route to inactive/unauthorized/expired-license brokers, allow Starter CRM, open CRM without `broker_crm_enabled`, weaken tenant isolation/RBAC/audit, or require activating excluded regulated modules.
