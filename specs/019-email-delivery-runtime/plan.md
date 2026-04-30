# Implementation Plan: Email Delivery Runtime

**Branch**: `019-email-delivery-runtime` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-email-delivery-runtime/spec.md`

**Continuous Workflow Eligibility**: Eligible. The spec is explicitly approved,
contains no `[NEEDS CLARIFICATION]` markers and is a standard runtime hardening
feature. Continue through `/speckit.tasks` and `/speckit.implement` unless a
constitutional, security, compliance, secret-leakage or blocking validation
risk appears. Do not commit automatically.

## Summary

Implement a runtime email delivery layer for transactional auth/security
messages. The backend will support `disabled`, `mailpit` and `smtp` modes via
environment configuration, render constitution-safe text/html templates, send
activation and password reset messages through a port-based email sender, audit
delivery attempts with masked metadata, and document local/preproduction Mailpit
plus explicit SMTP configuration boundaries. No public visitor route, new
regulated business workflow, campaign, subscription or insurance decision is
introduced.

## Technical Context

**Language/Version**: TypeScript strict on Node >=24.15.0, NestJS backend,
Next.js/React web apps.
**Primary Dependencies**: Existing Node runtime, NestJS 11, Prisma 7, BullMQ,
Redis client, Vitest, Playwright. No new mail package dependency; SMTP is
implemented through Node `net`/`tls` for the narrow transactional transport.
**Storage**: No new database table or migration. Delivery evidence uses existing
AuditLog writer and runtime logs with masked metadata. PostgreSQL remains source
of truth for users/auth. Redis/BullMQ remain unchanged.
**Testing**: Vitest unit/integration tests, Playwright web separation tests,
Prisma schema validation, runtime PostgreSQL smoke when feasible because auth
runtime wiring is touched.
**Target Platform**: SaaS web platform with separated Web Publique Client,
Back-office Partenaires/Plateforme and Backend API.
**Impacted Application(s)**: Backend API, runtime operations, local/preproduction
tooling and documentation. Web Publique Client is validation-only: it must not
gain email/back-office routes or env exposure.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Auth email send attempts use a bounded timeout
(`EMAIL_SEND_TIMEOUT_MS`, default 5000). Disabled mode performs no network I/O.
Mailpit/local and SMTP send one message per token issuance request.
**Constraints**: SMTP secrets come only from runtime env. `EMAIL_SMTP_PASS` is
never committed, echoed, logged or surfaced to browsers. Mailpit is refused in
production. Emails avoid regulated sales/subscription language.
**Scale/Scope**: Activation and password reset emails only. Lead, broker,
marketing, newsletter, policy, claims, SMS/WhatsApp and AI flows remain out of
scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. Transactional security email only; no
  direct insurance sale, subscription, premium collection, policy issuance,
  attestation or binding advice.
- **Regulatory and consent**: Pass/N/A. Auth/security email does not require
  lead consent. Future lead/marketing email is explicitly out of scope and
  cannot bypass existing consent/routing controls.
- **Feature flags and activation**: Pass. No regulated feature flag is activated.
  Email delivery is off by default through `EMAIL_SERVICE_TYPE=disabled` unless
  the operator explicitly configures Mailpit or SMTP.
- **Frontend application separation**: Pass. No Web Publique Client route,
  layout, privilege or back-office auth state is added. Back-office/auth
  controllers remain protected by existing RBAC/MFA/tenant isolation.
- **Security and RBAC**: Pass. Existing user lifecycle actions keep their
  authorization gates. Email layer masks recipients, errors and credentials;
  startup refuses incomplete SMTP config.
- **Data and auditability**: Pass. Existing AuditLog writer records purpose,
  masked recipient, status, provider mode and safe error class; no token,
  password or SMTP credential is persisted.
- **Routing integrity**: N/A. No lead routing or broker notification is added.
- **AI control**: N/A. No AI call, prompt or suggestion is introduced.
- **UX and content safety**: Pass. Templates identify AssurMatch as a technical
  platform and avoid forbidden sales/subscription wording.
- **Testing discipline**: Pass. Plan requires unit config/template/sender tests,
  integration auth delivery tests, secret-scan checks, public app separation
  checks and final validation suite.
- **Async and reliability**: Pass. Scope is one bounded transactional send per
  token issuance. No heavy public endpoint work or mass sending is introduced.
- **Continuous workflow safety**: Pass. User explicitly requested continuous
  plan/tasks/implement and no auto-commit.

## Project Structure

### Documentation (this feature)

```text
specs/019-email-delivery-runtime/
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    email-runtime.md
  tasks.md
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      config.module.ts
    modules/
      auth/
        auth.module.ts
      notifications/
        email/
          email-config.ts
          email-delivery.service.ts
          email-template.service.ts
          smtp-email-sender.ts
        user-auth-notification.service.ts
      users/
        admin-users.controller.ts
    runtime/
      assurmatch-runtime.ts
      runtime-http.controller.ts
    modules/http-wiring/
      runtime-http-wiring.module.ts
  tests/
    unit/notifications/
    integration/auth/
    guardrails/
apps/
  public/
    tests/ or existing Playwright tests for separation verification only
.env.example
.env.preproduction.example
launch-local.bat
launch-preprod.bat
```

**Structure Decision**: Keep email transport inside
`backend/src/modules/notifications/email/` because it is a runtime delivery
concern used by existing auth/user lifecycle services. Do not create a new
frontend surface. Do not add a Prisma migration unless persistent delivery
history becomes required; this plan uses existing audit evidence instead.

## Complexity Tracking

No constitutional violations or exceptions are required.
