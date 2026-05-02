# Tasks: Back-office Admin UX Polish

**Input**: Design documents from `/specs/023-backoffice-admin-ux-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible for `/speckit.implement` without intermediate confirmation because the spec is explicitly approved and contains no `[NEEDS CLARIFICATION]` markers. Stop on constitutional conflict, security/compliance/data leakage risk, business logic change, production activation or blocking validation failure. Do not commit automatically.

**Tests**: Back-office Playwright/source tests are required for layout, navigation, dashboard KPI cards, states, responsive behavior, public/admin separation and forbidden wording. Backend tests are not expected unless implementation unexpectedly touches backend behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inventory the existing admin app and prepare a safe UI-only implementation path.

- [x] T001 Inventory existing admin routes and data helpers in `apps/admin/app/` and `apps/admin/app/lib/`
- [x] T002 [P] Review existing admin Playwright/source tests in `apps/admin/tests/`
- [x] T003 [P] Review public separation guardrails in `apps/public/tests/auth-separation.spec.ts`
- [x] T004 Confirm no dependency additions are required in `package.json`

---

## Phase 2: Foundational (Constitutional Prerequisites)

**Purpose**: Shared admin UI foundation that blocks story implementation.

- [x] T005 Add scoped admin visual foundation and responsive CSS in `apps/admin/app/globals.css`
- [x] T006 Update admin root layout imports and metadata in `apps/admin/app/layout.tsx`
- [x] T007 Create reusable admin UI primitives in `apps/admin/app/lib/ui/admin-ui.tsx`
- [x] T008 Create admin shell and navigation primitives in `apps/admin/app/lib/ui/admin-shell.tsx`
- [x] T009 Add shared admin page/data presentation helpers in `apps/admin/app/lib/ui/admin-view-models.ts`
- [x] T010 [P] Add forbidden wording/source guardrail test coverage in `apps/admin/tests/admin-ux-polish.spec.ts`
- [x] T011 [P] Add public/admin separation source guardrail coverage in `apps/public/tests/auth-separation.spec.ts`

**Checkpoint**: Admin UI foundation exists and separation/wording guardrails are defined.

---

## Phase 3: User Story 1 - Navigate the Admin Shell (Priority: P1)

**Goal**: Authenticated admin pages render inside a professional shell with sidebar, header, content and logout access.

**Independent Test**: Open the admin root and verify sidebar, required navigation, header/content landmarks, current route styling, focus-visible CSS and logout access.

### Tests for User Story 1

- [x] T012 [P] [US1] Add admin shell presence and navigation assertions in `apps/admin/tests/admin-ux-polish.spec.ts`
- [x] T013 [P] [US1] Add auth route shell exclusion/usability assertions in `apps/admin/tests/admin-ux-polish.spec.ts`

### Implementation for User Story 1

- [x] T014 [US1] Wire the admin shell into `apps/admin/app/layout.tsx`
- [x] T015 [US1] Configure required navigation items and optional existing-route items in `apps/admin/app/lib/ui/admin-shell.tsx`
- [x] T016 [US1] Preserve login/MFA/password routes with simplified auth presentation in `apps/admin/app/lib/ui/admin-shell.tsx`
- [x] T017 [US1] Ensure logout and user display use existing auth/session affordances in `apps/admin/app/lib/ui/admin-shell.tsx`
- [x] T018 [US1] Update admin landing route structure in `apps/admin/app/page.tsx`

**Checkpoint**: User Story 1 is functional and independently testable.

---

## Phase 4: User Story 2 - Understand Platform Health from Dashboard KPIs (Priority: P1)

**Goal**: Admin dashboard data is presented as readable KPI cards, sections and clean degraded states.

**Independent Test**: Visit dashboard/root with available, absent or failed data and verify KPI cards plus loading/empty/error states.

### Tests for User Story 2

- [x] T019 [P] [US2] Add dashboard KPI card and sensitive-flag assertions in `apps/admin/tests/admin-ux-polish.spec.ts`
- [x] T020 [P] [US2] Add dashboard empty/error/loading state assertions where source-renderable in `apps/admin/tests/admin-ux-polish.spec.ts`

### Implementation for User Story 2

- [x] T021 [US2] Map existing dashboard metrics to KPI view models in `apps/admin/app/lib/ui/admin-view-models.ts`
- [x] T022 [US2] Polish admin root dashboard content in `apps/admin/app/page.tsx`
- [x] T023 [US2] Polish platform dashboard content in `apps/admin/app/dashboard/page.tsx`
- [x] T024 [US2] Add compliance alerts and sensitive feature flag read-only presentation in `apps/admin/app/dashboard/page.tsx`
- [x] T025 [US2] Add safe empty/error/unavailable dashboard states in `apps/admin/app/page.tsx` and `apps/admin/app/dashboard/page.tsx`

**Checkpoint**: User Story 2 is functional and independently testable.

---

## Phase 5: User Story 3 - Work with Structured Admin Pages (Priority: P2)

**Goal**: Existing admin pages share clear page headers, containers, tables/lists, safe actions and state handling.

**Independent Test**: Visit Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard and verify structured presentation.

### Tests for User Story 3

- [x] T026 [P] [US3] Add structured admin page assertions in `apps/admin/tests/admin-ux-polish.spec.ts`
- [x] T027 [P] [US3] Add feature flag disabled/read-only assertions in `apps/admin/tests/feature-flags.spec.ts`

### Implementation for User Story 3

- [x] T028 [US3] Polish Catalogue page in `apps/admin/app/catalog/page.tsx`
- [x] T029 [US3] Polish Partenaires page in `apps/admin/app/partners/page.tsx`
- [x] T030 [US3] Polish Utilisateurs page in `apps/admin/app/users/page.tsx`
- [x] T031 [US3] Polish Feature flags page in `apps/admin/app/feature-flags/page.tsx`
- [x] T032 [US3] Polish Conformité page in `apps/admin/app/compliance/page.tsx`
- [x] T033 [US3] Polish Opérations page in `apps/admin/app/operations/page.tsx`
- [x] T034 [US3] Remove or restyle misleading/unimplemented actions in affected `apps/admin/app/**/page.tsx` files

**Checkpoint**: User Story 3 is functional and independently testable.

---

## Phase 6: User Story 4 - Use the Admin UI on Different Screen Sizes (Priority: P3)

**Goal**: Desktop, tablet and simple mobile admin views remain readable and navigable.

**Independent Test**: Render admin shell/dashboard at representative desktop, tablet and mobile widths and verify no critical overlap or unreadable navigation.

### Tests for User Story 4

- [x] T035 [P] [US4] Add responsive admin layout assertions in `apps/admin/tests/admin-ux-polish.spec.ts`

### Implementation for User Story 4

- [x] T036 [US4] Add responsive sidebar/header/content behavior in `apps/admin/app/globals.css`
- [x] T037 [US4] Verify compact table/card behavior uses stable dimensions in `apps/admin/app/lib/ui/admin-ui.tsx`

**Checkpoint**: User Story 4 is functional and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation and task bookkeeping.

- [x] T038 [P] Update feature quickstart notes if implementation details changed in `specs/023-backoffice-admin-ux-polish/quickstart.md`
- [x] T039 Run `npm run typecheck` from repository root
- [x] T040 Run `npm run lint` from repository root
- [x] T041 Run `npm run test` from repository root
- [x] T042 Run `npm run test:web` from repository root
- [x] T043 Run `npm run build` from repository root
- [x] T044 Run `npm audit --audit-level=high` from repository root
- [x] T045 Run `git diff --check` from repository root
- [x] T046 Run local web validation against `http://localhost:3602` if local services are available
- [x] T047 Re-check constitution evidence and public/admin separation against completed implementation
- [x] T048 Check off every completed task in `specs/023-backoffice-admin-ux-polish/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 and US2 (P1)**: Depend on Foundational. US2 can use shell primitives from US1 but remains separately testable through dashboard routes.
- **US3 (P2)**: Depends on Foundational and benefits from UI primitives created for US1/US2.
- **US4 (P3)**: Depends on shell and UI primitives.
- **Polish**: Depends on desired user stories being complete.

### Parallel Opportunities

- T002, T003 and T004 can run in parallel.
- T010 and T011 can run in parallel after UI foundation decisions.
- Test tasks marked [P] can be implemented alongside related UI changes if files do not conflict.
- Individual page polish tasks T028 through T033 can be parallelized by page owner after shared primitives are stable.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational tasks.
2. Complete US1 admin shell.
3. Validate layout, navigation, focus and logout access.

### Incremental Delivery

1. Add dashboard KPI polish (US2).
2. Polish existing pages one by one (US3).
3. Finish responsive behavior (US4).
4. Run full validation suite and local web check.

## Notes

- Do not change backend business logic, API routes, Prisma schema, routing rules, security rules or production feature flags.
- Do not commit automatically after implementation.
- Keep public, broker and admin surfaces separated.
