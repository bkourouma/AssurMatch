# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See
`.specify/templates/plan-template.md` for the execution workflow.

**Continuous Workflow Eligibility**: [Eligible / Not eligible / N/A]
[State whether the spec is validated, committed or explicitly user-approved,
contains no `[NEEDS CLARIFICATION]` markers, and can continue through
`/speckit.tasks` and `/speckit.implement` without intermediate confirmation.
List any stop condition if not eligible.]

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace or refine the content in this section with the
  concrete technical decisions for the feature. Defaults reflect the AssurMatch
  constitution and must not be weakened without a documented exception.
-->

**Language/Version**: TypeScript strict; Next.js/React frontend; NestJS backend; exact versions [NEEDS CLARIFICATION]
**Primary Dependencies**: Next.js, React, NestJS, Prisma, BullMQ, Redis client, validation/RBAC libraries [NEEDS CLARIFICATION]
**Storage**: PostgreSQL source of truth; Redis for cache, queues, rate limiting, feature flags and locks; S3-compatible documents
**Testing**: Unit, integration, RBAC, routing rules, feature flags, public endpoint, AI guardrail, public Playwright smoke and back-office Playwright smoke tests [NEEDS CLARIFICATION: runner]
**Target Platform**: SaaS web platform with two separated web applications: Web Publique Client and Back-office Partenaires/Plateforme, plus Backend API and shared packages
**Impacted Application(s)**: [Web Publique Client | Back-office Partenaires/Plateforme | Backend API | packages partages | multiple - NEEDS CLARIFICATION]
**Project Type**: B2B2C regulated marketplace web application
**Performance Goals**: Public endpoints remain responsive; heavy work runs asynchronously via BullMQ; concrete SLOs [NEEDS CLARIFICATION]
**Constraints**: No direct sale, no direct subscription, no premium collection in V1, consent before transmission, auditable sensitive actions
**Scale/Scope**: Build broad domain model with feature-flagged activation by global, country, product, partner and plan scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Each gate MUST be marked Pass, Fail, or N/A with evidence. Any Fail requires a
Complexity Tracking entry plus an explicit compliance exception.

- **Technical platform role**: Confirms AssurMatch remains a technical platform.
  No direct insurance sale, direct subscription, V1 premium collection, contract
  issuance, attestation issuance, or binding personalized advice is introduced.
- **Regulatory and consent**: Identifies required consent records, legal notices,
  responsible broker visibility, license checks and automatic blocks for expired
  or invalid licenses.
- **Feature flags and activation**: Lists every global, country, product,
  partner, plan or AI flag needed, including deactivation behavior.
- **Frontend application separation**: Identifies impacted application(s). Public
  visitor journeys stay in Web Publique Client without back-office screens,
  routes, privileges or partner/admin auth dependencies. Partner/admin journeys
  stay in Back-office Partenaires/Plateforme with authentication, strict RBAC,
  role-based MFA, audit and tenant checks. Shared UI packages are allowed only
  when routes, layouts, access policies and functional responsibilities remain
  separate.
- **Security and RBAC**: Defines roles, tenant isolation, MFA impact, permission
  checks, export limits, PII masking, rate limiting and input validation.
- **Data and auditability**: Defines createdAt, updatedAt, createdBy where
  applicable, AuditLog coverage, ConsentRecord history, validity periods and
  change history for offers, licenses, routing and flags.
- **Routing integrity**: Proves no lead can route without consent, active country
  and product, authorized active broker, valid license, quota compliance and
  auditable routing decision.
- **AI control**: Confirms AI is centralized in the backend ai module, optional by
  flags and plan, audited, PII-minimized and used only as assistance with human
  validation for sensitive suggestions.
- **UX and content safety**: Confirms public wording uses indicative comparison
  and quote language, exposes sponsored offers, and avoids forbidden phrases
  such as "acheter maintenant", "souscrire maintenant", "contrat valide" and
  "garantie acceptee".
- **Testing discipline**: Lists required unit, integration, RBAC, feature flag,
  non-consent, expired-license, disabled-country/product, routing and AI
  guardrail tests, plus separated Playwright smoke tests for public and
  back-office surfaces when frontend is in scope.
- **Async and reliability**: Confirms heavy work, notifications, document
  processing, duplicate detection and non-trivial routing support asynchronous
  execution with Redis/BullMQ where appropriate.
- **Continuous workflow safety**: Confirms whether automatic continuation from
  plan to tasks to implementation is allowed. It is allowed only for validated,
  committed or explicitly approved standard specs with no
  `[NEEDS CLARIFICATION]` markers and no constitutional, regulatory, security,
  data leakage, product-decision or blocking-validation risk.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
  plan.md              # This file (/speckit.plan command output)
  research.md          # Phase 0 output (/speckit.plan command)
  data-model.md        # Phase 1 output (/speckit.plan command)
  quickstart.md        # Phase 1 output (/speckit.plan command)
  contracts/           # Phase 1 output (/speckit.plan command)
  tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  touched by this feature. Delete unused modules and add exact paths.
-->

```text
apps/
  public/                 # Web Publique Client: visitor, product, comparator and quote flows
  backoffice/             # Back-office Partenaires/Plateforme: broker, admin and platform flows
backend/
  src/
    modules/
      auth/
      users/
      countries/
      regulatory-regimes/
      products/
      offers/
      partners/
      partner-licenses/
      quote-requests/
      leads/
      routing/
      broker-portal/
      broker-crm/
      dashboards/
      billing/
      notifications/
      documents/
      feature-flags/
      audit-logs/
      consent/
      ai/
      reports/
      admin/
      integrations/
      webhooks/
      common/
  prisma/
  tests/
    unit/
    integration/
    contract/
packages/
  shared/                 # Shared types, DTO contracts, validation helpers and design-system packages
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above, including how public and back-office routes,
layouts, env vars, domains and deployments remain separable]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., activating payments before compliance approval] | [current need] | [why delayed activation is not acceptable] |
| [e.g., synchronous public endpoint for heavy processing] | [specific problem] | [why BullMQ async processing is insufficient] |
