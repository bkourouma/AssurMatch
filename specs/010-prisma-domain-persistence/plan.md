# Implementation Plan: Prisma Domain Persistence AssurMatch

**Branch**: `010-prisma-domain-persistence` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-prisma-domain-persistence/spec.md`

**Continuous Workflow Eligibility**: Eligible for `/speckit.tasks` after this
plan is accepted. The user states the spec is created and validated, and this
planning request contains no unresolved clarification. This invocation must
stop after planning artifacts because the user explicitly requested no
`tasks.md` and no implementation. Future continuation must stop for
constitutional conflict, schema ambiguity that affects compliance, security or
tenant leakage risk, forbidden activation, uncovered product decision or
blocking validation failure. Do not auto-commit unless the user asks.

## Summary

Implement real asynchronous Prisma-backed repositories for AssurMatch critical
domain ports introduced by spec 009. `AuditLogRepository` and
`FeatureFlagRepository` are already Prisma-runtime and stay durable; the other
priority domains move from memory-test adapters to complete Prisma runtime
implementations. Services and controllers are adapted to async repository
contracts while preserving existing HTTP routes, response contracts, consent,
RBAC, tenant isolation, feature flags, audit and public/back-office separation.

The plan is progressive and vertical: first inventory and harden repository
contracts, then convert catalog, quote intake, routing/leads, partners/licenses,
Starter, CRM and notifications. Migrations are added only if the current Prisma
schema cannot persist an already-specified behavior. Memory adapters remain
available only for tests.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Redis client 5.12.1; BullMQ 5.76.2; Next.js 16.2.4; React 19.2.5.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@prisma/client`, `prisma`, `redis`, `bullmq`, `zod`, `vitest`, `@playwright/test`, shared contracts in `packages/shared`.
**Storage**: PostgreSQL through Prisma is the runtime source of truth. Redis remains cache/rate-limit/anti-spam/lock/queue infrastructure. BullMQ remains async job execution. No new storage is introduced.
**Testing**: Existing scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:guardrails`, `npm run test:web`, `npm run build`, `npm run validate`.
**Target Platform**: SaaS B2B2C regulated insurance marketplace with separated Web Publique Client, Back-office Partenaires/Plateforme, Backend API and shared packages.
**Impacted Application(s)**: Backend API is primary. Shared packages may be touched for existing DTO/contract/test helper alignment. Web Publique Client and Back-office Partenaires/Plateforme are not feature scopes and may only receive compatibility fixes if existing contracts require it.
**Project Type**: Regulated marketplace backend persistence hardening and repository runtime completion.
**Performance Goals**: Public catalog reads and quote submission remain within existing local SLO expectations from specs 007-009. Quote submission returns after durable critical state, not notification delivery. Broker/admin lists remain bounded or paginated. No new heavy public synchronous work is introduced.
**Constraints**: No new business capability, no new frontend screen, no payment, subscription, premium collection, policy issuance, attestation, e-signature, claims, advanced AI, advanced insurer API, advanced webhooks, white label or stack change. Preserve existing HTTP paths and API contracts unless a compatibility-safe correction is documented. Keep sensitive flags fail-closed. Keep memory adapters test-only.
**Scale/Scope**: Countries, Products, Offers, Prospects, ConsentRecords, QuoteRequests, LeadAssignments, RoutingDecisions, Partners, PartnerLicenses, CRMActivity, Notifications plus existing durable audit and feature flag repositories.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The work changes persistence only and does not introduce direct sale, subscription, premium collection, policy issuance, attestation, claims, e-signature, insurer API or binding advice.
- **Regulatory and consent**: Pass. Consent remains mandatory before transmission. `ConsentRecord` becomes durable in Prisma for quote flows, and no-consent paths create no assignment or broker notification.
- **Feature flags and activation**: Pass. Persistent feature flags remain the source of truth. Sensitive flags including payments, e-signature, policy issuance, claims, insurer API and AI-sensitive flags remain false/fail-closed when absent, invalid or unreadable.
- **Frontend application separation**: Pass. Backend API is the feature scope. Public and back-office apps remain separate; no routes, layouts, privileges or auth state are mixed.
- **Security and RBAC**: Pass. Broker/admin reads and mutations remain authenticated, RBAC-checked, tenant-scoped, plan-aware and PII-safe. Repository methods for broker data must take tenant scope or be service-wrapped before returning data.
- **Data and auditability**: Pass. Critical data is persisted in PostgreSQL with timestamps, retention fields and histories where modeled. Sensitive successes/refusals continue through durable audit.
- **Routing integrity**: Pass. Routing policy is unchanged: no lead routes without consent, active country/product, authorized active broker, valid license, quota/capacity and auditable decision.
- **AI control**: Pass. No AI capability or model call is added. Existing AI flags remain fail-closed and no advanced AI module is activated.
- **UX and content safety**: Pass. No public wording changes. Existing indicative offer/quote language and forbidden phrase guardrails remain applicable.
- **Testing discipline**: Pass. The plan requires repository, service, HTTP, consent, RBAC, tenant, flags, audit, migration, guardrail and contract tests.
- **Async and reliability**: Pass. Repositories become async; notifications and jobs remain asynchronous through existing Redis/BullMQ abstractions.
- **Continuous workflow safety**: Pass with stop condition. This command stops at plan artifacts per user request; no `tasks.md` and no implementation are generated.

## Project Structure

### Documentation (this feature)

```text
specs/010-prisma-domain-persistence/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    prisma-domain-persistence-contract.md
  checklists/
    requirements.md
```

`tasks.md` is intentionally not generated in this request.

### Source Code (repository root)

```text
apps/
  public/                         # unchanged, Web Publique Client
  broker/                         # unchanged unless API compatibility requires it
  admin/                          # unchanged unless API compatibility requires it
backend/
  src/
    modules/
      common/
        prisma/prisma.service.ts
        repositories/runtime-repository.ts
      audit-logs/
        audit-log-repository.ts
      feature-flags/
        feature-flag-repository.ts
      countries/
        countries.repository.ts
      products/
        products.repository.ts
      offers/
        offers.repository.ts
      prospects/
        prospects.repository.ts
      consent/
        consent-records.repository.ts
      quote-requests/
        quote-requests.repository.ts
      leads/
        lead-assignments.repository.ts
        routing-decisions.repository.ts
        crm-activity.repository.ts
      partners/
        partners.repository.ts
      partner-licenses/
        partner-licenses.repository.ts
      notifications/
        notifications.repository.ts
      http-wiring/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/
    unit/
    integration/
    contract/
    guardrails/
packages/
  shared/
```

**Structure Decision**: Keep the existing NestJS modular monolith. Add Prisma
classes next to the existing domain repository ports or in adjacent
`*.prisma-repository.ts` files owned by the same module. Keep memory adapters
where they are only until tests can import them explicitly; do not bind them in
runtime-normal modules. Do not create a new backend app or merge frontend app
responsibilities.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Keep domain-owned ports from 009; convert method signatures to async
  incrementally, with services/controllers awaiting them.
- Create only complete Prisma repositories. If a port method cannot be
  implemented safely, refine the port or defer the repository binding rather
  than ship a partial Prisma adapter.
- Reuse current Prisma models first. Current schema covers all priority domain
  tables; migrations are expected only for proven gaps such as missing indexes,
  constraints or fields needed by existing behavior.
- Keep business decisions in services/policies; repositories own durable
  persistence, mapping and safe public/tenant query scopes.
- Use transactional quote persistence for `Prospect`, `ConsentRecord`,
  `QuoteRequest`, optional `RoutingDecision`, optional `LeadAssignment` and
  notification trace references when part of one compliance-sensitive flow.
- Preserve HTTP contracts and route ownership; repository conversion must be
  invisible to public, Starter, CRM and touched admin API consumers.
- Maintain rollback by vertical slice and keep memory test adapters available
  only in test modules.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): Prisma model coverage, repository method
  mappings, state transitions and validation rules.
- [contracts/prisma-domain-persistence-contract.md](./contracts/prisma-domain-persistence-contract.md):
  repository runtime contract, async method expectations, guardrails,
  non-regression and rollback obligations.
- [quickstart.md](./quickstart.md): no-implementation guard, future local
  validation commands, migration/seed checks and smoke list.
- `AGENTS.md`: current plan reference updated to this plan.

## Technical Plan

### 1. Inventory Current Ports And Runtime Bindings

- Freeze the priority repository list from spec 010:
  Countries, Products, Offers, Prospects, ConsentRecords, QuoteRequests,
  LeadAssignments, RoutingDecisions, Partners, PartnerLicenses, CRMActivity and
  Notifications.
- Inventory every method on existing ports under
  `backend/src/modules/*/*.repository.ts`, including return types currently
  synchronous.
- Record every service/controller consuming those ports and every call path
  that becomes async.
- Confirm `AuditLogRepository` and `FeatureFlagRepository` remain
  Prisma-runtime and align their metadata with `RuntimeRepository` guardrails.
- Identify remaining runtime facade or memory-seeded paths in
  `http-wiring`/`AssurMatchRuntime` that must be removed from extracted
  domains during implementation.

### 2. Repository Contract Hardening

- Convert priority repository ports to async contracts:
  `T` becomes `Promise<T>`, `T[]` becomes `Promise<T[]>`, and `undefined`
  results become `Promise<T | undefined>`.
- Add explicit runtime metadata to every implementation:
  `mode = "prisma-runtime"` or `mode = "memory-test"`.
- Add a guard that can validate a map of resolved repositories at module
  bootstrap or provider-factory time.
- Add tests that fail if a priority Prisma repository contains methods that
  throw TODO, non-implemented errors or the exact transition message
  "requires async Prisma service integration".
- Keep memory adapters explicit, named `Memory...Repository` or
  `...TestRepository`, and importable by unit tests only.

### 3. Prisma Repository Implementation Slices

#### Catalog Slice

- Implement `PrismaCountriesRepository` over `Country`.
- Implement `PrismaProductsRepository` over `Product` and `CountryProduct`.
- Implement `PrismaOffersRepository` over `Offer` and `OfferHistory`.
- Preserve public filters:
  country public/waitlist/quote/comparison flags, product public/quote/
  comparison flags, offer status, validation status, valid date window and
  sponsor metadata.
- Refactor catalog services and controllers to await async reads while
  preserving `GET /countries`, product and offer routes.

#### Quote Intake Slice

- Implement `PrismaConsentRecordsRepository` over `ConsentText` and
  `ConsentRecord`.
- Implement `PrismaProspectsRepository` over `Prospect`.
- Implement `PrismaQuoteRequestsRepository` over `QuoteRequest`.
- Add transaction support through `PrismaService` for consented quote
  submission.
- Preserve no-consent behavior: no lead assignment, no broker notification and
  no non-compliant durable state.
- Keep duplicate, spam, manual-review and refusal states mapped to existing
  enums.

#### Routing, Partners And Leads Slice

- Implement `PrismaPartnersRepository` over `PartnerTenant`,
  `PartnerCountryAuthorization` and `PartnerProductAuthorization`.
- Implement `PrismaPartnerLicensesRepository` over `PartnerLicense`.
- Implement `PrismaRoutingDecisionsRepository` over `RoutingDecision`.
- Implement `PrismaLeadAssignmentsRepository` over `LeadAssignment` and
  `LeadActionHistory`.
- Keep routing decisions in routing services; repositories expose eligibility
  data, active counts and durable writes.
- Ensure all broker-facing reads are tenant-scoped by method contract.

#### Starter And CRM Slice

- Rewire Starter services to read lead list/detail/history/actions from
  `LeadAssignmentsRepository`.
- Implement `PrismaCrmActivityRepository` over `BrokerCrmLeadState`,
  `BrokerCrmPipelineHistory`, `BrokerCrmNote`, `BrokerCrmTask`,
  `BrokerCrmReminder`, `BrokerCrmDocument`, `BrokerCrmProposal` and
  `BrokerCrmDispute`.
- Keep CRM plan/flag/RBAC/read-only checks in service/policy layers before
  repository mutation.
- Preserve Starter exclusion from CRM and fail-closed `broker_crm_enabled`.

#### Notifications Slice

- Implement `PrismaNotificationsRepository` over `Notification` and, where the
  existing service records job traces, `QueueJobRecord`.
- Persist notification traces and delivery status without making delivery
  synchronous.
- Store payload references and correlation data only, not raw PII payloads.

### 4. Prisma Schema And Migrations

Current `backend/prisma/schema.prisma` already includes the required priority
models:

- `Country`, `Product`, `CountryProduct`, `Offer`, `OfferHistory`
- `ConsentText`, `ConsentRecord`, `Prospect`, `QuoteRequest`
- `PartnerTenant`, `PartnerCountryAuthorization`,
  `PartnerProductAuthorization`, `PartnerLicense`
- `RoutingDecision`, `LeadAssignment`, `LeadActionHistory`
- `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`, `BrokerCrmNote`,
  `BrokerCrmTask`, `BrokerCrmReminder`, `BrokerCrmDocument`,
  `BrokerCrmProposal`, `BrokerCrmDispute`
- `Notification`, `QueueJobRecord`, `AuditLog`, `FeatureFlag`,
  `FeatureFlagHistory`

Initial expectation: no model-adding migration is required. During
implementation, verify:

- indexes for public catalog reads by country/product/status/validity;
- indexes for quote public reference and status/routing queries;
- tenant/status/date indexes for Starter and CRM lists;
- license status/expiration/country/product eligibility query support;
- notification/job lookup patterns used by existing admin and delivery tests;
- relation needs for transaction ergonomics.

If a migration is required, it must be limited to already-specified behavior,
preserve fresh database reconstruction, keep sensitive defaults closed and be
covered by migration/schema tests.

### 5. Seeds And Fixtures

- Keep runtime seeds minimal: closed sensitive flags, system roles/permissions
  and baseline reference data only when already expected.
- Create or update test fixture helpers for:
  active public country, active product, country-product link, valid public
  offer, published consent text, eligible partner, valid license, feature flags,
  authenticated broker/admin users, quote submission, no-consent refusal,
  routing success/refusal, Starter lead and CRM activity.
- Separate fixture activation from runtime defaults. Tests may enable safe
  existing flags for the scenario; runtime seeds must not enable payment,
  subscription, policy issuance, attestation, e-signature, claims, insurer API
  or advanced AI.

### 6. Services And Controllers

- Adapt service constructors to receive repository ports bound to Prisma
  implementations in runtime modules.
- Propagate async through services and controllers only where needed.
  Controllers remain thin and response shapes remain stable.
- Keep business rules in services/policies:
  consent policy, publication policy, lead routing eligibility, partner/license
  checks, RBAC, plan checks, fail-closed flags and audit orchestration.
- Add durable audit around sensitive refusals and mutations that become
  repository-backed.
- Do not expose Prisma model shape directly in API responses; keep existing DTO
  and shared contract mappers.

### 7. Guardrails

- Runtime guard: fail outside test if a priority repository resolves to
  `memory-test`.
- Completeness guard: fail if a priority Prisma repository contains transition
  throws or TODO/non-implemented methods.
- Source guard: fail if extracted domains reintroduce arrays/maps as primary
  runtime state outside test adapters.
- Feature flag guard: sensitive absent/invalid/unreadable flags fail closed.
- Schema guard: `prisma validate`, migration tests and fresh database
  reconstruction must pass.
- HTTP guard: route inventory and contract tests prove paths/response shapes do
  not drift.

### 8. Non-Regression HTTP Strategy

Preserve route families already covered by specs 002-004 and 008:

- public catalog: `GET /countries`,
  `GET /countries/:countryCode/products`,
  `GET /countries/:countryCode/products/:productKey/offers`;
- public quote: `POST /quote-requests` and existing quote status/form routes;
- broker Starter: dashboard, leads, detail, history, actions, notifications,
  capabilities and export when already exposed;
- broker CRM: list, kanban/detail, status, notes, tasks, reminders, documents,
  proposals, disputes and notifications when already exposed;
- touched admin/support: audit logs, feature flags, countries, products,
  offers, partners, licenses, consent, quote requests, lead assignments,
  notifications and routing precheck.

Tests must seed PostgreSQL explicitly and verify returned data changes when
the durable fixture changes, proving the route is not reading memory state.

### 9. Rollback Strategy

- Implement one vertical slice at a time and keep each slice behind repository
  provider binding changes that can be reverted independently.
- Do not delete memory adapters; keep them test-only for unit isolation.
- If a Prisma slice fails validation, revert that slice's provider binding and
  service async conversion before proceeding to the next slice.
- If a migration is introduced and fails reconstruction, revert the migration
  before shipping the slice; do not compensate by using memory fallback.
- If a route contract drifts, restore the mapper/DTO contract rather than
  changing the frontend or public API.
- If durable audit cannot be preserved for a sensitive action, block the slice
  and keep the previous accepted behavior until audit is restored.

## Recommended Implementation Order

1. Inventory ports, service consumers, route consumers and current memory
   bindings.
2. Harden repository metadata, async contracts and guardrails.
3. Align existing `AuditLogRepository` and `FeatureFlagRepository` with common
   runtime checks without changing behavior.
4. Convert catalog repositories and public catalog services/controllers.
5. Convert consent, prospects and quote requests, including transactional quote
   submission.
6. Convert partners, partner licenses, routing decisions and lead assignments.
7. Rewire Starter lead reads/actions/history to Prisma-backed repositories.
8. Convert CRM activity/state/history repositories and CRM services.
9. Convert notification trace repository and queue job trace persistence.
10. Remove extracted domains from runtime memory/facade ownership and document
    residuals.
11. Validate migrations, seeds, HTTP contracts, guardrails, typecheck, lint,
    tests, build and web smoke where applicable.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Repository providers | Priority tokens resolve `prisma-runtime` outside test |
| Completeness | No priority Prisma method throws TODO/non-implemented/transition errors |
| Memory adapters | Memory adapters work in tests and fail outside test |
| Catalog | Public country/product/offer routes read seeded PostgreSQL data |
| Quote intake | Consented quote persists Prospect, ConsentRecord, QuoteRequest and eligible assignment |
| No consent | No assignment, no broker notification and no non-compliant persistence |
| Routing | Consent, country/product, offer, partner status, authorization, license and quota blockers remain enforced |
| Starter | Lead list/detail/actions/history are tenant-scoped and Prisma-backed |
| CRM | Plan/flag/RBAC/read-only/tenant checks protect Prisma-backed CRM activity |
| Notifications | Notification/job traces persist durably without synchronous delivery coupling |
| Audit | Sensitive success/refusal events persist durably |
| Feature flags | Persistent flags remain source of truth; sensitive flags fail closed |
| Prisma | `prisma validate`, migrations and fresh database reconstruction pass |
| HTTP contracts | Public, Starter, CRM and touched admin routes keep paths and response shapes |
| Frontend separation | No public route loads back-office state; no back-office route is public |
| Exclusions | No payment, subscription, issuance, attestation, e-signature, claims, advanced AI or insurer API activation |

## Risks

- Existing ports are synchronous; converting them async can cascade through
  services, controllers and tests.
- Some 009 ports may be too narrow for efficient Prisma queries; expanding them
  must not change business behavior.
- Prisma mappings for `Json`, `Decimal`, `Date`, enums and PII fields can
  accidentally alter API response shapes.
- Quote transaction boundaries can leave partial state if not carefully
  designed.
- Tenant filters can be duplicated or missed when split between services and
  repository methods.
- Existing tests may rely on memory seed order and need durable fixtures.
- Notification trace persistence can be confused with delivery execution,
  risking slow public endpoints.
- New migrations might be tempting for convenience; they must remain limited to
  already-specified behavior.
- Runtime memory fallback failures can expose local config gaps, which is
  desired but may require quickstart documentation.

## Complexity Tracking

No constitutional violations or exceptions are planned.

## Post-Design Constitution Re-Check

- **Technical platform role**: Pass. Design artifacts describe persistence
  hardening only and keep prohibited regulated capabilities out of scope.
- **Regulatory and consent**: Pass. Consent-first quote flow, no-consent
  blocker, partner license controls and durable audit are central requirements.
- **Feature flags and activation**: Pass. Existing persistent flags remain
  source of truth and sensitive flags fail closed.
- **Frontend application separation**: Pass. Backend API remains primary; no
  frontend route/layout/auth mixing is planned.
- **Security and RBAC**: Pass. Tenant, plan, role, MFA/read-only and PII-safe
  behavior remain required in services/controllers and tests.
- **Data and auditability**: Pass. Critical records move to durable Prisma
  repositories with timestamps, retention and histories already modeled.
- **Routing integrity**: Pass. Routing blockers are preserved and decisions are
  persisted.
- **AI control**: Pass. No AI activation or new model call is introduced.
- **UX and content safety**: Pass. No new public content or prohibited wording.
- **Testing discipline**: Pass. Repository, HTTP, guardrail, migration, audit,
  flags, RBAC, tenant and consent tests are required.
- **Async and reliability**: Pass. Async repositories are introduced while
  keeping notification delivery/job processing asynchronous.
- **Continuous workflow safety**: Pass with stop condition. Planning stops here
  per user request; no `tasks.md` or implementation is generated.
