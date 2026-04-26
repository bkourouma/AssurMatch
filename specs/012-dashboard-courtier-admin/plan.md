# Implementation Plan: Dashboards courtier et admin plateforme AssurMatch

**Branch**: `012-dashboard-courtier-admin` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-dashboard-courtier-admin/spec.md`

**Continuous Workflow Eligibility**: Eligible. Spec 012 is committed (`9a49ca0 docs: add broker and platform admin dashboards specification`), contains no `[NEEDS CLARIFICATION]` markers, and the user has explicitly requested the chained workflow `/speckit.plan` → `/speckit.tasks` → `/speckit.implement` → final validations. Stop conditions remain: constitutional conflict, ambiguity, security/compliance/data-leakage risk, accidental activation of a forbidden module, blocking validation failure. No automatic commit at the end.

## Summary

Add a read-only `dashboards` module that exposes:

- `GET /broker/dashboard` — plan-adaptive aggregate for Starter and Pro/Enterprise courtiers, scoped to the authenticated tenant.
- `GET /admin/dashboard` — cross-tenant aggregate for platform admins, scoped by role (Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin, Content Admin).
- `GET /admin/dashboard/compliance-alerts` — paginated compliance alerts (chosen because the alert list can grow large independently of the high-level summary).

The module reads from existing Prisma-runtime repositories (`LeadAssignments`, `CrmActivity`, `RoutingDecisions`, `PartnerLicenses`, `Partners`, `Offers`, `Countries`, `Products`, `AuditLog`, `FeatureFlag`) and computes deterministic aggregates without introducing new persistence, mutations, exports, payments, subscription, signature, claims, AI scoring, or insurer API.

Front-end: wire the existing Next.js back-office pages (`apps/broker/app/page.tsx`, `apps/broker/app/crm/page.tsx`, `apps/admin/app/page.tsx`) plus a new `apps/admin/app/dashboard/page.tsx` to call the new endpoints with the existing fetch-and-cookie pattern.

Feature flag `broker_dashboard_enabled` already exists fail-closed in `default-flags.ts` and is honored by `BrokerStarterAccessPolicy.assertDashboardAccess`. This plan promotes the broker-side check to a shared dashboards-access policy and adds `broker_dashboard_enabled` enforcement at the dashboards module level.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1; Next.js 16.2.4 (App Router); React 19.2.5.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@prisma/client`, `zod`, `@prisma/adapter-pg`, existing `AssurMatchRuntime`, `RuntimeHttpWiringModule`, `AuditLogWriter`, `FeatureFlagsService`, repositories listed above, `packages/shared/contracts/*` and `packages/shared/rbac/assurmatch-role-matrix`.
**Storage**: PostgreSQL via Prisma-runtime repositories (read-only aggregations). No new tables. Optionally one new index if measurements show one is required (deferred unless a task proves the need).
**Testing**: Vitest unit + integration tests (`backend/tests/unit/dashboards`, `backend/tests/integration/dashboards`, `backend/tests/integration/feature-flags`, `backend/tests/integration/auth`). Playwright smoke specs in `apps/broker/tests/` and `apps/admin/tests/` verifying the new pages source markers (no browser navigation, conform to existing pattern). Optional `npm run test:runtime:postgres` only if aggregations or repositories are modified.
**Target Platform**: Backend API + Back-office Partenaires/Plateforme (broker app + admin app). Web Publique Client is not impacted.
**Impacted Application(s)**: Backend API (new module + HTTP wiring); Back-office Partenaires/Plateforme (broker home + crm pages + admin dashboard page); shared package (new `dashboard.contracts.ts`). Web Publique Client untouched.
**Project Type**: B2B2C regulated marketplace web application; this feature is read-only operational tooling.
**Performance Goals**: p95 < 500 ms target on local PostgreSQL with seed-scale data for default 30-day window; documented as a non-blocking goal that the implementation should respect by avoiding N+1 and bounding queries by window/tenant. Heavy work is forbidden.
**Constraints**: No mutation; no export; no payment, subscription, policy, attestation, signature, claims, advanced AI, webhook, insurer API; no PII beyond what specs 003/004 already permit; tenant isolation enforced at service AND repository call site; window 1–365 days, default 30; pagination on alert list (`page`,`pageSize` with default 25, max 100); no new public route.
**Scale/Scope**: One backend module, three HTTP endpoints, three back-office pages updated, one new back-office page, ~10–14 shared DTO types, ~20 vitest specs, 2–3 Playwright specs, one default feature-flag seed entry.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design (see end of file).*

- **Technical platform role**: Pass. Read-only operational dashboards for internal users; no direct sale, subscription, premium collection, contract issuance, attestation, claims or binding advice introduced.
- **Regulatory and consent**: Pass. The dashboards do not transmit leads. They surface aggregate counts of "leads non routés / absence de consentement" for admins and licence alerts for both surfaces. Lead transmission semantics remain governed by specs 002/003/004.
- **Feature flags and activation**: Pass. `broker_dashboard_enabled` (already in `default-flags.ts`, fail-closed) gates the broker dashboards. `broker_crm_enabled` (already fail-closed) gates the CRM section of the Pro/Enterprise dashboard. Sensitive flags (`payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, AI advanced flags) remain false and are read-only on the admin dashboard.
- **Frontend application separation**: Pass. New routes live only in `apps/broker/` and `apps/admin/`. No code is added to `apps/public/`. Middleware-based RBAC remains the gate for the back-office shells.
- **Security and RBAC**: Pass. Broker endpoints require `protectedActorFromRequest` (auth + MFA) and a tenant; admin endpoints require auth + MFA and an admin role allow-list. Cross-tenant attempts are refused via service-side scope-derivation (forged params ignored). PII minimized: aggregates are counts and statuses; no contact details are returned by the new endpoints.
- **Data and auditability**: Pass. Each successful admin call writes a `dashboard.admin.read` audit; refused admin calls write `dashboard.admin.refused` with structured reason. Refused broker calls (cross-tenant attempt, Starter→CRM, flag closed) write `dashboard.broker.refused`. Successful broker reads are not audited per request to avoid noise (only refusals + first access of the day pattern, but this plan keeps it simple: refusals are audited, success is not — see Arbitration 1).
- **Routing integrity**: Pass. No routing decision is created or changed. Only existing decisions/refusals are read for admin aggregates.
- **AI control**: Pass. No AI call. AI flags read-only on admin dashboard.
- **UX and content safety**: Pass. Internal operational vocabulary only ("leads reçus", "leads transmis", "licence expirante", etc.). Forbidden terms not introduced.
- **Testing discipline**: Pass. Plan adds unit, integration, RBAC, tenant isolation, feature flag, audit and back-office Playwright specs. Public smoke is N/A.
- **Async and reliability**: Pass. Read-only aggregations only. No queue, no notification, no heavy job.
- **Continuous workflow safety**: Pass. Spec validated and committed; no `[NEEDS CLARIFICATION]`. Workflow may chain through tasks → implement → final validations under the documented stop conditions.

## Arbitrations Resolved

The user pre-authorized defaults; the plan adopts them.

1. **Broker journaling policy**: Audit only refusals and "sensitive" successes (e.g. first call of the session, opt-in markers). To keep the implementation simple and the audit volume bounded, this plan audits only refusals on the broker side and writes a single audit per Pro/Enterprise CRM section refusal (flag-closed) per actor. Successful broker reads are not audited. Reason: high-frequency refresh polling would otherwise flood `AuditLog`.
2. **broker_dashboard_enabled cache invalidation**: Reuse the existing `FeatureFlagsService` + `FeatureFlagCacheService` runtime path. The dashboards service calls `featureFlags.isEnabled("broker_dashboard_enabled")` per request. Cache invalidation is governed by the existing `featureFlags.setFlag` path and `assurmatch-runtime.refreshRuntimeFeatureFlags` hook; no extra cache here. Tests cover the disabled state.
3. **Notifications in KPIs**: Excluded from V1. The data is available but adds complexity (counts vs delivery state) without corresponding stakeholder need; can be revisited in a future spec.
4. **`/admin/dashboard/compliance-alerts` separate or inclusive**: Separate. The summary (counts of alerts) lives in `GET /admin/dashboard`; the paginated detail list lives in `GET /admin/dashboard/compliance-alerts`. Reason: the alert list can grow long; pagination keeps the summary fast and predictable.
5. **p95 target**: < 500 ms documented as a non-blocking local goal. Achieved by aggregation-style queries (Prisma `groupBy`/`count`) with tenant/window filters and reuse of indexed columns (`createdAt`, `partnerTenantId`, `status`).
6. **Admin out-of-scope behavior**: Explicit `403` when the admin volunteers a parameter outside their scope (e.g. Admin Pays specifies `country` not in `actor.countryScopes`); silent filtering only when the scope is implicit (e.g. Admin Pays calls without a `country` param — the aggregate is bounded to their pays). Always audited.

## Project Structure

### Documentation (this feature)

```text
specs/012-dashboard-courtier-admin/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    dashboards-api.md
  tasks.md
```

### Source Code

```text
backend/
  src/
    modules/
      dashboards/                                # NEW
        dashboards.module.ts
        dashboards-access-policy.ts
        broker-dashboard.service.ts
        admin-dashboard.service.ts
        compliance-alerts.service.ts
        dashboard-time-window.ts
        dashboard-audit-actions.ts
      http-wiring/
        runtime-http-wiring.module.ts            # extended with 3 endpoints
      feature-flags/
        default-flags.ts                         # broker_dashboard_enabled already present (no change)
    runtime/
      assurmatch-runtime.ts                      # wire DashboardsModule
  tests/
    unit/dashboards/
      broker-dashboard.service.spec.ts
      admin-dashboard.service.spec.ts
      compliance-alerts.service.spec.ts
      dashboards-access-policy.spec.ts
      dashboard-time-window.spec.ts
    integration/dashboards/
      broker-dashboard-runtime-http.spec.ts
      admin-dashboard-runtime-http.spec.ts
      compliance-alerts-runtime-http.spec.ts
      dashboard-feature-flags.spec.ts
      dashboard-tenant-isolation.spec.ts
      dashboard-audit.spec.ts
packages/
  shared/
    contracts/
      dashboard.contracts.ts                     # NEW (zod schemas + types)
      index.ts                                   # extended exports
apps/
  broker/
    app/
      page.tsx                                   # extended: fetch /broker/dashboard
      crm/page.tsx                               # extended: fetch /broker/dashboard, render CRM section
      lib/broker-api.ts                          # extended: readBrokerDashboard()
    tests/
      dashboard.spec.ts                          # NEW
  admin/
    app/
      page.tsx                                   # extended: fetch /admin/dashboard summary
      dashboard/page.tsx                         # NEW (full admin dashboard)
      dashboard/compliance-alerts/page.tsx       # NEW (paginated alerts)
      lib/admin-api.ts                           # extended: readAdminDashboard(), readComplianceAlerts()
    tests/
      dashboard.spec.ts                          # NEW
```

**Structure Decision**: A dedicated `dashboards` module isolates aggregation logic from existing modules and avoids touching `BrokerStarterLeadsService.dashboard()` or `BrokerCrmController.dashboard()`, which remain the legacy plan-specific dashboards used by the existing portal endpoints. The new `/broker/dashboard` is a single plan-adaptive endpoint that reads from the same repositories. This keeps backwards compatibility, isolates new logic for testing, and makes RBAC/feature-flag enforcement homogeneous.

## Phase 0 Research Decisions

See [research.md](./research.md). Headlines:

- New dashboards module reads through existing repositories; no new persistence.
- Aggregation strategy: Prisma `groupBy`, `count`, and small in-memory roll-ups for sets that fit in a single window query (license alerts, AuditLog reasons). Each repository call carries explicit tenant scope cote broker; admin calls scope by `country`/`partner`/`product` allow-list derived from role.
- `dashboardScope` derived from actor + role + query → forged params outside scope produce explicit 403 with audited refusal (Arbitration 6).
- Pagination on alerts: `page`/`pageSize` with default 25, max 100.
- Time window: shared `dashboardTimeWindowSchema` with `from`/`to` ISO date-time; default = now − 30 days; max span = 365 days; minimum span = 1 day.
- Front-end: server-component pages calling backend with bearer cookie token; loading/error/empty states mirroring the existing broker leads page pattern.
- No mutation endpoints; flags `broker_dashboard_enabled` and `broker_crm_enabled` read at request time via existing `FeatureFlagsService`.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): logical aggregate model — DTO shapes for broker Starter dashboard, broker Pro dashboard, admin dashboard, compliance alert items.
- [contracts/dashboards-api.md](./contracts/dashboards-api.md): three endpoints, query params, request/response examples, error codes.
- [quickstart.md](./quickstart.md): how to run the dashboards locally, seed admin/broker actors, exercise the endpoints, run the tests.

## Technical Plan

### 1. Shared DTOs

Add `packages/shared/contracts/dashboard.contracts.ts` exporting zod schemas + types for:

- `dashboardTimeWindowSchema` — `{ from?: string, to?: string }` ISO date-time, default 30 days, max 365 days, min 1 day; refines so `from < to` and span valid.
- `dashboardScopeQuerySchema` — `{ from?, to?, country?, product?, partnerId?, agentId? }` — used by both endpoints; service code drops or refuses out-of-scope values.
- `complianceAlertsQuerySchema` — same scope params + `page`, `pageSize`.
- `BrokerStarterDashboardSection`, `BrokerCrmDashboardSection`, `BrokerDashboardResponse`, `AdminDashboardResponse`, `ComplianceAlertsResponse`, `LicenseAlertItem`, `RoutingRefusalReasonCount`, `FeatureFlagSummary`.

### 2. Backend module

`backend/src/modules/dashboards/`:

- `dashboard-time-window.ts`: pure helpers `resolveWindow(query)`, `assertWindowBounds(window)`. Throws for spans > 365 days, < 1 day, future dates, malformed.
- `dashboard-audit-actions.ts`: namespace constants — `dashboard.broker.refused`, `dashboard.admin.read`, `dashboard.admin.refused`, `dashboard.admin.compliance_alerts.read`, `dashboard.admin.compliance_alerts.refused`.
- `dashboards-access-policy.ts`: encapsulates checks:
  - `assertBrokerDashboardAccess(actor, flagsConfig)` — flag fail-closed, MFA, tenant present, broker role; audit refusal.
  - `assertCrmSectionAllowed(actor, flagsConfig)` — same as `BrokerCrmAccessPolicy.assertCrmAccess` but returns a boolean to let the service emit a section without CRM rather than 403 the whole call.
  - `resolveAdminScope(actor, query)` — validates `country`/`partnerId`/`product` against actor scopes; throws `403` with `out_of_scope` if explicit forge; audits refusal.
- `broker-dashboard.service.ts`: service that fetches aggregates and assembles response.
  - Inputs: `actor`, query.
  - Reads through `LeadAssignmentService.list()` (existing) filtered by tenant + window; computes counts (received, accepted, rejected, disputed, pending), avg time-to-first-action (when `seenAt` available), repartition by `productKey`/`countryCode`.
  - License alerts via `partnerLicensesService.listForPartner(actor.partnerTenantId)` → expired + expiring within 30 days.
  - For Pro/Enterprise plans with `broker_crm_enabled=true`: pipeline by status, repartition by `assignedAdvisorId`, conversion rate by product (status == `accepted` over received), avg time reception → first CRM activity (via `crmActivityRepository`), counts of upcoming reminders/tasks (within window).
- `admin-dashboard.service.ts`: aggregates leads received/transmitted/refused/non-routed (via `routingDecisionsRepository` + `quoteRequestsRepository` + `leadAssignmentsRepository`), routing refusal reason counts, country/product breakdown filtered by actor scope, partner active vs inactive, expired offers still referenced, license alerts cross-tenant, compliance alert counts (consent missing, CRM-no-flag, RBAC denied, cross-tenant attempts), feature-flag read-only state for sensitive flags.
- `compliance-alerts.service.ts`: paginated list of `AuditLog` items filtered to refusal-class actions, scoped by actor role.

### 3. HTTP wiring

Extend `backend/src/modules/http-wiring/runtime-http-wiring.module.ts` with three controllers + decorators:

- `BrokerDashboardController` at `broker/dashboard` (protected) — `GET ""` → `runtime.dashboards.broker.dashboard(actor, query)`.
- `AdminDashboardController` at `admin/dashboard` (protected) — `GET ""` → `runtime.dashboards.admin.dashboard(actor, query)`; `GET "compliance-alerts"` → `runtime.dashboards.admin.complianceAlerts(actor, query)`.

Both follow the existing pattern: `protectedActorFromRequest`, `parseHttpInput(schema, query)`, RBAC allow-lists for admin (`super_admin`, `admin_pays`, `compliance_admin`, `support_admin`, `finance_admin`, `content_admin`), refusal via `assertAnyRole`.

### 4. Runtime composition

`assurmatch-runtime.ts`: instantiate `DashboardsModule` with dependencies:

```ts
readonly dashboards = new DashboardsModule({
  audit: this.audit.writer,
  featureFlags: this.featureFlags.service,
  leads: this.leads,
  partnerLicenses: this.partnerLicenses.service,
  partners: this.partners.service,
  offers: this.offers,
  countries: this.countries.service,
  products: this.products.service,
  quoteRequests: this.quoteRequests.submissions,
  brokerCrmConfig: this.brokerCrmConfig
});
```

Module exposes `broker`, `admin`, `complianceAlerts` services, enabling tests to compose them with memory stand-ins.

### 5. Feature flag

`broker_dashboard_enabled` already exists in `backend/src/modules/feature-flags/default-flags.ts:6`. No migration. The dashboards access policy reads it via `featureFlags.isEnabled("broker_dashboard_enabled")` per request — fail-closed on cache miss because `isEnabled` returns `false` when the row is absent.

### 6. Audit

New audit actions in `dashboard-audit-actions.ts` (string constants only). The service writes:

- `dashboard.admin.read` on success of `GET /admin/dashboard` and `GET /admin/dashboard/compliance-alerts` with `result: "success"` and scope payload.
- `dashboard.admin.refused` with structured `reason` (`forbidden_role`, `out_of_scope`, `flag_disabled`, `missing_mfa`).
- `dashboard.broker.refused` for: cross-tenant forge, Starter→CRM, `broker_dashboard_enabled=false`. Successful broker reads are not audited (Arbitration 1).

### 7. Front-end

- `apps/broker/app/lib/broker-api.ts` adds `readBrokerDashboard()` returning `BrokerApiState<BrokerDashboardResponse>`.
- `apps/broker/app/page.tsx` (Starter home) renders KPIs + license alerts table, with loading/error/empty/forbidden states (existing pattern).
- `apps/broker/app/crm/page.tsx` (Pro/Enterprise) renders the same Starter section + the CRM section when present in the response.
- `apps/admin/app/lib/admin-api.ts` adds `readAdminDashboard()` and `readComplianceAlerts(page,pageSize)`.
- `apps/admin/app/page.tsx` adds a small home summary (counts) calling `readAdminDashboard()`.
- `apps/admin/app/dashboard/page.tsx` renders the full admin dashboard.
- `apps/admin/app/dashboard/compliance-alerts/page.tsx` renders the paginated alerts list.

UI uses inline styled JSX consistent with existing pages. No new design-system package. No mutation buttons.

### 8. Tests

- Unit (`backend/tests/unit/dashboards/`): each service exercised against in-memory test doubles (`MemoryLeadAssignmentsRepository`, `MemoryAuditLogRepository`, etc., already test-only). Window edge cases (>365 days, <1 day, malformed). Access policy decisions.
- Integration (`backend/tests/integration/dashboards/`):
  - `broker-dashboard-runtime-http.spec.ts`: Starter happy path, Pro happy path with `broker_crm_enabled=true`, CRM section absent when flag false, Starter→CRM stays absent regardless of role tampering, fenetre rejection.
  - `admin-dashboard-runtime-http.spec.ts`: Super Admin reads aggregates and writes audit; Admin Pays scoped; Compliance Admin sees alerts; non-admin blocked.
  - `compliance-alerts-runtime-http.spec.ts`: pagination, role allow-list, audit emitted.
  - `dashboard-feature-flags.spec.ts`: `broker_dashboard_enabled` flips the gate; admin still works when broker flag is off.
  - `dashboard-tenant-isolation.spec.ts`: forged `partnerId`/`agentId` cannot leak across tenants.
  - `dashboard-audit.spec.ts`: presence of `dashboard.admin.read`, `dashboard.admin.refused`, `dashboard.broker.refused` entries.
- Playwright (`apps/broker/tests/dashboard.spec.ts`, `apps/admin/tests/dashboard.spec.ts`): source-marker checks consistent with existing specs (verify the new pages exist, render expected headings, depend on correct API helpers, and do not import from `apps/public/`).

### 9. Performance

Aggregation queries use Prisma `groupBy` and `count` with `where: { partnerTenantId, createdAt: { gte, lte } }` (broker) or scoped admin filters. License alert query uses `expiresAt` index. No N+1 introduced; tests assert that the in-memory adapter receives a single "list once and aggregate" pattern, not per-row fetches.

### 10. Validations

After implementation:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:web`
- `npm run build`
- `npx prisma validate --schema backend/prisma/schema.prisma`
- `npm audit --audit-level=high`
- `git diff --check`
- `npm run test:runtime:postgres` only if Prisma repositories or schema are touched (this plan does not require either; it reads through services/repositories, so the runtime smoke is not strictly required for this feature, but will be run if any Prisma path is touched).

## Risks

- Existing legacy `/broker/starter/dashboard` and `/broker/crm/dashboard` endpoints stay; the new `/broker/dashboard` is plan-adaptive. Risk: confusion about which is canonical. Mitigation: documentation calls out that the new endpoint is the unified V1 dashboard for new UI; legacy endpoints retained for backwards compat.
- Compliance alert aggregation depends on `AuditLog` action naming; if action codes drift, counts diverge. Mitigation: enumerate explicit accepted refusal action codes in `compliance-alerts.service.ts` and add a unit test that asserts the enumeration.
- Window math (timezone) — use UTC ISO strings throughout; documented in `data-model.md`.
- Out-of-scope admin params: explicit 403 plus audit. Mitigation: integration tests for Admin Pays / Finance Admin / Content Admin.
- Feature-flag cache staleness on toggle: covered by existing `featureFlags.setFlag` cache invalidation.
- N+1 risk: covered by tests asserting list-and-aggregate pattern.

## Rollback And Cleanup

- Implementation is additive: new module, new endpoints, new pages.
- Rollback = revert the commits; no schema change to undo.
- Disabling `broker_dashboard_enabled` is the runtime kill-switch for the broker dashboards.
- Admin dashboards remain accessible to admins by design; if needed, the controller can be temporarily removed from the wiring without affecting other modules.

## Recommended Implementation Order

1. Setup: shared DTOs (`dashboard.contracts.ts`) and backend module skeleton (folders, audit actions constants, time window helpers).
2. Foundational: dashboards-access-policy with feature-flag and RBAC checks; runtime composition.
3. US1: broker Starter dashboard service + endpoint + tests + UI page.
4. US2: broker Pro/Enterprise dashboard with CRM section + tests + UI page.
5. US3: admin dashboard service + endpoint + tests + UI page.
6. Compliance alerts service + endpoint + tests + UI page.
7. US4: tenant isolation and forgery refusal tests (cross-cutting).
8. US5: admin audit tests.
9. US6: window bound tests + pagination tests.
10. Playwright smokes.
11. Final validations.

## Complexity Tracking

No constitutional violations. No exception requested.

## Post-Design Constitution Re-Check

- Technical platform role: Pass. Read-only operational tooling.
- Regulatory and consent: Pass. No transmission; aggregates only.
- Feature flags and activation: Pass. Fail-closed broker flag; CRM section gated on existing flag.
- Frontend application separation: Pass. New routes only in `apps/broker/` and `apps/admin/`. Public app untouched.
- Security and RBAC: Pass. Auth + MFA + role allow-list + tenant scope at service.
- Data and auditability: Pass. Admin reads audited; broker refusals audited.
- Routing integrity: Pass. Read-only; routing rules unchanged.
- AI control: Pass. No AI call or activation.
- UX and content safety: Pass. Internal vocabulary; no forbidden phrases.
- Testing discipline: Pass. Unit + integration + RBAC + tenant + flags + audit + Playwright back-office.
- Async and reliability: Pass. No async work introduced.
- Continuous workflow safety: Pass. Workflow continues to `/speckit.tasks` and `/speckit.implement` with documented stops on conflict, ambiguity or risk.
