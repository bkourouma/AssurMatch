# Tasks: Auth Frontend Session Integration AssurMatch

**Input**: Design documents from `/specs/006-auth-frontend-session-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible. The user explicitly approved continuation
from `/speckit.plan` to `/speckit.tasks` to `/speckit.implement`, with no
auto-commit. Stop only on constitutional conflict, security/data leakage risk,
accidental forbidden-module activation or blocking validation failure.

**Tests**: Required for Bearer token propagation, removal of runtime
`x-assurmatch-*` headers, 401/403 handling, Starter CRM denial, broker admin
denial and public/back-office separation.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish documentation and feature metadata for implementation.

- [X] T001 Update current Spec Kit plan reference in `AGENTS.md`
- [X] T002 Update 006 specification workflow metadata in `specs/006-auth-frontend-session-integration/spec.md`
- [X] T003 [P] Add planning artifacts in `specs/006-auth-frontend-session-integration/research.md`, `specs/006-auth-frontend-session-integration/data-model.md`, `specs/006-auth-frontend-session-integration/contracts/back-office-auth-session.md`, and `specs/006-auth-frontend-session-integration/quickstart.md`

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Shared auth/session primitives that block all user stories.

- [X] T004 Add broker back-office session helper in `apps/broker/app/lib/backoffice-auth.ts`
- [X] T005 Add broker login/logout server actions in `apps/broker/app/lib/backoffice-session-actions.ts`
- [X] T006 Add admin back-office session helper in `apps/admin/app/lib/backoffice-auth.ts`
- [X] T007 Add admin login/logout server actions in `apps/admin/app/lib/backoffice-session-actions.ts`
- [X] T008 Add broker middleware for token validation, absent-token redirect, Starter CRM denial and app-role gate in `apps/broker/middleware.ts`
- [X] T009 Add admin middleware for token validation, absent-token redirect and admin-role gate in `apps/admin/middleware.ts`

**Checkpoint**: Back-office apps can validate session state before rendering protected surfaces.

---

## Phase 3: User Story 1 - Se connecter au back-office avec une session reelle (Priority: P1)

**Goal**: Broker and admin users can login through `/auth/login`, store the token securely and retrieve `/auth/me`.

**Independent Test**: Login pages and backend integration tests prove login -> token -> `/auth/me`.

### Tests for User Story 1

- [X] T010 [P] [US1] Add backend integration test for login then `/auth/me` with Bearer token in `backend/tests/integration/runtime-http-auth-rbac-validation.spec.ts`
- [X] T011 [P] [US1] Add broker login source test in `apps/broker/tests/auth-session.spec.ts`
- [X] T012 [P] [US1] Add admin login source test in `apps/admin/tests/auth-session.spec.ts`

### Implementation for User Story 1

- [X] T013 [US1] Add broker login page in `apps/broker/app/login/page.tsx`
- [X] T014 [US1] Add admin login page in `apps/admin/app/login/page.tsx`
- [X] T015 [US1] Protect broker home page with `/auth/me` profile state in `apps/broker/app/page.tsx`
- [X] T016 [US1] Protect admin home page with `/auth/me` profile state in `apps/admin/app/page.tsx`

**Checkpoint**: Login and current profile flows are available for both back-office apps.

---

## Phase 4: User Story 2 - Utiliser Bearer token dans les clients API broker et admin (Priority: P1)

**Goal**: Broker/admin clients use Authorization Bearer and no runtime dev headers.

**Independent Test**: Source tests prove protected clients attach Bearer and omit `x-assurmatch-*`.

### Tests for User Story 2

- [X] T017 [P] [US2] Add broker API client header regression assertions in `apps/broker/tests/auth-session.spec.ts`
- [X] T018 [P] [US2] Add admin API client header regression assertions in `apps/admin/tests/auth-session.spec.ts`

### Implementation for User Story 2

- [X] T019 [US2] Replace broker API runtime dev headers with Bearer token handling in `apps/broker/app/lib/broker-api.ts`
- [X] T020 [US2] Replace admin API runtime dev headers with Bearer token handling in `apps/admin/app/lib/admin-api.ts`

**Checkpoint**: Runtime back-office API clients no longer construct `x-assurmatch-*`.

---

## Phase 5: User Story 3 - Gerer expiration, invalidite et logout proprement (Priority: P1)

**Goal**: Missing, expired or invalid tokens redirect to login, and logout clears local session.

**Independent Test**: Middleware/source tests and API-client states cover 401, absent token and logout.

### Tests for User Story 3

- [X] T021 [P] [US3] Add middleware/session-expiry source assertions in `apps/broker/tests/auth-session.spec.ts`
- [X] T022 [P] [US3] Add admin middleware/session-expiry source assertions in `apps/admin/tests/auth-session.spec.ts`

### Implementation for User Story 3

- [X] T023 [US3] Wire logout controls and session-expired UI in broker pages under `apps/broker/app/`
- [X] T024 [US3] Wire logout controls and session-expired UI in admin pages under `apps/admin/app/`

**Checkpoint**: Logout and invalid-session behavior are visible and do not render protected data.

---

## Phase 6: User Story 4 - Refuser proprement les acces non autorises (Priority: P1)

**Goal**: 403 and role/plan denials show access denied without protected data.

**Independent Test**: Backend and frontend tests cover Starter CRM denial, broker admin denial and access-denied UI.

### Tests for User Story 4

- [X] T025 [P] [US4] Extend backend RBAC test for login-derived broker token denied on admin in `backend/tests/integration/runtime-http-auth-rbac-validation.spec.ts`
- [X] T026 [P] [US4] Add broker access denied source assertions in `apps/broker/tests/auth-session.spec.ts`
- [X] T027 [P] [US4] Add admin access denied source assertions in `apps/admin/tests/auth-session.spec.ts`

### Implementation for User Story 4

- [X] T028 [US4] Remove protected fallback lead data and render 401/403 states in `apps/broker/app/leads/page.tsx`
- [X] T029 [US4] Remove protected fallback CRM data and render 401/403 states in `apps/broker/app/crm/leads/page.tsx`
- [X] T030 [US4] Protect broker detail and CRM detail pages in `apps/broker/app/leads/[leadAssignmentId]/page.tsx` and `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx`

**Checkpoint**: Unauthorized users do not see Starter, CRM or admin protected data.

---

## Phase 7: User Story 5 - Preserver la separation public/back-office (Priority: P2)

**Goal**: Public app remains free of back-office session state and clients.

**Independent Test**: Source guardrails prove no public imports/calls to back-office auth/session/client code.

### Tests for User Story 5

- [X] T031 [P] [US5] Add public/back-office separation assertions in `apps/public/tests/public-runtime-smoke.spec.ts`

### Implementation for User Story 5

- [X] T032 [US5] Confirm no functional public app changes are required in `apps/public/`

**Checkpoint**: Web Publique Client remains applicatively separated.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T033 Run `npm run typecheck`
- [X] T034 Run `npm run lint`
- [X] T035 Run `npm run test`
- [X] T036 Run `npm run test:web`
- [X] T037 Run `npm run build`
- [X] T038 Run `npx prisma validate --schema backend/prisma/schema.prisma`
- [X] T039 Run `npm audit --audit-level=high`
- [X] T040 Run `git diff --check`
- [X] T041 Check off every completed task in `specs/006-auth-frontend-session-integration/tasks.md`
- [X] T042 Produce final report with plan, tasks, completed count, files, validations, unfinished points, residual risks and commit recommendation

---

## Dependencies & Execution Order

- Phase 1 documentation and Phase 2 session primitives block all user stories.
- US1 enables real session acquisition.
- US2 depends on session helpers to attach Bearer tokens.
- US3 depends on login/logout helpers and middleware.
- US4 depends on API clients returning 401/403 states.
- US5 can be validated after all app-level imports are in place.

## Parallel Opportunities

- T003 documentation artifacts can be reviewed independently.
- T010-T012, T017-T018, T021-T022 and T025-T027 touch separate test files and can run in parallel.
- Broker and admin helper/action implementation is structurally parallel but must stay consistent.

## Implementation Strategy

Implement the broker path first as the MVP, then mirror the session pattern in
the admin app. Keep backend changes limited to tests unless a minor auth/session
alignment is required. Run final validations exactly as requested and do not
commit automatically.
