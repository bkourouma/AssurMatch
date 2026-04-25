# Implementation Plan: Socle plateforme AssurMatch

**Branch**: `001-socle-plateforme` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-socle-plateforme/spec.md`

**Note**: This plan stops at Phase 2 planning artifacts. Implementation tasks are generated separately by `/speckit.tasks`.

## Summary

Build the AssurMatch foundation as a TypeScript monorepo with a NestJS modular backend, PostgreSQL/Prisma source of truth, Redis-backed cache/rate limits/locks/feature flag reads, BullMQ asynchronous jobs, S3-compatible accreditation documents, and Next.js/React apps prepared for public, broker and admin surfaces. The first increment establishes authentication, users, RBAC, countries, regulatory regimes, products, partners, licenses, feature flags, consent evidence, audit logs, technical notifications, base AI controls and base routing pre-checks while keeping comparator, quote creation, broker portal, CRM, billing, payments, e-signature, issuance, claims, advanced APIs, advanced AI and advanced routing inactive.

## Technical Context

**Language/Version**: Node.js 24.15.0 LTS baseline; TypeScript 6.0.3 with strict mode; Next.js 16.2.4; React 19.2.5; NestJS 11.1.19.
**Primary Dependencies**: Prisma 7.8.0 and `@prisma/client` 7.8.0; BullMQ 5.76.2; `redis` 5.12.1; Zod 4.3.6 for shared validation contracts; Vitest 4.1.5 for unit/integration/contract tests; Playwright 1.59.1 for web smoke and accessibility-oriented flows; NestJS guards/interceptors/pipes for RBAC, audit and validation boundaries.
**Storage**: PostgreSQL is the durable source of truth; Redis supports feature flag cache, active country/product cache, rate limiting, anti-spam, temporary locks, duplicate-prevention hooks and BullMQ queues; S3-compatible object storage holds partner accreditation documents with metadata in PostgreSQL.
**Testing**: Vitest for unit, integration, RBAC, routing pre-check, feature flag, consent/license/audit and AI guardrail tests; contract tests against OpenAPI; Playwright for admin/public/broker smoke flows once UI shells exist.
**Target Platform**: SaaS web platform with public site, broker portal, admin back-office and backend API.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: 95% of enabled public catalog reads under 1 second; 95% of admin list/filter reads under 2 seconds for acceptance datasets; sensitive mutations under 3 seconds excluding asynchronous jobs; emergency country/product/partner/module disable effective within 2 minutes; 95% of paired WhatsApp/email notification jobs visible as queued, delivered, failed or retryable within 5 minutes.
**Constraints**: No direct sale, no direct subscription, no premium collection in V1, no contract or attestation issuance, no binding personalized advice, ConsentRecord before future lead transmission, partner license validity before activation/routing eligibility, auditable sensitive actions, MFA for admins and brokers, PII masking in technical logs, no heavy public synchronous work.
**Scale/Scope**: Foundation must be designed for 50 countries, 500 products, 5,000 partners, 100,000 users and up to 50 million monthly public reads as planning/acceptance-test assumptions, while public activation remains explicitly feature-flagged and limited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The plan implements only foundation administration, controls and contracts. It excludes comparator completion, quote creation, premium payment, e-signature, contract/attestation/policy issuance, claims and binding advice.
- **Regulatory and consent**: Pass. ConsentText and ConsentRecord are modeled; future lead transmission is blocked without scoped consent. PartnerLicense and AccreditationDocument enforce license validity before activation/routing eligibility.
- **Feature flags and activation**: Pass. Global, country, product and operational partner/module controls are in scope. Public/commercial WhatsApp remains flag-controlled; technical compliance notification delivery uses paired WhatsApp and email.
- **Security and RBAC**: Pass. Auth, MFA, RBAC, scoped roles, tenant isolation, export limits, PII masking, validation, rate limiting and anti-spam are foundational tasks.
- **Data and auditability**: Pass. Critical entities include createdAt/updatedAt/createdBy where applicable; AuditLog covers sensitive successes and failures; 10-year default retention applies to audit, consent and accreditation evidence unless country/regime rules override it.
- **Routing integrity**: Pass. Only non-transmissive RoutingPrecheck is in scope. It evaluates consent, country/product flags, partner status, authorization, license validity, quotas and disabled routing modules without notifying brokers or routing leads.
- **AI control**: Pass. AI is limited to a base registry/config/audit model. Advanced scoring, recommendation, assistant and routing functions remain disabled; disabled AI must produce zero model calls.
- **UX and content safety**: Pass. Public wording restrictions from the constitution remain binding; forbidden sale/subscription/contract-validity phrases are not introduced.
- **Testing discipline**: Pass. Required tests cover unit, integration, RBAC, feature flags, non-consent, expired license, disabled country/product, routing pre-check and AI guardrails.
- **Async and reliability**: Pass. Notifications, document-processing hooks, future IA jobs, future routing jobs and maintenance tasks use BullMQ/Redis; heavy public synchronous processing is excluded.

**Post-Design Constitution Check**: Pass. Phase 1 artifacts preserve the foundation-only scope, include data/audit/consent/license/RBAC/flag/AI/routing controls, and do not introduce regulated commercial flows or unsupported exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/001-socle-plateforme/
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    foundation-api.openapi.yaml
  tasks.md
```

### Source Code (repository root)

```text
apps/
  public/                 # Next.js public catalog shells, no active comparator/devis in this feature
  broker/                 # Next.js broker account foundation shell, no full Starter portal/CRM in this feature
  admin/                  # Next.js back-office admin for foundation administration
backend/
  src/
    modules/
      auth/
      users/
      countries/
      regulatory-regimes/
      products/
      partners/
      partner-licenses/
      documents/
      feature-flags/
      consent/
      audit-logs/
      notifications/
      routing/
      ai/
      admin/
      common/
    jobs/
      notifications/
      maintenance/
    config/
  prisma/
    schema.prisma
    migrations/
  tests/
    unit/
    integration/
    contract/
    guardrails/
packages/
  shared/
    contracts/
    validation/
    rbac/
```

**Structure Decision**: Use a monorepo with separate frontend apps and one modular NestJS backend. Only the foundation modules needed by this feature are created now; commercial modules named in the constitution remain planned but inactive until future specs. Shared contracts and validation live in `packages/shared/` so backend, admin and future public/broker apps use the same canonical DTOs and wording constraints.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Implementation Constitution Evidence

Re-run after implementation scaffold:

- Positionnement plateforme: Pass. UI shells and services avoid sale, subscription, contract issuance, attestation issuance and binding personalized advice.
- Conformite et consentement: Pass. ConsentText/ConsentRecord, PartnerLicense, AccreditationDocument and AuditLog services enforce evidence before future transmission or activation.
- Activation progressive: Pass. Default global, country and product flags remain disabled; rapid disable and fail-closed cache behavior are implemented and tested.
- Securite/RBAC/MFA: Pass. Role matrix, RBAC guard, MFA guard, tenant isolation checks and export refusal tests are present.
- Donnees/audit: Pass. Critical services write AuditLog evidence with 10-year default retention and PII masking.
- Routage responsable: Pass. RoutingPrecheck is deterministic, non-transmissive and records refusal reasons without broker notification.
- IA: Pass. AI foundation is registry/config only; disabled modules produce zero model calls.
- Tests: Pass pending command execution. Unit, integration, contract, guardrail and Playwright smoke tests have been added for the socle scope.
