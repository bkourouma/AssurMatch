---

description: "Task list for Dashboards courtier et admin plateforme"
---

# Tasks: Dashboards courtier et admin plateforme AssurMatch

**Input**: Design documents from `/specs/012-dashboard-courtier-admin/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/dashboards-api.md, quickstart.md

**Continuous Workflow**: Spec is committed (`9a49ca0`), no `[NEEDS CLARIFICATION]`, plan is eligible. `/speckit.implement` proceeds without intermediate confirmation. Stop on constitutional conflict, ambiguity, security/compliance risk, accidental activation of a forbidden module, or blocking validation failure. Do not commit automatically at the end.

**Tests**: Required for RBAC, tenant isolation, feature flags, audit, time-window bounds, pagination and back-office source markers (Playwright). Public smoke is N/A.

**Organization**: Tasks grouped by user story to keep US1, US2, US3 independently testable.

**Reconciliation 2026-05-03**: Source and tests were audited against this ledger. Implemented dashboard tasks are checked below. `T041` is intentionally left open because the active project pointer has moved to `specs/025-broker-backoffice-ux-polish/plan.md`; rewinding `AGENTS.md` would create new drift. Full release-level validations remain tracked in `T043` and should be run after the current supervisor backlog settles.

## Phase 1: Setup

- [x] T001 Add shared DTOs in `packages/shared/contracts/dashboard.contracts.ts` (zod schemas + types: `dashboardTimeWindowSchema`, `dashboardScopeQuerySchema`, `complianceAlertsQuerySchema`, `BrokerDashboardResponse`, `BrokerStarterDashboardSection`, `BrokerCrmDashboardSection`, `LicenseAlertItem`, `AdminDashboardResponse`, `AdminDashboardScope`, `RoutingRefusalReasonCount`, `FeatureFlagSummary`, `ComplianceAlertsResponse`, `ComplianceAlertItem`).
- [x] T002 [P] Export new contracts from `packages/shared/contracts/index.ts`.
- [x] T003 [P] Create backend module skeleton folder `backend/src/modules/dashboards/` (empty placeholder files: `dashboards.module.ts`, `dashboards-access-policy.ts`, `broker-dashboard.service.ts`, `admin-dashboard.service.ts`, `compliance-alerts.service.ts`, `dashboard-time-window.ts`, `dashboard-audit-actions.ts`).
- [x] T004 [P] Add audit action constants in `backend/src/modules/dashboards/dashboard-audit-actions.ts` (`brokerDashboardRefused`, `adminDashboardRead`, `adminDashboardRefused`, `adminComplianceAlertsRead`, `adminComplianceAlertsRefused`).

## Phase 2: Foundational (Constitutional Prerequisites)

**CRITICAL**: must complete before US1.

- [x] T005 Implement `dashboard-time-window.ts` (`resolveWindow`, `assertWindowBounds`) — span ∈ [1, 365] days, future dates rejected, malformed rejected.
- [x] T006 Implement `dashboards-access-policy.ts` with: `assertBrokerDashboardAccess(actor, flagsConfig)`, `crmSectionAllowed(actor, flagsConfig)`, `assertAdminDashboardRoles(actor)`, `resolveAdminScope(actor, query)` (refuses out-of-scope explicit params with `out_of_scope`; silently scopes implicit ones; audits refusals).
- [x] T007 Wire `DashboardsModule` in `backend/src/modules/dashboards/dashboards.module.ts` (constructor receives `audit`, `featureFlags`, `leads`, `partnerLicenses`, `partners`, `offers`, `countries`, `products`, `quoteRequests`, `brokerCrmConfig`).
- [x] T008 Wire `runtime.dashboards` in `backend/src/runtime/assurmatch-runtime.ts` (instantiate after `quoteRequests`, do not break existing wiring).
- [x] T009 Confirm `broker_dashboard_enabled` is in `backend/src/modules/feature-flags/default-flags.ts` (already present at line 6, no change required) and document the no-op in plan.

**Checkpoint**: Foundation ready; user-story phases can begin.

## Phase 3: US1 — Broker Starter dashboard (P1)

**Goal**: `GET /broker/dashboard` returns Starter KPIs + license alerts; CRM section absent for Starter.

### Tests for US1 (write first, expect to fail)

- [x] T010 [P] [US1] Unit tests `backend/tests/unit/dashboards/dashboard-time-window.spec.ts` (window bounds, defaults, malformed, future).
- [x] T011 [P] [US1] Unit tests `backend/tests/unit/dashboards/dashboards-access-policy.spec.ts` (broker flag closed → refuse + audit; tenant missing → refuse; MFA missing → refuse; admin-only role → refuse broker access).
- [x] T012 [P] [US1] Unit tests `backend/tests/unit/dashboards/broker-dashboard.service.spec.ts` (Starter only sections; counts by status, product, country; first-action-average; license alerts).
- [x] T013 [P] [US1] Integration test `backend/tests/integration/dashboards/broker-dashboard-runtime-http.spec.ts` (Starter happy path, response schema, audit-on-refusal patterns, no CRM section).

### Implementation for US1

- [x] T014 [US1] Implement `broker-dashboard.service.ts` Starter aggregation: counts, byProduct, byCountry, averageFirstActionMinutes, license alerts.
- [x] T015 [US1] Add `BrokerDashboardController` in `backend/src/modules/http-wiring/runtime-http-wiring.module.ts` decorated `GET /broker/dashboard` (protected) calling `runtime.dashboards.broker.dashboard(actor, query)`.
- [x] T016 [US1] Add `readBrokerDashboard()` in `apps/broker/app/lib/broker-api.ts` returning `BrokerApiState<BrokerDashboardResponse>`.
- [x] T017 [US1] Update `apps/broker/app/page.tsx` to call `readBrokerDashboard()` and render Starter KPIs, repartitions and license alerts with loading/error/empty/forbidden states.

**Checkpoint**: US1 complete and independently testable.

## Phase 4: US2 — Broker Pro/Enterprise dashboard with CRM (P1)

**Goal**: same `GET /broker/dashboard` returns Starter + CRM section when plan ∈ {pro, enterprise} and `broker_crm_enabled=true`.

### Tests for US2

- [x] T018 [P] [US2] Unit tests in `broker-dashboard.service.spec.ts` (CRM section present for Pro with flag; absent without; absent for Starter regardless of role).
- [x] T019 [P] [US2] Integration test in `broker-dashboard-runtime-http.spec.ts` (Pro happy path, CRM absent when flag false, Starter→CRM tampering refused).

### Implementation for US2

- [x] T020 [US2] Extend `broker-dashboard.service.ts` with CRM aggregation: pipeline by status, byAssignedAdvisor, conversionByProduct, averageReceptionToFirstActivityMinutes, upcomingTasks/Reminders.
- [x] T021 [US2] Update `apps/broker/app/crm/page.tsx` to call `readBrokerDashboard()` and render the CRM section in addition to Starter KPIs; render explicit message when CRM section is absent.

**Checkpoint**: US1 and US2 both work independently.

## Phase 5: US3 — Admin platform dashboard (P1)

**Goal**: `GET /admin/dashboard` returns cross-tenant aggregates with role-scoped data; emits audit on every read.

### Tests for US3

- [x] T022 [P] [US3] Unit tests `backend/tests/unit/dashboards/admin-dashboard.service.spec.ts` (lead volumes, non-routed reasons, byCountry/byProduct, partner active/inactive, expired offers, license alert counts, compliance alert counts, sensitive flag summary).
- [x] T023 [P] [US3] Unit tests `backend/tests/unit/dashboards/compliance-alerts.service.spec.ts` (pagination, category filter, audit codes mapping).
- [x] T024 [P] [US3] Integration test `backend/tests/integration/dashboards/admin-dashboard-runtime-http.spec.ts` (Super Admin happy path, Admin Pays scope, Compliance Admin alerts, Finance Admin restricted sections, broker→admin denied, audit emitted).
- [x] T025 [P] [US3] Integration test `backend/tests/integration/dashboards/compliance-alerts-runtime-http.spec.ts` (pagination boundaries, role allow-list, audit emitted on success and refusal).

### Implementation for US3

- [x] T026 [US3] Implement `admin-dashboard.service.ts` aggregation.
- [x] T027 [US3] Implement `compliance-alerts.service.ts` aggregation (filters `AuditLog` by category action codes, paginates).
- [x] T028 [US3] Add `AdminDashboardController` to `runtime-http-wiring.module.ts` with two decorated routes (`GET /admin/dashboard`, `GET /admin/dashboard/compliance-alerts`); RBAC allow-list enforced via `assertAnyRole`.
- [x] T029 [US3] Add `readAdminDashboard()` and `readComplianceAlerts(query)` in `apps/admin/app/lib/admin-api.ts`.
- [x] T030 [US3] Update `apps/admin/app/page.tsx` to render an admin home summary using `readAdminDashboard()`.
- [x] T031 [US3] Add `apps/admin/app/dashboard/page.tsx` rendering the full admin dashboard.
- [x] T032 [US3] Add `apps/admin/app/dashboard/compliance-alerts/page.tsx` rendering the paginated alerts list.

**Checkpoint**: US1, US2, US3 all functional.

## Phase 6: US4–US6 — guardrails, audit, performance/bornes (P1/P2)

### Tests

- [x] T033 [P] Integration test `backend/tests/integration/dashboards/dashboard-feature-flags.spec.ts` (`broker_dashboard_enabled` flips the gate; admin works regardless).
- [x] T034 [P] Integration test `backend/tests/integration/dashboards/dashboard-tenant-isolation.spec.ts` (forged `partnerId`/`agentId` cannot leak; Admin Pays out-of-scope refused 403; cross-broker forge refused).
- [x] T035 [P] Integration test `backend/tests/integration/dashboards/dashboard-audit.spec.ts` (`dashboard.admin.read`, `dashboard.admin.refused`, `dashboard.broker.refused` entries with correct payloads).

### Implementation

- [x] T036 Tighten `dashboards-access-policy.ts` based on test feedback (out-of-scope handling, refusal reasons, MFA hint).
- [x] T037 Confirm controllers parse `from`/`to`/pagination via shared zod schemas and refuse with `400` on bound violations.

## Phase 7: Back-office UI smokes

- [x] T038 [P] Playwright spec `apps/broker/tests/dashboard.spec.ts` verifying source markers in `apps/broker/app/page.tsx`, `apps/broker/app/crm/page.tsx`, and `apps/broker/app/lib/broker-api.ts` (no leak to public app, presence of `readBrokerDashboard`, no forbidden phrases).
- [x] T039 [P] Playwright spec `apps/admin/tests/dashboard.spec.ts` verifying source markers in `apps/admin/app/page.tsx`, `apps/admin/app/dashboard/page.tsx`, `apps/admin/app/dashboard/compliance-alerts/page.tsx`, and `apps/admin/app/lib/admin-api.ts` (presence of `readAdminDashboard`, `readComplianceAlerts`, audit-aware copy, no mutation buttons, no forbidden phrases).

## Phase N: Polish & Cross-Cutting

- [x] T040 Run quickstart steps and verify endpoints, page rendering and audit emission.
- [ ] T041 [P] Documentation: `AGENTS.md` updated to point at `specs/012-dashboard-courtier-admin/plan.md`.
- [x] T042 Re-run Constitution Check evidence in plan and confirm Pass on all gates.
- [ ] T043 Final validations: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npx prisma validate --schema backend/prisma/schema.prisma`, `npm audit --audit-level=high`, `git diff --check`. Run `npm run test:runtime:postgres` only if Prisma path is touched (this plan does not touch it).
- [x] T044 Check off every completed task in this file.
- [ ] T045 Produce final report (plan created, tasks total/done, files changed, endpoints, DTOs, components, tests added, validation results, residual risks, recommended commit).

## Dependencies & Order

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Polish.

Within US1, US2, US3: tests precede implementation; access policy used by all services.

## Notes

- [P] tasks touch independent files and may run in parallel.
- No automatic commit at the end.
