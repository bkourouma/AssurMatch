# Implementation Plan: Back-office Admin UX Polish

**Branch**: `023-backoffice-admin-ux-polish` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-backoffice-admin-ux-polish/spec.md`

**Continuous Workflow Eligibility**: Eligible. The spec is explicitly user-approved, contains no `[NEEDS CLARIFICATION]` markers, and is a standard admin UX/UI feature. It may continue through `/speckit.tasks`, `/speckit.implement` and final validations without intermediate confirmation. Stop for constitutional conflict, security/compliance/data leakage risk, business logic change, production activation or blocking validation failure.

## Summary

Replace the raw admin scaffold with a professional, reusable admin interface for the existing Back-office Admin only. The implementation will add an admin shell, visual design foundation, reusable UI primitives, polished dashboard KPI presentation, structured existing admin pages and Playwright/source guardrail coverage while preserving existing business logic, RBAC, API routes, feature flags, routing and frontend separation.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; Next.js 16.2.4; React 19.2.5; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1.
**Primary Dependencies**: Existing Next.js admin app under `apps/admin`, React server/client components as already used, existing fetch/session helpers in `apps/admin/app/lib`, existing backend dashboard/admin endpoints, existing Playwright/Vitest setup.
**Storage**: No storage or schema changes. PostgreSQL, Redis, BullMQ and Prisma-runtime behavior remain unchanged.
**Testing**: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`, `npm audit --audit-level=high`, `git diff --check`, plus local web validation where possible.
**Target Platform**: Local and deployable AssurMatch web platform with separated apps: Backend API on port 3600, Web Publique Client on port 3601, Back-office Admin on port 3602.
**Impacted Application(s)**: Back-office Partenaires/Plateforme, specifically `apps/admin`. Shared packages only if strictly necessary for UI primitives. Web Publique Client, Back-office Courtier, Backend API and database are out of scope unless a minor read-compatible adaptation is unavoidable.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Admin pages remain responsive for normal operational datasets; shell and dashboard should show loading or meaningful fallback states instead of blocking indefinitely. No heavy synchronous backend work is introduced.
**Constraints**: No business logic changes, no security rule changes, no API route changes, no Prisma/database changes, no production activation, no sensitive feature activation, no public app admin UI leakage, no broker/admin route mixing, no forbidden wording.
**Scale/Scope**: Existing admin pages: root/dashboard, catalogue, partners, users, feature flags, compliance, operations and platform dashboard. Audit logs/settings appear only if existing routes are present.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **Technical platform role**: Pass. UI polish only; no sale, subscription, premium collection, policy issuance, attestation, claims, signature, insurer API or binding advice.
- **Regulatory and consent**: Pass. No lead transmission changes. Existing ConsentRecord requirements remain untouched.
- **Feature flags and activation**: Pass. No flags are activated. Sensitive flags displayed by the UI remain disabled/read-only when disabled.
- **Frontend application separation**: Pass. Scope is `apps/admin`; source guardrails will verify the public app does not import or expose admin screens/routes/layouts.
- **Security and RBAC**: Pass. Existing auth, MFA, RBAC and tenant/platform checks remain authoritative. UI must not add controls that bypass permissions.
- **Data and auditability**: Pass. No persistence changes. Existing AuditLog/history may be displayed only if already available.
- **Routing integrity**: Pass. Routing rules and lead eligibility remain unchanged; routing statuses may only be represented visually.
- **AI control**: Pass/N/A. No AI functionality, recommendation or model call is introduced.
- **UX and content safety**: Pass. Admin copy avoids forbidden promises and focuses on operations, compliance and configuration status.
- **Testing discipline**: Pass. Back-office Playwright tests and source guardrails will cover layout, navigation, dashboard cards, state handling, public/admin separation and forbidden wording.
- **Async and reliability**: Pass/N/A. No new heavy async or sync processing is introduced.
- **Continuous workflow safety**: Pass. Approved standard feature; continue unless a stop condition appears.

## Project Structure

### Documentation (this feature)

```text
specs/023-backoffice-admin-ux-polish/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    admin-ui-contract.md
  checklists/
    requirements.md
  tasks.md
```

### Source Code (repository root)

```text
apps/
  admin/
    app/
      layout.tsx                       # admin root layout
      page.tsx                         # admin landing/dashboard route
      dashboard/page.tsx               # platform dashboard
      catalog/page.tsx
      partners/page.tsx
      users/page.tsx
      feature-flags/page.tsx
      compliance/page.tsx
      operations/page.tsx
      lib/
        *.ts                           # existing admin data/session helpers
        ui/                            # reusable admin UI primitives
      globals.css or equivalent        # admin visual foundation if not present
    tests/
      *.spec.ts                        # admin Playwright/source tests
  public/
    tests/
      auth-separation.spec.ts          # source guardrails against admin leakage
```

**Structure Decision**: Implement the polish inside `apps/admin` and keep route/layout ownership in the admin app. Shared UI primitives should live under `apps/admin/app/lib/ui` unless a proven existing shared package is already used for admin-only UI. Public and broker apps remain untouched except for tests that verify separation.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

1. Use an app-level admin shell in `apps/admin/app/layout.tsx` with conditional auth-route handling when needed.
2. Keep reusable UI primitives local to the admin app to avoid accidental public/broker coupling.
3. Use plain CSS/custom properties and existing dependencies rather than adding a new design-system package.
4. Use the existing data-fetching surface and normalize partial/missing data in presentation code only.
5. Extend Playwright/source tests to cover UI structure, responsive markers, forbidden wording and public/admin separation.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): UI-only view models and states, with no persisted data model changes.
- [contracts/admin-ui-contract.md](./contracts/admin-ui-contract.md): expected admin shell, navigation, KPI, table/list, state and guardrail contracts.
- [quickstart.md](./quickstart.md): local verification steps and expected manual checks.

## Technical Plan

### 1. Admin Shell

Create a complete admin shell with a left sidebar, top header, content region, active route indication, logout control and current user display when existing session data exposes it. Login, MFA and password recovery routes must remain usable and should not be trapped inside a layout that breaks auth flow.

### 2. UI Foundation

Add an admin visual foundation: light gray page background, white surfaces, restrained borders, readable typography, coherent spacing, visible focus states, sober indigo identity, teal/cyan accents, red/orange/green status colors and responsive layout rules. Avoid nested cards and oversized marketing-style composition.

### 3. Reusable Admin UI Primitives

Create small reusable primitives for page headers, KPI cards, tables, status badges, role badges, feature flag badges, empty states, error states, loading/skeleton states, search/filter controls and buttons. Keep the API narrow and aligned to existing page needs.

### 4. Dashboard Polish

Replace raw dashboard display with KPI cards, compliance/operations sections and readable degraded states. Existing metrics should map to required KPI slots where available; unavailable optional metrics should show empty/unavailable states without inventing data.

### 5. Existing Page Polish

Apply consistent page structure to Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard. Preserve existing forms/actions and avoid fake buttons for unimplemented workflows.

### 6. Guardrails and Tests

Add or update Playwright/source tests for admin layout presence, required navigation, dashboard cards, empty/error markers where possible, responsive class/viewport behavior, public/admin separation and forbidden wording. Avoid modifying backend tests unless a read-compatible display adaptation requires it.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Admin shell | Authenticated admin sees sidebar, header, content and logout |
| Navigation | Required links are present and active state is visible |
| Dashboard | KPI cards render from available data; unavailable data degrades cleanly |
| Existing pages | Listed admin pages have title, description, structured content and clean states |
| Sensitive flags | Disabled sensitive flags remain disabled/read-only |
| Public separation | Public app does not load admin routes/layouts/auth privileges |
| Broker separation | Broker app route/access boundaries remain untouched |
| Accessibility | Visible focus, labels/aria where needed, readable hierarchy |
| Responsive | Desktop/tablet/mobile viewports remain readable |
| Forbidden wording | Forbidden phrases are absent |
| Validations | Requested npm/test/build/audit/diff checks executed |

## Risks

- Existing pages may fetch heterogeneous data shapes. Mitigation: normalize only at presentation boundaries and keep API contracts unchanged.
- Auth routes may become awkward if wrapped by the admin shell. Mitigation: conditionally keep auth flows clean or structure shell so auth screens remain usable.
- Some dashboard KPI data may not exist today. Mitigation: show unavailable/empty states rather than creating business logic or new endpoints.
- CSS changes may affect login/MFA pages. Mitigation: verify auth pages and keep layout selectors scoped.
- Full validation suite may be slow or depend on local services. Mitigation: run all requested commands and report any environment blockers precisely.

## Recommended Implementation Order

1. Inventory existing admin routes, helpers and tests.
2. Add admin CSS foundation and shell.
3. Add reusable UI primitives.
4. Polish dashboard/root.
5. Polish Catalogue, Partenaires, Utilisateurs, Feature flags, Conformité, Opérations and Platform dashboard.
6. Add/update Playwright/source guardrail tests.
7. Run final validations and local web check if possible.

## Complexity Tracking

No constitutional violations. No exception requested.

## Post-Design Constitution Re-Check

- Technical platform role: Pass. UX/UI only.
- Regulatory and consent: Pass. No consent/routing behavior changed.
- Feature flags and activation: Pass. No activation and sensitive flags stay disabled/read-only.
- Frontend application separation: Pass. Admin-only implementation with public separation tests.
- Security and RBAC: Pass. Existing auth/RBAC remains authoritative.
- Data and auditability: Pass. No schema or persistence changes.
- Routing integrity: Pass. No routing changes.
- AI control: Pass/N/A. No AI introduced.
- UX and content safety: Pass. Forbidden wording guardrail required.
- Testing discipline: Pass. Back-office and separation tests planned.
- Async and reliability: Pass/N/A. No heavy processing introduced.
- Continuous workflow safety: Pass. Continue to tasks and implementation unless a stop condition occurs.
