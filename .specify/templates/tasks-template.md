---

description: "Task list template for AssurMatch feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Constitutional tests are REQUIRED for critical modules, routing, RBAC,
feature flags, non-consent, expired license, disabled country/product, public
endpoints and AI guardrails when those areas are in scope.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions
- Include the constitutional concern in the task when relevant: consent, audit,
  RBAC, feature flag, license, routing, IA, data history, UX wording or async job

## Path Conventions

- **Public app**: `apps/public/`
- **Broker app**: `apps/broker/`
- **Admin app**: `apps/admin/`
- **Backend**: `backend/src/modules/<module>/`
- **Prisma**: `backend/prisma/`
- **Backend tests**: `backend/tests/unit/`, `backend/tests/integration/`, `backend/tests/contract/`
- **Shared contracts**: `packages/shared/`

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration only.

  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md with priorities P1, P2, P3...
  - Constitution Check gates from plan.md
  - Data model and entities from data-model.md
  - Endpoints and events from contracts/

  Tasks MUST be organized by user story. Do not keep sample tasks in generated
  tasks.md files.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for this feature

- [ ] T001 Create or update project structure per implementation plan
- [ ] T002 Install or configure required TypeScript, NestJS, Next.js, Prisma, Redis or BullMQ dependencies
- [ ] T003 [P] Configure linting, formatting and strict TypeScript checks
- [ ] T004 [P] Configure test runner paths for unit, integration, contract and guardrail tests

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Core controls that MUST be complete before user story implementation

**CRITICAL**: No user story work can begin until applicable controls in this
phase are complete or explicitly marked N/A in plan.md.

- [ ] T005 Define feature flags and default disabled states in backend/src/modules/feature-flags/
- [ ] T006 Define RBAC permissions, role mappings and tenant isolation checks in backend/src/modules/auth/
- [ ] T007 Define AuditLog coverage for sensitive actions in backend/src/modules/audit-logs/
- [ ] T008 Define ConsentRecord requirements in backend/src/modules/consent/
- [ ] T009 Define partner license validation and expiration blocking in backend/src/modules/partner-licenses/
- [ ] T010 Define routing eligibility prerequisites in backend/src/modules/routing/
- [ ] T011 Define data model changes and migrations in backend/prisma/
- [ ] T012 Configure structured errors and logs in backend/src/modules/common/
- [ ] T013 Configure Redis/BullMQ jobs for heavy or asynchronous processing where required
- [ ] T014 Define AI guardrails in backend/src/modules/ai/ when AI is in scope

**Checkpoint**: Foundation ready; user story implementation can now begin.

---

## Phase 3: User Story 1 - [Title] (Priority: P1)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1

> Write applicable tests FIRST and ensure they fail before implementation.

- [ ] T015 [P] [US1] Unit test for business rules in backend/tests/unit/[module]/[test-name].spec.ts
- [ ] T016 [P] [US1] Integration test for public or portal flow in backend/tests/integration/[test-name].spec.ts
- [ ] T017 [P] [US1] RBAC and tenant isolation test in backend/tests/integration/auth/[test-name].spec.ts
- [ ] T018 [P] [US1] Feature flag disabled-state test in backend/tests/integration/feature-flags/[test-name].spec.ts
- [ ] T019 [P] [US1] Consent, license, routing or AI guardrail test when applicable

### Implementation for User Story 1

- [ ] T020 [P] [US1] Create or update DTOs and validation in packages/shared/ or backend/src/modules/[module]/
- [ ] T021 [P] [US1] Create or update Prisma model/service in backend/src/modules/[module]/
- [ ] T022 [US1] Implement application service without controller business logic
- [ ] T023 [US1] Implement controller or resolver with RBAC, validation and feature flag checks
- [ ] T024 [US1] Add AuditLog, ConsentRecord, license, routing and data history behavior where applicable
- [ ] T025 [US1] Add async job or notification behavior where applicable
- [ ] T026 [US1] Add public, broker or admin UI changes with constitution-safe wording where applicable

**Checkpoint**: User Story 1 is functional, independently testable and passes
its constitutional tests.

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2

- [ ] T027 [P] [US2] Unit test for business rules in backend/tests/unit/[module]/[test-name].spec.ts
- [ ] T028 [P] [US2] Integration, RBAC, feature flag or guardrail test as required by plan.md

### Implementation for User Story 2

- [ ] T029 [P] [US2] Create or update data contracts and validation
- [ ] T030 [US2] Implement application service behavior
- [ ] T031 [US2] Implement API or UI integration with required controls
- [ ] T032 [US2] Add audit, data history, notification or async processing where applicable

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3

- [ ] T033 [P] [US3] Unit test for business rules in backend/tests/unit/[module]/[test-name].spec.ts
- [ ] T034 [P] [US3] Integration, RBAC, feature flag or guardrail test as required by plan.md

### Implementation for User Story 3

- [ ] T035 [P] [US3] Create or update data contracts and validation
- [ ] T036 [US3] Implement application service behavior
- [ ] T037 [US3] Implement API or UI integration with required controls
- [ ] T038 [US3] Add audit, data history, notification or async processing where applicable

**Checkpoint**: All selected user stories are independently functional.

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/ or specs/[###-feature-name]/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization and async workload review
- [ ] TXXX [P] Additional unit, integration, RBAC, flag, routing or AI guardrail tests
- [ ] TXXX Security hardening and PII log masking review
- [ ] TXXX UX copy review for forbidden phrases and indicative-offer wording
- [ ] TXXX Run quickstart.md validation
- [ ] TXXX Re-run Constitution Check evidence against completed implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion; BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational; no dependency on other stories
- **User Story 2 (P2)**: Can start after Foundational; may integrate with US1 while remaining independently testable
- **User Story 3 (P3)**: Can start after Foundational; may integrate with earlier stories while remaining independently testable

### Within Each User Story

- Applicable tests MUST be written and fail before implementation
- Data contracts and Prisma changes before services
- Services before controllers and UI wiring
- Feature flags, RBAC, consent, license and audit checks before happy-path exposure
- Story complete before moving to next priority unless parallel ownership avoids conflicts

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel
- Foundational tasks marked [P] can run in parallel when they touch different modules
- Tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different owners after Phase 2

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational constitutional prerequisites
3. Complete Phase 3: User Story 1
4. STOP and validate User Story 1 independently, including constitutional tests
5. Demo or deploy only if flags, consent, RBAC, audit and compliance evidence pass

### Incremental Delivery

1. Complete Setup plus Foundational controls
2. Add User Story 1, test independently, demo behind safe flags
3. Add User Story 2, test independently, demo behind safe flags
4. Add User Story 3, test independently, demo behind safe flags
5. Activate public scope only after country/product/AI activation checklists pass

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup plus Foundational controls together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Owners coordinate any shared files before editing

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to a specific user story for traceability
- Each user story must be independently completable and testable
- Commit after each task or logical group when the git workflow requires it
- Avoid vague tasks, same-file conflicts and cross-story dependencies that break independence
