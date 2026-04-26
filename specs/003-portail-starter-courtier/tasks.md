# Tasks: Portail Starter Courtier

**Input**: Design documents from `/specs/003-portail-starter-courtier/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by user request and constitution: unit, integration, contract, RBAC/security, constitutional guardrails and Playwright smoke.

**Organization**: Tasks are grouped by independently testable user stories.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align documentation, contracts and shared constants for Starter portal implementation.

- [X] T001 Update `AGENTS.md` and `.specify/feature.json` references for feature 003 planning context.
- [X] T002 [P] Add broker Starter OpenAPI contract in `specs/003-portail-starter-courtier/contracts/broker-starter-api.openapi.yaml`.
- [X] T003 [P] Extend shared broker Starter DTO schemas in `packages/shared/contracts/quote.contracts.ts`.
- [X] T004 [P] Add broker Starter audit action constants in `backend/src/modules/audit-logs/quote-audit-actions.ts`.
- [X] T005 [P] Add broker lead export permission to Starter role matrix in `packages/shared/rbac/assurmatch-role-matrix.ts`.

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Core controls required before user story exposure.

- [X] T006 Implement Starter access and capability policy in `backend/src/modules/leads/broker-starter-access-policy.ts`.
- [X] T007 Implement immutable minimal history service in `backend/src/modules/leads/broker-starter-history.service.ts`.
- [X] T008 Implement export permission and scope policy in `backend/src/modules/leads/broker-starter-export-policy.ts`.
- [X] T009 Extend lead assignment record state for seen/action metadata in `backend/src/modules/leads/lead-assignment.service.ts`.
- [X] T010 Wire Starter services/controllers in `backend/src/modules/leads/leads.module.ts`.

**Checkpoint**: Foundation ready; user story implementation can now begin.

---

## Phase 3: User Story 1 - Consulter les leads assignes (Priority: P1)

**Goal**: Starter broker sees only assigned leads with filters and strict tenant isolation.

**Independent Test**: Two brokers with distinct leads; actor for broker A can list only broker A leads and cross-tenant access is refused/audited.

### Tests for User Story 1

- [X] T011 [P] [US1] Add unit tests for Starter access policy in `backend/tests/unit/leads/broker-starter-access-policy.spec.ts`.
- [X] T012 [P] [US1] Add integration tests for Starter lead list and cross-tenant refusal in `backend/tests/integration/leads/broker-starter-list.spec.ts`.

### Implementation for User Story 1

- [X] T013 [US1] Implement Starter list filtering and pagination in `backend/src/modules/leads/broker-starter-leads.service.ts`.
- [X] T014 [US1] Implement Starter controller list endpoint surface in `backend/src/modules/leads/broker-starter.controller.ts`.
- [X] T015 [US1] Update broker lead list UI in `apps/broker/app/leads/page.tsx`.

**Checkpoint**: User Story 1 is functional and tenant-isolated.

---

## Phase 4: User Story 2 - Voir le detail et marquer un lead comme vu (Priority: P1)

**Goal**: Authorized broker opens assigned lead detail, sees minimal PII, lead is marked seen once and audited.

**Independent Test**: First detail read marks seen/history/audit; second read does not duplicate seen history; cross-tenant detail returns no PII.

### Tests for User Story 2

- [X] T016 [P] [US2] Add unit tests for history and seen behavior in `backend/tests/unit/leads/broker-starter-history.service.spec.ts`.
- [X] T017 [P] [US2] Add integration tests for detail seen marking and audit in `backend/tests/integration/leads/broker-starter-detail.spec.ts`.

### Implementation for User Story 2

- [X] T018 [US2] Implement Starter detail and seen marking in `backend/src/modules/leads/broker-starter-leads.service.ts`.
- [X] T019 [US2] Add detail/history controller methods in `backend/src/modules/leads/broker-starter.controller.ts`.
- [X] T020 [US2] Update lead detail UI in `apps/broker/app/leads/[leadAssignmentId]/page.tsx`.

**Checkpoint**: User Story 2 is functional and auditable.

---

## Phase 5: User Story 3 - Accepter, rejeter ou contester un lead (Priority: P1)

**Goal**: Authorized broker can accept, reject with reason or dispute with reason; each action is historized and audited.

**Independent Test**: Actions enforce reason allowlist, status transition rules and no Starter access to advanced CRM actions.

### Tests for User Story 3

- [X] T021 [P] [US3] Add unit tests for action transitions in `backend/tests/unit/leads/broker-starter-lead-actions.service.spec.ts`.
- [X] T022 [P] [US3] Add integration tests for accept/reject/dispute audit in `backend/tests/integration/leads/broker-starter-actions.spec.ts`.

### Implementation for User Story 3

- [X] T023 [US3] Implement accept/reject/dispute service in `backend/src/modules/leads/broker-starter-lead-actions.service.ts`.
- [X] T024 [US3] Add accept/reject/dispute controller methods in `backend/src/modules/leads/broker-starter.controller.ts`.
- [X] T025 [US3] Add action controls and Starter CRM blocked copy in `apps/broker/app/leads/[leadAssignmentId]/page.tsx`.

**Checkpoint**: User Story 3 is functional and no CRM Pro behavior is introduced.

---

## Phase 6: User Story 4 - Dashboard Starter basique (Priority: P2)

**Goal**: Broker sees basic counters scoped to assigned leads.

**Independent Test**: Counters reflect only connected tenant and filters.

- [X] T026 [P] [US4] Add dashboard aggregation tests in `backend/tests/unit/leads/broker-starter-dashboard.spec.ts`.
- [X] T027 [US4] Implement dashboard aggregation in `backend/src/modules/leads/broker-starter-leads.service.ts`.
- [X] T028 [US4] Update Starter dashboard UI in `apps/broker/app/page.tsx`.

---

## Phase 7: User Story 5 - Exporter les leads si autorise (Priority: P2)

**Goal**: Authorized broker exports scoped CSV; unauthorized user gets no sensitive data and audit refusal.

**Independent Test**: Export permission controls success/refusal, row scope and audit.

- [X] T029 [P] [US5] Add export policy tests in `backend/tests/unit/leads/broker-starter-export-policy.spec.ts`.
- [X] T030 [US5] Implement CSV export service/controller behavior in `backend/src/modules/leads/broker-starter-leads.service.ts` and `backend/src/modules/leads/broker-starter.controller.ts`.
- [X] T031 [US5] Add export permission UI messaging in `apps/broker/app/leads/page.tsx`.

---

## Phase 8: User Story 6 - Notifications minimales (Priority: P3)

**Goal**: Broker receives minimal in-app notifications scoped to assigned leads.

**Independent Test**: Notifications are tenant-isolated and read action is audited.

- [X] T032 [P] [US6] Add notification service tests in `backend/tests/unit/leads/broker-starter-notifications.service.spec.ts`.
- [X] T033 [US6] Implement notification list/read service and controller methods in `backend/src/modules/leads/broker-starter-notifications.service.ts` and `backend/src/modules/leads/broker-starter.controller.ts`.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Contract, guardrail, UI smoke and final validation coverage.

- [X] T034 [P] Add broker Starter contract tests in `backend/tests/contract/broker-starter-api.contract.spec.ts`.
- [X] T035 [P] Add constitutional guardrails for blocked CRM/regulatory modules in `backend/tests/guardrails/content/broker-starter-exclusions.spec.ts`.
- [X] T036 [P] Add Playwright smoke coverage in `apps/broker/tests/leads/broker-leads.spec.ts`.
- [X] T037 Verify Prisma model validity in `backend/prisma/schema.prisma`.
- [X] T038 Run final validation commands and record results for the final report.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **US1, US2, US3**: P1; depend on Foundational. US2 and US3 use services introduced in US1.
- **US4, US5**: P2; depend on Foundational and can reuse list filters.
- **US6**: P3; depends on Foundational.
- **Polish**: Depends on all implemented stories.

### Parallel Opportunities

- T002-T005 can run in parallel after T001.
- Test files marked [P] can be written independently.
- US4 dashboard tests and US5 export tests can run in parallel after foundational services exist.
- Contract, guardrail and Playwright tests can run in parallel during polish.

## Implementation Strategy

1. Complete shared contracts, audit constants, access policy and history/export foundations.
2. Deliver P1 stories first: list, detail/seen, accept/reject/dispute.
3. Add P2 dashboard/export and P3 notifications.
4. Finish with contract, guardrail, Playwright and required validation commands.
