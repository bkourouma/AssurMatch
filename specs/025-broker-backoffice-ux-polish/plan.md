# Implementation Plan: Broker Back-office UX Polish

**Branch**: `025-broker-backoffice-ux-polish` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-broker-backoffice-ux-polish/spec.md`

**Continuous Workflow Eligibility**: Eligible. The spec is explicitly user-approved, contains no `[NEEDS CLARIFICATION]` markers, and is a standard broker back-office UX/UI feature. It may continue through `/speckit.tasks`, `/speckit.implement` and final validations without intermediate confirmation. Stop for constitutional conflict, security/compliance/data leakage risk, business logic change, production activation, forbidden module activation, uncovered product decision or blocking validation failure.

## Summary

Polish the authenticated broker back-office into a professional, clear and usable workspace for Starter, Pro and Enterprise brokers. The implementation will add a broker shell, visual foundation, local broker UI primitives, improved dashboard, Starter leads, Pro/Enterprise CRM, lead detail, account, team and notification surfaces where available, plus Playwright/source guardrails for plan gating, public/admin/broker separation and forbidden wording. Existing backend business logic, API routes, RBAC, tenant isolation, feature flags, routing, consent, license controls and Prisma schema remain unchanged.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; Next.js 16.2.4; React 19.2.5; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1.
**Primary Dependencies**: Existing Next.js broker app under `apps/broker`, React server/client components as already used, existing broker fetch/session helpers in `apps/broker/app/lib`, existing broker dashboard/Starter/CRM endpoints, existing Playwright/Vitest setup.
**Storage**: No storage or schema changes. PostgreSQL, Redis, BullMQ and Prisma-runtime behavior remain unchanged.
**Testing**: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npm audit --audit-level=high`, `git diff --check`, secret scan/equivalent, plus `npm run test:web:local` and local browser validation when the local stack can run.
**Target Platform**: Local and deployable AssurMatch web platform with separated apps: Backend API on port 3600, Web Publique Client on port 3601, Back-office Admin on port 3602 and Back-office Courtier on port 3603.
**Impacted Application(s)**: Back-office Partenaires/Plateforme, specifically `apps/broker`. Shared packages only if strictly necessary for test/contract guardrails. Web Publique Client, Back-office Admin, Backend API and database are out of scope except for tests that verify separation.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Broker pages remain responsive for normal operational datasets; shell and pages show loading, empty, error or unavailable states instead of blocking indefinitely. No heavy synchronous backend work is introduced.
**Constraints**: No business logic changes, no security rule changes, no API route changes, no Prisma/database changes, no production activation, no sensitive feature activation, no public app broker UI leakage, no admin/broker route mixing, no forbidden wording, no unavailable action presented as active.
**Scale/Scope**: Existing broker pages: root/dashboard, Leads, Starter lead detail, CRM, CRM leads, CRM lead detail, Account, Team, Notifications if already exposed through existing routes/endpoints, auth/login/MFA/password flows.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **Technical platform role**: Pass. UI polish only; no sale, subscription, premium collection, policy issuance, attestation, claims, signature, insurer API or binding advice.
- **Regulatory and consent**: Pass. No lead transmission changes. Existing ConsentRecord requirements and broker responsibility remain untouched.
- **Feature flags and activation**: Pass. No flags are activated. `starter_portal_enabled`, `broker_dashboard_enabled` and `broker_crm_enabled` are only represented as existing availability constraints.
- **Frontend application separation**: Pass. Scope is `apps/broker`; source guardrails will verify the public app does not import or expose broker screens/routes/layouts and broker navigation does not expose admin routes.
- **Security and RBAC**: Pass. Existing auth, MFA, RBAC and tenant checks remain authoritative. UI must not add controls that bypass permissions or expose cross-tenant data.
- **Data and auditability**: Pass. No persistence changes. Existing audit/history may be displayed only if already available.
- **Routing integrity**: Pass. Routing rules and lead eligibility remain unchanged; routing/status outcomes may only be represented visually.
- **AI control**: Pass/N/A. No AI functionality, recommendation, summary, scoring or model call is introduced.
- **UX and content safety**: Pass. Broker copy avoids forbidden promises and focuses on lead handling, CRM availability, operational status and partner responsibility.
- **Testing discipline**: Pass. Broker Playwright/source tests and guardrails will cover shell, navigation, dashboard, Starter CRM gating, Pro/Enterprise CRM flag gating, states, responsive behavior, public/broker/admin separation and forbidden wording.
- **Async and reliability**: Pass/N/A. No new heavy async or sync processing is introduced.
- **Continuous workflow safety**: Pass. Approved standard feature; continue unless a stop condition appears.

## Project Structure

### Documentation (this feature)

```text
specs/025-broker-backoffice-ux-polish/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    broker-ui-contract.md
  checklists/
    requirements.md
  tasks.md
```

### Source Code (repository root)

```text
apps/
  broker/
    app/
      layout.tsx
      page.tsx
      leads/page.tsx
      leads/[leadAssignmentId]/page.tsx
      crm/page.tsx
      crm/leads/page.tsx
      crm/leads/[leadAssignmentId]/page.tsx
      account/page.tsx
      team/page.tsx
      lib/
        broker-api.ts
        backoffice-auth.ts
        backoffice-session-actions.ts
        ui/
          broker-ui.tsx
          broker-shell.tsx
          broker-view-models.ts
      globals.css
    tests/
      broker-ux-polish.spec.ts
      dashboard.spec.ts
      leads/
        broker-leads.spec.ts
        broker-crm.spec.ts
  public/
    tests/
      auth-separation.spec.ts
```

**Structure Decision**: Implement the polish inside `apps/broker` and keep route/layout ownership in the broker app. Shared UI primitives should live under `apps/broker/app/lib/ui` unless a proven existing shared package is already used for broker-only UI. Public and admin apps remain untouched except for tests that verify separation.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

1. Use an app-level broker shell in `apps/broker/app/layout.tsx` with auth-route handling when needed.
2. Keep reusable UI primitives local to the broker app to avoid accidental public/admin coupling.
3. Use plain CSS/custom properties and existing dependencies rather than adding a new design-system package.
4. Use the existing broker data-fetching surface and normalize partial/missing data in presentation code only.
5. Explicitly gate Starter CRM and Pro/Enterprise CRM visibility in presentation using existing plan/capability/flag data.
6. Extend Playwright/source tests to cover UI structure, responsive markers, forbidden wording and public/broker/admin separation.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): UI-only view models and states, with no persisted data model changes.
- [contracts/broker-ui-contract.md](./contracts/broker-ui-contract.md): expected broker shell, navigation, dashboard, leads, CRM, account, team, notifications and guardrail contracts.
- [quickstart.md](./quickstart.md): local verification steps and expected manual checks.

## Technical Plan

### 1. Broker Shell

Create a complete broker shell with a sidebar, top header, content region, active route indication, logout control and current broker context when existing session data exposes it. Login, MFA and password recovery routes must remain usable and should not be trapped inside a layout that breaks auth flow.

### 2. UI Foundation

Add a broker visual foundation: quiet work-focused background, white surfaces, restrained borders, readable typography, coherent spacing, visible focus states, neutral identity, teal/green/blue operational accents and responsive layout rules. Avoid nested cards, marketing hero composition and oversized decorative treatments.

### 3. Reusable Broker UI Primitives

Create small reusable primitives for page headers, metric cards, status badges, plan/module badges, tables/lists, empty states, error states, loading/skeleton states, callouts and buttons. Keep the API narrow and aligned to existing broker page needs.

### 4. Dashboard Polish

Replace raw broker dashboard display with metric cards, recent lead/CRM summaries, operational availability sections and readable degraded states. Existing metrics should map to required slots where available; unavailable optional metrics should show empty/unavailable states without inventing data.

### 5. Starter Leads and Lead Detail

Improve the Starter lead list and detail surfaces with filters/status presentation, clear lead metadata, history, safe action placement and loading/empty/error states. Starter must not see full CRM capabilities as available and must see "Le CRM complet est disponible avec le plan Pro." where the full CRM entry point is blocked by plan.

### 6. CRM Pro/Enterprise Polish

Improve CRM and CRM lead pages for Pro/Enterprise brokers only when existing plan/capability/flag rules allow it. When `broker_crm_enabled` is false or unavailable, show a clear unavailable state and do not expose active CRM actions.

### 7. Account, Team and Notifications

Polish account and team pages using the same shell and state patterns. Notifications are included only if already available through existing broker routes/data. Read-only or unavailable states must not expose mutation controls.

### 8. Guardrails and Tests

Add or update Playwright/source tests for broker layout presence, required navigation, Starter CRM gating, Pro/Enterprise CRM flag gating, dashboard/cards/states, responsive behavior, public/broker/admin separation and forbidden wording. Avoid modifying backend tests unless a read-compatible display adaptation requires it.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Broker shell | Authenticated broker sees sidebar, header, content and logout |
| Navigation | Dashboard, Leads, CRM, Team, Account and available optional destinations are present; no admin/public route is linked |
| Dashboard | Metric cards render from available data; unavailable data degrades cleanly |
| Starter gating | Starter sees leads and required CRM Pro message, not active full-CRM tools |
| Pro/Enterprise CRM | CRM appears only when plan allows and `broker_crm_enabled` is true |
| Existing pages | Leads, lead detail, CRM, CRM detail, Account and Team have structured content and clean states |
| Tenant isolation | No UI change weakens existing tenant-scoped fetching or route protection |
| Public/Admin separation | Public app does not load broker/admin UI; broker app does not expose admin navigation |
| Accessibility | Visible focus, labels/aria where needed, readable hierarchy |
| Responsive | Desktop/tablet/mobile viewports remain readable |
| Forbidden wording | Forbidden phrases are absent |
| Validations | Requested npm/test/build/audit/diff/secret checks executed |

## Risks

- Existing broker pages may fetch heterogeneous data shapes. Mitigation: normalize only at presentation boundaries and keep API contracts unchanged.
- Auth routes may become awkward if wrapped by the broker shell. Mitigation: keep auth flows clean or structure shell so auth screens remain usable.
- Some dashboard or CRM availability data may not exist today. Mitigation: show unavailable/empty states rather than creating backend logic or fake data.
- CSS changes may affect login/MFA pages. Mitigation: verify auth pages and keep layout selectors scoped.
- Full local browser validation may require local seeded broker accounts. Mitigation: use only dev accounts and document any environment blocker.

## Recommended Implementation Order

1. Inventory existing broker routes, helpers and tests.
2. Add broker CSS foundation and shell.
3. Add reusable UI primitives.
4. Polish dashboard/root.
5. Polish Leads and lead detail.
6. Polish CRM and CRM lead detail with Starter/Pro/Enterprise gating.
7. Polish Account, Team and Notifications where available.
8. Add/update Playwright/source guardrail tests.
9. Run final validations and local web check if possible.

## Complexity Tracking

No constitutional violations. No exception requested.

## Post-Design Constitution Re-Check

- Technical platform role: Pass. UX/UI only.
- Regulatory and consent: Pass. No consent/routing behavior changed.
- Feature flags and activation: Pass. No activation and sensitive flags stay disabled/read-only.
- Frontend application separation: Pass. Broker-only implementation with public/admin/broker separation tests.
- Security and RBAC: Pass. Existing auth/RBAC and tenant scoping remain authoritative.
- Data and auditability: Pass. No schema or persistence changes.
- Routing integrity: Pass. No routing changes.
- AI control: Pass/N/A. No AI introduced.
- UX and content safety: Pass. Forbidden wording guardrail required.
- Testing discipline: Pass. Back-office broker and separation tests planned.
- Async and reliability: Pass/N/A. No heavy processing introduced.
- Continuous workflow safety: Pass. Continue to tasks and implementation unless a stop condition occurs.
