# Tasks: Runtime PostgreSQL Smoke Tests AssurMatch

**Input**: Design documents from `/specs/011-runtime-postgres-smoke-tests/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/runtime-postgres-smoke-contract.md, quickstart.md

**Continuous Workflow**: The user explicitly requested `/speckit.tasks` followed by `/speckit.implement` without stopping. Proceed through implementation because the spec is validated, committed/approved by user request and has no `[NEEDS CLARIFICATION]` markers. Stop on constitutional conflict, DATABASE_URL safety ambiguity, regulatory/security/data leakage risk, accidental activation of a forbidden module, production database risk, uncovered product decision or blocking validation failure. Do not commit automatically after implementation.

**Tests**: Tests are required because this feature is a runtime smoke-test suite. The suite must prove non-test PostgreSQL runtime behavior, repository guardrails, public HTTP routes, consent/no-consent, broker tenant isolation, persisted flags and durable audit.

**Organization**: Tasks are grouped by user story to enable independently testable increments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions
- Include the constitutional concern when relevant

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the runtime-smoke skeleton without changing business routes.

- [x] T001 Create runtime PostgreSQL smoke test directory structure in backend/tests/runtime-postgres/
- [x] T002 Add npm script `test:runtime:postgres` in package.json for the dedicated non-test smoke runner
- [x] T003 [P] Add smoke runner entrypoint in backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T004 [P] Add smoke environment helper in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [x] T005 [P] Add smoke quickstart implementation notes to specs/011-runtime-postgres-smoke-tests/quickstart.md

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Safety controls that block all smoke scenarios until satisfied.

**CRITICAL**: No HTTP smoke scenario can run until these controls are complete.

- [x] T006 Update runtime config to recognize `runtime-smoke` without treating it as `test` in backend/src/config/config.module.ts
- [x] T007 Implement smoke DATABASE_URL anti-production validation in backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts
- [x] T008 Implement migration validation/application helper in backend/tests/runtime-postgres/runtime-postgres-smoke-migrations.ts
- [x] T009 Implement NestJS real HTTP smoke harness in backend/tests/runtime-postgres/runtime-postgres-smoke-harness.ts
- [x] T010 Implement direct Prisma verifier client handling in backend/tests/runtime-postgres/runtime-postgres-smoke-harness.ts
- [x] T011 Implement repository runtime guard assertions in backend/tests/runtime-postgres/runtime-postgres-smoke-assertions.ts
- [x] T012 Implement smoke run id and synthetic data helpers in backend/tests/runtime-postgres/runtime-postgres-smoke-data.ts
- [x] T013 Implement scoped cleanup helper with reverse dependency order in backend/tests/runtime-postgres/runtime-postgres-smoke-cleanup.ts

**Checkpoint**: The suite can safely refuse unsafe configuration, start real runtime, verify Prisma repositories and clean smoke data.

---

## Phase 3: User Story 1 - Prove runtime PostgreSQL startup outside test (Priority: P1)

**Goal**: Launch the backend with a real smoke database outside `NODE_ENV=test` and fail if memory repositories are used.

**Independent Test**: Run `npm run test:runtime:postgres` with a smoke `DATABASE_URL`; health succeeds and repository guard confirms Prisma runtime.

### Tests for User Story 1

- [x] T014 [US1] Add runtime startup and health smoke scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts
- [x] T015 [US1] Add repository memory rejection scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 1

- [x] T016 [US1] Wire US1 scenarios into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T017 [US1] Verify health call uses existing `GET /admin/system/health` and authorized synthetic admin headers in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

**Checkpoint**: Runtime smoke startup is functional and independently testable.

---

## Phase 4: User Story 2 - Verify public catalog from PostgreSQL (Priority: P1)

**Goal**: Seed active catalog rows, call public catalog routes and compare responses to PostgreSQL.

**Independent Test**: Run the catalog smoke scenario and verify HTTP country/product/offer results match direct DB rows.

### Tests for User Story 2

- [x] T018 [US2] Add catalog seed helper for country/product/offer in backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts
- [x] T019 [US2] Add public catalog HTTP and DB assertion scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 2

- [x] T020 [US2] Wire catalog scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T021 [US2] Add inactive or expired offer exclusion assertion when supported by seed data in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

**Checkpoint**: Public catalog smoke is functional and independently testable.

---

## Phase 5: User Story 3 - Verify consented quote durable persistence (Priority: P1)

**Goal**: Submit a quote request with valid consent and verify Prospect, ConsentRecord, QuoteRequest, LeadAssignment, RoutingDecision/equivalent and AuditLog in DB.

**Independent Test**: Run the consented quote smoke scenario against the seeded catalog and eligible broker.

### Tests for User Story 3

- [x] T022 [US3] Add eligible broker, license, consent text and quote form seed helpers in backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts
- [x] T023 [US3] Add consented `POST /quote-requests` HTTP and DB assertion scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 3

- [x] T024 [US3] Wire consented quote scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T025 [US3] Ensure DB assertions verify relationships and avoid raw PII output in backend/tests/runtime-postgres/runtime-postgres-smoke-assertions.ts

**Checkpoint**: Consented quote smoke is functional and independently testable.

---

## Phase 6: User Story 4 - Verify no-consent refusal (Priority: P1)

**Goal**: Submit a quote request without consent and prove no non-compliant persistence or assignment occurs.

**Independent Test**: Run the no-consent smoke scenario and verify HTTP refusal plus DB absence of lead assignment and broker notification.

### Tests for User Story 4

- [x] T026 [US4] Add no-consent `POST /quote-requests` refusal scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 4

- [x] T027 [US4] Wire no-consent scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T028 [US4] Add refusal audit/trace assertion when current runtime behavior exposes it in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

**Checkpoint**: No-consent smoke is functional and independently testable.

---

## Phase 7: User Story 5 - Verify Broker Starter tenant isolation (Priority: P1)

**Goal**: Prove Starter broker A sees only A's lead and broker B cannot see it.

**Independent Test**: Run Starter smoke scenario with two synthetic brokers and compare HTTP visibility to DB tenant ownership.

### Tests for User Story 5

- [x] T029 [US5] Add Starter broker and assigned lead seed helpers in backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts
- [x] T030 [US5] Add `GET /broker/starter/leads` tenant isolation scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 5

- [x] T031 [US5] Wire Starter tenant isolation scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T032 [US5] Verify synthetic actor headers include tenant, Starter plan, roles and MFA in backend/tests/runtime-postgres/runtime-postgres-smoke-data.ts

**Checkpoint**: Starter tenant isolation smoke is functional and independently testable.

---

## Phase 8: User Story 6 - Verify Broker CRM Pro flag behavior (Priority: P1)

**Goal**: Prove CRM Pro succeeds only when `broker_crm_enabled` is persistently true and is refused when absent or false.

**Independent Test**: Run CRM smoke scenario, toggle persisted flag and verify HTTP success/refusal.

### Tests for User Story 6

- [x] T033 [US6] Add Pro broker and assigned lead seed helpers in backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts
- [x] T034 [US6] Add `GET /broker/crm/leads` enabled/disabled scenario in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 6

- [x] T035 [US6] Wire CRM enabled/disabled scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T036 [US6] Add feature flag cache refresh or fresh runtime handling for CRM toggle in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

**Checkpoint**: CRM Pro flag smoke is functional and independently testable.

---

## Phase 9: User Story 7 - Verify persisted feature flags fail closed (Priority: P2)

**Goal**: Prove sensitive flags are absent/false by default and the suite does not activate forbidden modules.

**Independent Test**: Run persisted flag smoke scenario and verify DB/runtime values for sensitive flags.

### Tests for User Story 7

- [x] T037 [US7] Add persisted feature flag default assertions in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 7

- [x] T038 [US7] Wire feature flag default scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T039 [US7] Ensure prohibited flags remain false/absent in smoke cleanup and seed helpers in backend/tests/runtime-postgres/runtime-postgres-smoke-seed.ts

**Checkpoint**: Persisted feature flag smoke is functional and independently testable.

---

## Phase 10: User Story 8 - Verify durable audit (Priority: P2)

**Goal**: Prove at least one sensitive action creates durable AuditLog and admin audit endpoint returns it when applicable.

**Independent Test**: Run audit smoke scenario and verify DB AuditLog by correlation id, then optional admin endpoint visibility.

### Tests for User Story 8

- [x] T040 [US8] Add durable AuditLog DB assertion in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts
- [x] T041 [US8] Add optional `GET /admin/audit-logs` authorized/unauthorized assertion in backend/tests/runtime-postgres/runtime-postgres-smoke.scenarios.ts

### Implementation for User Story 8

- [x] T042 [US8] Wire audit scenario into backend/tests/runtime-postgres/run-runtime-postgres-smoke.ts
- [x] T043 [US8] Ensure audit cleanup is deletion-safe or isolated by smoke run id in backend/tests/runtime-postgres/runtime-postgres-smoke-cleanup.ts

**Checkpoint**: Durable audit smoke is functional and independently testable.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, CI notes, validation and task tracking.

- [x] T044 [P] Update docs/runtime-postgres-smoke.md with local, Docker, external DB and CI usage
- [x] T045 [P] Update specs/011-runtime-postgres-smoke-tests/quickstart.md with final script and troubleshooting details
- [x] T046 Run `npm run test:runtime:postgres` when PostgreSQL smoke is available and record result
- [x] T047 Run `npm run typecheck` and record result
- [x] T048 Run `npm run lint` and record result
- [x] T049 Run `npm run test` and record result
- [x] T050 Run `npm run test:web` and record result
- [x] T051 Run `npm run build` and record result
- [x] T052 Run `npx prisma validate --schema backend/prisma/schema.prisma` with validation DATABASE_URL and record result
- [x] T053 Run migration reconstruction or equivalent validation and record result
- [x] T054 Run `npm audit --audit-level=high` and record result
- [x] T055 Run `git diff --check` and record result
- [x] T056 Re-run Constitution Check evidence against completed implementation
- [x] T057 Check off every completed task in specs/011-runtime-postgres-smoke-tests/tasks.md
- [x] T058 Produce final report with task counts, files changed, scripts, Docker/CI, runtime-smoke env, protections, scenarios, validations, unfinished items, residual risks and commit recommendation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all smoke scenarios.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2-US8**: Depend on Foundational and can reuse the US1 harness; implementation should proceed in listed order because later scenarios reuse seed and cleanup helpers.
- **Polish (Phase 11)**: Depends on all selected scenarios.

### User Story Dependencies

- **US1**: MVP and required first proof.
- **US2**: Requires seed/cleanup foundation.
- **US3**: Requires catalog/partner/consent seed helpers.
- **US4**: Reuses quote seed and cleanup helpers from US3.
- **US5**: Reuses broker seed helpers.
- **US6**: Reuses broker and flag helpers.
- **US7**: Reuses flag helpers.
- **US8**: Reuses correlation/audit evidence from quote/broker scenarios.

### Parallel Opportunities

- T003, T004 and T005 can run in parallel after T001/T002.
- T007, T008, T011, T012 and T013 can be built in parallel if owners avoid shared files.
- Documentation tasks T044 and T045 can run in parallel with final validation.
- Validation commands T047-T055 should generally run sequentially in final reporting to keep logs clear.

---

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 health/runtime and repository guard.
3. Run `npm run test:runtime:postgres` against a smoke DB if available.

### Incremental Delivery

1. Add US2 catalog proof.
2. Add US3/US4 quote consent and no-consent proof.
3. Add US5/US6 broker Starter/CRM proof.
4. Add US7/US8 persisted flags and durable audit proof.
5. Finish docs and final validations.

### Safety Notes

- Do not commit automatically.
- Do not run against production, staging shared data or real PII.
- Do not weaken existing test-only memory adapter behavior.
- Do not modify Web Publique Client or Back-office Partenaires/Plateforme routes/layouts.
- Do not activate payment, subscription, policy issuance, attestation, e-signature, claims, insurer API or advanced AI.
