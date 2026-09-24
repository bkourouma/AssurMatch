# Tasks: Broker Back-office UX Polish

**Input**: Design documents from `/specs/025-broker-backoffice-ux-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible for `/speckit.implement` without intermediate confirmation because the spec is explicitly approved and contains no `[NEEDS CLARIFICATION]` markers. Stop on constitutional conflict, security/compliance/data leakage risk, business logic change, production activation, forbidden module activation or blocking validation failure. The user explicitly requested the final commit/PR/merge sequence after validations.

**Tests**: Broker Playwright/source tests are required for shell, navigation, dashboard cards, Starter CRM gating, Pro/Enterprise CRM flag gating, page states, responsive behavior, public/admin/broker separation and forbidden wording. Backend tests are not expected unless implementation unexpectedly touches backend behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inventory the existing broker app and prepare a safe UI-only implementation path.

- [x] T001 Inventory existing broker routes and data helpers in `apps/broker/app/` and `apps/broker/app/lib/`
- [x] T002 [P] Review existing broker Playwright/source tests in `apps/broker/tests/`
- [x] T003 [P] Review public separation guardrails in `apps/public/tests/auth-separation.spec.ts`
- [x] T004 [P] Review admin UX primitives from `apps/admin/app/lib/ui/` for reusable local patterns only
- [x] T005 Confirm no dependency additions are required in `package.json`

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Shared broker UI foundation that blocks story implementation.

- [x] T006 Add scoped broker visual foundation and responsive CSS in `apps/broker/app/globals.css`
- [x] T007 Update broker root layout imports and metadata in `apps/broker/app/layout.tsx`
- [x] T008 Create reusable broker UI primitives in `apps/broker/app/lib/ui/broker-ui.tsx`
- [x] T009 Create broker shell and broker-only navigation primitives in `apps/broker/app/lib/ui/broker-shell.tsx`
- [x] T010 Create shared broker view-model helpers in `apps/broker/app/lib/ui/broker-view-models.ts`
- [x] T011 [P] Add forbidden wording and source guardrail test coverage in `apps/broker/tests/broker-ux-polish.spec.ts`
- [x] T012 [P] Add public/admin/broker separation guardrail coverage in `apps/public/tests/auth-separation.spec.ts`

**Checkpoint**: Broker UI foundation exists and separation/wording guardrails are defined.

---

## Phase 3: User Story 1 - Broker Navigates a Professional Shell (Priority: P1)

**Goal**: Authenticated broker pages render inside a professional shell with sidebar, header, content and logout access.

**Independent Test**: Open broker pages and verify sidebar, required broker navigation, header/content landmarks, current route styling, focus-visible CSS and logout access.

### Tests for User Story 1

- [x] T013 [P] [US1] Add broker shell presence and navigation assertions in `apps/broker/tests/broker-ux-polish.spec.ts`
- [x] T014 [P] [US1] Add auth route shell exclusion/usability assertions in `apps/broker/tests/broker-ux-polish.spec.ts`

### Implementation for User Story 1

- [x] T015 [US1] Wire the broker shell into `apps/broker/app/layout.tsx`
- [x] T016 [US1] Configure broker navigation items and active-route matching in `apps/broker/app/lib/ui/broker-shell.tsx`
- [x] T017 [US1] Preserve login/MFA/password/activation routes with simplified auth presentation in `apps/broker/app/lib/ui/broker-shell.tsx`
- [x] T018 [US1] Ensure logout and user display use existing auth/session affordances in `apps/broker/app/lib/ui/broker-shell.tsx`
- [x] T019 [US1] Update broker landing route structure in `apps/broker/app/page.tsx`

**Checkpoint**: User Story 1 is functional and independently testable.

---

## Phase 4: User Story 2 - Starter Broker Manages Leads Without CRM Confusion (Priority: P1)

**Goal**: Starter brokers get polished leads and lead detail pages while CRM Pro capabilities remain unavailable with the required message.

**Independent Test**: Verify Starter leads and lead detail pages render structured content, and CRM entry points show `Le CRM complet est disponible avec le plan Pro.` without active full-CRM controls.

### Tests for User Story 2

- [x] T020 [P] [US2] Add Starter leads list and detail assertions in `apps/broker/tests/leads/broker-leads.spec.ts`
- [x] T021 [P] [US2] Add Starter CRM gating assertions in `apps/broker/tests/broker-ux-polish.spec.ts`

### Implementation for User Story 2

- [x] T022 [US2] Polish Starter leads page with tables, filters, badges and state messages in `apps/broker/app/leads/page.tsx`
- [x] T023 [US2] Polish Starter lead detail page with safe actions, history and Pro CRM callout in `apps/broker/app/leads/[leadAssignmentId]/page.tsx`
- [x] T024 [US2] Add Starter CRM unavailable message and remove unavailable full-CRM affordances in `apps/broker/app/crm/page.tsx`
- [x] T025 [US2] Add lead summary and status view-model helpers in `apps/broker/app/lib/ui/broker-view-models.ts`

**Checkpoint**: User Story 2 is functional and independently testable.

---

## Phase 5: User Story 3 - Pro and Enterprise Brokers Use CRM When Enabled (Priority: P1)

**Goal**: Pro/Enterprise CRM pages are polished and clearly unavailable when plan or `broker_crm_enabled` does not allow access.

**Independent Test**: Verify CRM dashboard, CRM lead list and CRM lead detail pages show polished content only when allowed, and clear unavailable states otherwise.

### Tests for User Story 3

- [x] T026 [P] [US3] Add CRM dashboard/list/detail assertions in `apps/broker/tests/leads/broker-crm.spec.ts`
- [x] T027 [P] [US3] Add Pro/Enterprise CRM flag-gating assertions in `apps/broker/tests/broker-ux-polish.spec.ts`

### Implementation for User Story 3

- [x] T028 [US3] Polish CRM dashboard and unavailable states in `apps/broker/app/crm/page.tsx`
- [x] T029 [US3] Polish CRM leads table, filters, search and state messages in `apps/broker/app/crm/leads/page.tsx`
- [x] T030 [US3] Polish CRM lead detail with read-compatible pipeline/activity sections in `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx`
- [x] T031 [US3] Add CRM dashboard and CRM lead view-model helpers in `apps/broker/app/lib/ui/broker-view-models.ts`

**Checkpoint**: User Story 3 is functional and independently testable.

---

## Phase 6: User Story 4 - Broker Reviews Account, Team and Notifications Safely (Priority: P2)

**Goal**: Account, team and available notification surfaces share consistent page structure and safe states.

**Independent Test**: Visit Account and Team, and Notifications if available, then verify consistent structure, RBAC-safe messages and no fake actions.

### Tests for User Story 4

- [x] T032 [P] [US4] Add account/team structure assertions in `apps/broker/tests/broker-ux-polish.spec.ts`
- [x] T033 [P] [US4] Add notification availability/source assertions in `apps/broker/tests/broker-ux-polish.spec.ts`

### Implementation for User Story 4

- [x] T034 [US4] Polish account page with profile/security sections in `apps/broker/app/account/page.tsx`
- [x] T035 [US4] Polish team page with a safe unavailable state until a broker-dedicated team route exists in `apps/broker/app/team/page.tsx`
- [x] T036 [US4] Add notification section on dashboard using existing available notification wording in `apps/broker/app/page.tsx`
- [x] T037 [US4] Add account/team view-model helpers in `apps/broker/app/lib/ui/broker-view-models.ts`

**Checkpoint**: User Story 4 is functional and independently testable.

---

## Phase 7: User Story 5 - Product and Engineering Validate Safety Guardrails (Priority: P2)

**Goal**: Safety guardrails prove scope, separation, forbidden wording and plan/flag gating.

**Independent Test**: Run Playwright/source tests and inspect changed files for no Prisma/backend business/public UX/feature flag/secret changes.

### Tests for User Story 5

- [x] T038 [P] [US5] Add broker responsive source assertions in `apps/broker/tests/broker-ux-polish.spec.ts`
- [x] T039 [P] [US5] Add forbidden phrase scan over changed broker/public guardrail files in `apps/broker/tests/broker-ux-polish.spec.ts`

### Implementation for User Story 5

- [x] T040 [US5] Ensure public separation test rejects broker/admin imports in `apps/public/tests/auth-separation.spec.ts`
- [x] T041 [US5] Ensure broker guardrail test rejects admin navigation and public route links in `apps/broker/tests/broker-ux-polish.spec.ts`
- [x] T042 [US5] Verify no backend business, Prisma or production feature flag file changes are needed in `specs/025-broker-backoffice-ux-polish/quickstart.md`

**Checkpoint**: Guardrails cover constitutional UX risks.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation and task bookkeeping.

- [x] T043 [P] Update feature quickstart notes if implementation details changed in `specs/025-broker-backoffice-ux-polish/quickstart.md`
- [x] T044 Run `npm run typecheck` from repository root
- [x] T045 Run `npm run lint` from repository root
- [x] T046 Run `npm run test` from repository root
- [x] T047 Run `npm run test:web` from repository root
- [x] T048 Run `npm run build` from repository root
- [x] T049 Run `npm audit --audit-level=high` from repository root
- [x] T050 Run `git diff --check` from repository root
- [x] T051 Run secret scan or equivalent from repository root
- [x] T052 Run `npm run test:web:local` from repository root if local services are available
- [x] T053 Run local UX review with `launch-local.bat` and broker localhost if local services are available
- [x] T054 Re-check constitution evidence and public/admin/broker separation against completed implementation
- [x] T055 Check off every completed task in `specs/025-broker-backoffice-ux-polish/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1, US2 and US3 (P1)**: Depend on Foundational. US2 and US3 share CRM presentation helpers and must coordinate `apps/broker/app/crm/page.tsx`.
- **US4 (P2)**: Depends on shell and UI primitives.
- **US5 (P2)**: Depends on the changed UI surfaces.
- **Polish**: Depends on desired user stories being complete.

### Parallel Opportunities

- T002, T003, T004 and T005 can run in parallel.
- T011 and T012 can run in parallel after UI foundation decisions.
- Test tasks marked [P] can be implemented alongside related UI changes if files do not conflict.
- Account and Team polish can be parallelized after shared primitives are stable.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational tasks.
2. Complete US1 broker shell.
3. Validate layout, navigation, focus and logout access.

### Incremental Delivery

1. Add Starter leads and CRM gating polish (US2).
2. Add Pro/Enterprise CRM polish (US3).
3. Add account/team/notification polish (US4).
4. Finish guardrails and responsive coverage (US5).
5. Run full validation suite and local web check.

## Notes

- Do not change backend business logic, API routes, Prisma schema, routing rules, security rules or production feature flags.
- Keep public, broker and admin surfaces separated.
- The user explicitly requested one final commit after validations, not intermediate Spec Kit commits.
