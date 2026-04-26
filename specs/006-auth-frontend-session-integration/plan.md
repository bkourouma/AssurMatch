# Implementation Plan: Auth Frontend Session Integration AssurMatch

**Branch**: `006-auth-frontend-session-integration` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-auth-frontend-session-integration/spec.md`

**Continuous Workflow Eligibility**: Eligible. The user explicitly validated the
006 specification in the `/speckit.plan` request, the spec contains no
`[NEEDS CLARIFICATION]` marker, and the feature is a bounded security/runtime
integration. Continue through `/speckit.tasks`, `/speckit.implement` and final
validations unless a constitutional, security, data leakage or blocking
validation risk appears. Do not commit automatically.

## Summary

Connect the Back-office Partenaires/Plateforme frontend to the real runtime auth
introduced by 005. Add broker and admin login/logout surfaces, store the signed
access token in an HTTP-only back-office cookie, validate session state through
`/auth/me`, and make broker/admin API clients send `Authorization: Bearer
<token>` instead of runtime `x-assurmatch-*` headers. Keep simulation headers in
explicit tests only and preserve strict separation from the Web Publique Client.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; Next.js 16.2.4; React 19.2.5; NestJS 11.1.19.
**Primary Dependencies**: Next.js App Router server components/actions, React, NestJS runtime HTTP controllers/guards, Zod 4.3.6 contracts, Vitest 4.1.5, Playwright 1.59.1, Prisma 7.8.0 for validation only.
**Storage**: No new database model. The access token is held in an HTTP-only, same-site back-office cookie. Runtime identity and authorization remain backend-owned and derived from the signed token.
**Testing**: Vitest backend integration tests, Playwright source/guardrail tests for apps, existing `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npm run build`.
**Target Platform**: SaaS web platform with separated Web Publique Client and Back-office Partenaires/Plateforme, plus Backend API and shared packages.
**Impacted Application(s)**: Back-office Partenaires/Plateforme (`apps/broker`, `apps/admin`), Backend API only for auth/session test coverage or minor alignment, packages shared only if auth contracts need typing. Web Publique Client is test-verified but not functionally changed.
**Project Type**: B2B2C regulated insurance marketplace technical platform.
**Performance Goals**: Session checks and protected API calls should add only one `/auth/me` validation before rendering protected pages; 95% of protected page loads in local acceptance should complete without retry loops or duplicate auth calls.
**Constraints**: No direct sale, no subscription, no premium collection, no policy/attestation/claims, no external IdP/OAuth/SSO, no advanced refresh-token lifecycle, no advanced AI, no public exposure of back-office state.
**Scale/Scope**: Broker Starter, Broker CRM and Admin runtime clients/pages only. Existing 001-005 business behavior remains unchanged.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The feature only protects internal access and does not introduce sale, subscription, premium collection, policy, attestation, claims or advice.
- **Regulatory and consent**: N/A for new flows. No visitor consent or lead transmission is added. Existing lead views continue to depend on prior consent/routing controls.
- **Feature flags and activation**: Pass. No new flag is added. Existing `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled` and plan/tenant controls stay backend-owned.
- **Frontend application separation**: Pass. Only `apps/broker` and `apps/admin` receive auth/session code. `apps/public` is checked by tests to ensure it imports no back-office session/client code.
- **Security and RBAC**: Pass. Runtime identity comes from signed Bearer token. Next middleware and page/API clients reflect API 401/403 decisions; backend remains the source of authorization. MFA state is surfaced when present.
- **Data and auditability**: Pass. No new persistence. Tokens and passwords are excluded from logs/UI. Backend audit coverage remains in existing auth/runtime services and tests.
- **Routing integrity**: N/A. No routing decision changes. Broker pages continue to call existing tenant-protected endpoints.
- **AI control**: N/A. No AI model call, prompt, scoring or assistant is added.
- **UX and content safety**: Pass. Login, session expired and access denied copy avoids regulated sales language and does not expose protected data.
- **Testing discipline**: Pass. Tests cover login, Bearer token propagation, removal of runtime dev headers, 401/403 handling, Starter CRM denial, broker admin denial and public/back-office separation.
- **Async and reliability**: N/A. No heavy public endpoint or async job is added.
- **Continuous workflow safety**: Pass. User explicitly approved continuous plan -> tasks -> implement and final validations, with no auto-commit.

## Project Structure

### Documentation (this feature)

```text
specs/006-auth-frontend-session-integration/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    back-office-auth-session.md
  tasks.md
```

### Source Code (repository root)

```text
apps/
  public/                  # unchanged public app; separation tests only
  broker/
    middleware.ts          # broker auth redirect and role/plan gate
    app/
      login/
      lib/
        backoffice-auth.ts
        backoffice-session-actions.ts
        broker-api.ts
  admin/
    middleware.ts          # admin auth redirect and admin-role gate
    app/
      login/
      lib/
        admin-api.ts
        backoffice-auth.ts
        backoffice-session-actions.ts
backend/
  src/modules/auth/
  src/runtime/runtime-http.controller.ts
  tests/integration/
packages/
  shared/
    contracts/auth.contracts.ts
```

**Structure Decision**: Keep broker and admin as separate back-office apps rather
than creating a new shared backoffice app. Duplicate the small Next-specific
session helpers per app to avoid importing back-office session state into
`apps/public`. Use shared contracts only for DTO/response typing.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use an HTTP-only, same-site cookie for the access token because current pages
  are server-rendered and can attach Bearer tokens without exposing them to
  browser JavaScript.
- Use Next middleware in each back-office app for absent/invalid token redirects
  and coarse app-level role gates.
- Keep 401 cleanup behavior as redirect to login plus cookie overwrite/delete
  via login/logout actions; backend remains authoritative for token validity.
- Preserve `x-assurmatch-*` only in backend test helpers and explicitly isolated
  tests.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): frontend session state and token/profile model.
- [contracts/back-office-auth-session.md](./contracts/back-office-auth-session.md): UI/API session contracts.
- [quickstart.md](./quickstart.md): local validation workflow.

## Recommended Implementation Order

1. Add session helpers and login/logout actions for broker and admin apps.
2. Add broker/admin middleware to redirect missing/invalid tokens and deny wrong app roles.
3. Replace broker/admin runtime clients with Bearer token propagation and 401/403 states.
4. Protect broker and admin pages, removing protected fallback data from unauthenticated/forbidden states.
5. Add backend HTTP integration tests for login -> `/auth/me`, Starter CRM denial and broker admin denial.
6. Add Playwright/source tests for Bearer headers, absence of `x-assurmatch-*` in runtime clients, login pages and public separation.
7. Run required validations.

## Complexity Tracking

No constitutional violations or exceptions are planned.
