# Tasks: CRM Courtier Pro/Enterprise

**Input**: Design documents from `/specs/004-crm-courtier-pro/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by user request and constitution: unit, integration, contract, RBAC/security, audit, public separation guardrails and Playwright smoke.

**Organization**: Tasks are grouped by independently testable user stories.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align documentation, contracts, RBAC and audit constants for CRM implementation.

- [X] T001 Update `AGENTS.md` and `.specify/feature.json` references for feature 004 planning context.
- [X] T002 [P] Add broker CRM OpenAPI contract in `specs/004-crm-courtier-pro/contracts/broker-crm-api.openapi.yaml`.
- [X] T003 [P] Extend shared CRM DTO schemas in `packages/shared/contracts/quote.contracts.ts`.
- [X] T004 [P] Add broker CRM audit action constants in `backend/src/modules/audit-logs/quote-audit-actions.ts`.
- [X] T005 [P] Extend broker Pro/Enterprise RBAC permissions in `packages/shared/rbac/assurmatch-role-matrix.ts`.

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Core controls required before CRM exposure.

- [X] T006 Implement CRM access, scope and capability policy in `backend/src/modules/leads/broker-crm-access-policy.ts`.
- [X] T007 Extend lead assignment record CRM metadata in `backend/src/modules/leads/lead-assignment.service.ts`.
- [X] T008 Implement CRM pipeline history service in `backend/src/modules/leads/broker-crm-history.service.ts`.
- [X] T009 Implement CRM export policy in `backend/src/modules/leads/broker-crm-export-policy.ts`.
- [X] T010 Wire CRM services/controller in `backend/src/modules/leads/leads.module.ts`.

**Checkpoint**: Foundation ready; user story implementation can now begin.

---

## Phase 3: User Story 1 - Acceder au CRM Pro/Enterprise (Priority: P1)

**Goal**: Pro/Enterprise brokers can access CRM; Starter, disabled flag and unauthorized users are denied and audited.

**Independent Test**: Pro and Enterprise actor pass; Starter actor and disabled `broker_crm_enabled` fail with audit evidence.

### Tests for User Story 1

- [X] T011 [P] [US1] Add CRM access policy unit tests in `backend/tests/unit/leads/broker-crm-access-policy.spec.ts`.
- [X] T012 [P] [US1] Add Starter denial guardrail tests in `backend/tests/guardrails/content/broker-crm-exclusions.spec.ts`.

### Implementation for User Story 1

- [X] T013 [US1] Implement CRM access policy plan/flag/RBAC checks in `backend/src/modules/leads/broker-crm-access-policy.ts`.
- [X] T014 [US1] Add CRM controller capability methods in `backend/src/modules/leads/broker-crm.controller.ts`.
- [X] T015 [US1] Add CRM broker entry page in `apps/broker/app/crm/page.tsx`.

**Checkpoint**: User Story 1 is functional and access-gated.

---

## Phase 4: User Story 2 - Piloter les leads en Kanban et liste (Priority: P1)

**Goal**: Authorized brokers see scoped CRM leads in list and Kanban with filters and permission-aware search.

**Independent Test**: Two broker tenants and multiple advisors; results follow tenant and role scope.

### Tests for User Story 2

- [X] T016 [P] [US2] Add CRM list/Kanban unit tests in `backend/tests/unit/leads/broker-crm-leads.service.spec.ts`.
- [X] T017 [P] [US2] Add CRM list tenant isolation integration tests in `backend/tests/integration/leads/broker-crm-flows.spec.ts`.

### Implementation for User Story 2

- [X] T018 [US2] Implement CRM list, search and Kanban grouping in `backend/src/modules/leads/broker-crm-leads.service.ts`.
- [X] T019 [US2] Add CRM list/Kanban controller methods in `backend/src/modules/leads/broker-crm.controller.ts`.
- [X] T020 [US2] Add CRM lead table UI in `apps/broker/app/crm/leads/page.tsx`.

**Checkpoint**: User Story 2 is functional and tenant-isolated.

---

## Phase 5: User Story 3 - Gerer le detail et pipeline (Priority: P1)

**Goal**: Authorized brokers open CRM detail and perform controlled status transitions with history and audit.

**Independent Test**: Transition rules, loss reason and read-only denial are enforced.

### Tests for User Story 3

- [X] T021 [P] [US3] Add CRM pipeline unit tests in `backend/tests/unit/leads/broker-crm-pipeline.service.spec.ts`.
- [X] T022 [P] [US3] Add CRM status transition integration tests in `backend/tests/integration/leads/broker-crm-flows.spec.ts`.

### Implementation for User Story 3

- [X] T023 [US3] Implement CRM detail and dashboard helpers in `backend/src/modules/leads/broker-crm-leads.service.ts`.
- [X] T024 [US3] Implement controlled pipeline transitions in `backend/src/modules/leads/broker-crm-pipeline.service.ts`.
- [X] T025 [US3] Add CRM detail route UI in `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx`.

**Checkpoint**: User Story 3 is functional and auditable.

---

## Phase 6: User Story 4 - Notes, taches, rappels et assignation interne (Priority: P1)

**Goal**: Authorized brokers manage internal CRM activity inside the same tenant.

**Independent Test**: Same-tenant advisor assignment succeeds; cross-tenant advisor and read-only mutation fail.

- [X] T026 [P] [US4] Add CRM activity service unit tests in `backend/tests/unit/leads/broker-crm-activity.service.spec.ts`.
- [X] T027 [US4] Implement notes, tasks, reminders and same-tenant assignment in `backend/src/modules/leads/broker-crm-activity.service.ts`.
- [X] T028 [US4] Add CRM activity controller methods in `backend/src/modules/leads/broker-crm.controller.ts`.

---

## Phase 7: User Story 5 - Documents, proposition et contestation (Priority: P2)

**Goal**: Authorized brokers attach internal documents, non-contractual proposals and disputes.

**Independent Test**: Internal-only metadata is scoped and proposal copy remains non-contractual.

- [X] T029 [P] [US5] Add CRM document/proposal/dispute tests in `backend/tests/unit/leads/broker-crm-activity.service.spec.ts`.
- [X] T030 [US5] Implement document, proposal and dispute activity methods in `backend/src/modules/leads/broker-crm-activity.service.ts`.
- [X] T031 [US5] Add UI sections for documents/proposals/disputes in `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx`.

---

## Phase 8: User Story 6 - Dashboard, export et notifications (Priority: P2)

**Goal**: CRM dashboard, CSV export and internal notifications are scoped, permissioned and audited.

**Independent Test**: Export success/refusal and dashboard counters match tenant/role scope.

- [X] T032 [P] [US6] Add CRM export policy and dashboard tests in `backend/tests/unit/leads/broker-crm-export-policy.spec.ts`.
- [X] T033 [US6] Implement dashboard/export behavior in `backend/src/modules/leads/broker-crm-leads.service.ts` and `backend/src/modules/leads/broker-crm-export-policy.ts`.
- [X] T034 [US6] Implement CRM notifications and AI foundation metadata in `backend/src/modules/leads/broker-crm-notifications.service.ts`.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Contract, guardrail, UI smoke and final validation coverage.

- [X] T035 [P] Add broker CRM contract tests in `backend/tests/contract/broker-crm-api.contract.spec.ts`.
- [X] T036 [P] Add public separation guardrail in `backend/tests/guardrails/content/broker-crm-exclusions.spec.ts`.
- [X] T037 [P] Add Playwright CRM smoke coverage in `apps/broker/tests/leads/broker-crm.spec.ts`.
- [X] T038 Update Prisma durable target model validity in `backend/prisma/schema.prisma`.
- [X] T039 Run final validation commands and record results for the final report.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **US1, US2, US3, US4**: P1; depend on Foundational.
- **US5, US6**: P2; depend on Foundational and reuse activity/list services.
- **Polish**: Depends on all implemented stories.

## Parallel Opportunities

- T002-T005 can run in parallel after T001.
- Tests marked [P] can be written independently.
- US5 document/proposal/dispute tests can share activity setup with US4.
- Contract, guardrail and Playwright tests can run during polish.

## Implementation Strategy

1. Complete contracts, audit constants, RBAC, access policy and CRM metadata foundations.
2. Deliver P1 CRM access, list/Kanban, detail/pipeline and internal activity.
3. Add P2 documents/proposals/disputes, dashboard/export/notifications.
4. Finish with contract, guardrail, Playwright and required validation commands.
