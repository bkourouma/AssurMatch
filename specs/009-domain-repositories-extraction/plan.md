# Implementation Plan: Domain Repositories Extraction AssurMatch

**Branch**: `009-domain-repositories-extraction` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-domain-repositories-extraction/spec.md`

**Continuous Workflow Eligibility**: Eligible after this plan is accepted. The
user stated that spec 009 is created and validated, and the committed spec has
no clarification markers. This invocation must stop after planning because the
user explicitly requested no `tasks.md` and no implementation. Future
`/speckit.tasks` or `/speckit.implement` may proceed only if no constitutional,
security, data leakage, migration, product-decision or blocking validation risk
appears. Do not auto-commit unless the user asks.

## Summary

Extract the critical AssurMatch domain repositories out of `AssurMatchRuntime`
and memory-backed services into real NestJS provider bindings. Runtime-normal
domain state will use Prisma repositories injected through domain modules;
memory repositories remain explicit test-only adapters. The plan preserves
existing public, Starter broker, CRM, routing, audit and feature flag behavior,
adds no business capability, and keeps public and back-office web applications
separate.

The implementation strategy is progressive: first introduce common repository
contracts and runtime guardrails, then move catalog, quote submission,
consent/prospect, lead assignment/routing, partner/license, CRM activity,
notifications, feature flags and audit bindings behind injectable repositories.
`AssurMatchRuntime` may remain as a temporary orchestrator for unmigrated
surfaces, but it must no longer own the primary state for extracted domains.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Redis client 5.12.1; BullMQ 5.76.2; Next.js 16.2.4; React 19.2.5.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@prisma/client`, `prisma`, `redis`, `bullmq`, `zod`, `vitest`, `@playwright/test`, existing shared contracts in `packages/shared`.
**Storage**: PostgreSQL via Prisma remains the source of truth for critical data. Redis remains cache/runtime infrastructure for feature flag cache, rate limiting, anti-spam, duplicate detection, locks and BullMQ. No new storage is introduced.
**Testing**: Vitest unit/integration/contract/guardrail suites. Existing scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:guardrails`, `npm run test:web`, `npm run validate`.
**Target Platform**: SaaS B2B2C regulated insurance marketplace with two separated web applications, one Backend API and shared packages.
**Impacted Application(s)**: Backend API is primary. Shared packages may be touched for existing contracts, DTOs, validation types and test helpers. Web Publique Client and Back-office Partenaires/Plateforme are not feature scopes; they may only receive minor compatibility adjustments if an existing contract requires it.
**Project Type**: Regulated marketplace backend architecture hardening and repository extraction.
**Performance Goals**: Public catalog reads and quote submission remain within existing local SLO expectations from spec 008: public reads stay responsive, valid quote submission returns after durable state and does not wait for notification delivery, broker/admin lists are bounded or paginated, and no heavy public synchronous work is introduced.
**Constraints**: No new business features; no new frontend screens; no payment, subscription, premium collection, policy issuance, attestation, e-signature, claims, advanced AI, advanced insurer API, advanced webhooks, white label, complete billing or total backend rewrite. Preserve existing HTTP paths and frontend contracts unless a compatibility-safe correction is justified. Preserve public/back-office application separation. Keep sensitive flags closed by default. Keep memory adapters test-only.
**Scale/Scope**: Existing domains from specs 001-008: public catalog, quote requests, prospects, consent, routing, lead assignments, Starter portal, Broker CRM, partners, licenses, users/RBAC/MFA, feature flags, audit logs, notifications, queues and health.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The plan extracts persistence and provider boundaries only; it does not introduce sale, subscription, premium collection, policy issuance, attestation, claims, payments, e-signature, insurer API, binding advice or regulated activation.
- **Regulatory and consent**: Pass. `ConsentRecord` remains mandatory before transmission, consent evidence becomes durable through `ConsentRecordsRepository`, and no-consent paths remain no-routing/no-notification with durable refusal audit.
- **Feature flags and activation**: Pass. Persistent feature flags remain the source of truth. Sensitive flags including `broker_crm_enabled`, payments, e-signature, policy issuance, claims, insurer API and AI-sensitive flags remain false when absent, invalid or illisible.
- **Frontend application separation**: Pass. Backend API and shared packages are the only planned scopes. Public and back-office apps remain separate; any compatibility adjustment must not cross-import auth, routes, layouts, privileges or clients between apps.
- **Security and RBAC**: Pass. Broker/admin repository reads remain tenant-scoped and service/controller layers preserve auth, RBAC, MFA where applicable, read-only denial, export limits and PII-safe errors.
- **Data and auditability**: Pass. PostgreSQL/Prisma repositories become the source of truth for countries, products, offers, prospects, quote requests, consent records, lead assignments, routing decisions, CRM activity, notifications, feature flags and audit logs. Created/updated/history/retention fields already modeled are preserved.
- **Routing integrity**: Pass. Existing routing rules are preserved: no consentless transmission, no disabled country/product, no expired or unvalidated offer, no inactive/unauthorized/expired-license broker, no quota/capacity bypass and no cross-tenant exposure.
- **AI control**: Pass. No new AI behavior or model call is introduced. Existing AI-related models and flags remain disabled/fail-closed unless already explicitly enabled by existing behavior.
- **UX and content safety**: Pass. No new public UI or wording is introduced. Existing public contracts must continue to describe offers/prices as indicative and avoid prohibited sales/subscription language.
- **Testing discipline**: Pass. The plan requires repository unit/integration tests, memory-adapter guardrails, HTTP non-regression, RBAC/tenant, no-consent, expired-license, disabled-country/product, routing, audit, feature flag and fresh database reconstruction coverage.
- **Async and reliability**: Pass. Redis/BullMQ continue to handle rate limiting, anti-spam, duplicate detection, locks, queues and notifications. Public endpoints still return after durable state, not after notification delivery.
- **Continuous workflow safety**: Pass with stop condition. Spec 009 is validated and committed, but this request explicitly stops after plan artifacts; no `tasks.md` or implementation is generated.

## Project Structure

### Documentation (this feature)

```text
specs/009-domain-repositories-extraction/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    repository-extraction-contract.md
  checklists/
    requirements.md
```

`tasks.md` is intentionally not generated in this request.

### Source Code (repository root)

```text
backend/
  src/
    app.module.ts
    runtime/
      assurmatch-runtime.ts             # transition orchestrator only after extraction
      runtime-http.controller.ts        # legacy facade for unmigrated routes only
    modules/
      common/
        prisma/
          prisma.service.ts
        repositories/
          runtime-repository.ts
          repository-provider.guard.ts  # planned guard/helper for runtime bindings
      audit-logs/
        audit-log-repository.ts
      feature-flags/
        feature-flag-repository.ts
      countries/
      products/
      offers/
      quote-forms/
      quote-requests/
      prospects/
      consent/
      leads/
      routing/
      partners/
      partner-licenses/
      notifications/
      auth/
      users/
      admin/
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
    contracts/
    rbac/
    validation/
apps/
  public/                              # unchanged unless existing contract compatibility requires it
  broker/                              # unchanged unless existing contract compatibility requires it
  admin/                               # unchanged unless existing contract compatibility requires it
```

**Structure Decision**: Keep the existing NestJS modular monolith. Place
repository interfaces, tokens and providers inside their owning domain modules,
with common repository mode/guard helpers under `backend/src/modules/common`.
Do not create a new backend application. Do not move frontend app boundaries.
Use `packages/shared` only for existing public DTOs/contracts/validation types,
not for backend-only repository interfaces unless a shared test or contract
requires it.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use domain-owned repository ports/tokens and Prisma implementations bound in
  Nest modules; avoid a generic catch-all repository abstraction.
- Keep memory implementations as explicit test adapters that declare
  `mode = "memory-test"` and are rejected by runtime-normal guardrails.
- Reuse existing Prisma models first. New migrations are allowed only for data
  already promised by specs 001-008 and missing from schema.
- Extract in vertical slices that preserve HTTP behavior: catalog, quote
  submission, lead/routing, broker Starter, broker CRM, notifications, then
  remaining runtime facade cleanup.
- Preserve service-level business decisions; repositories own persistence
  queries/mutations and safe scope filtering, not new routing/publication rules.
- Treat `AssurMatchRuntime` as a transition adapter with an explicit residual
  inventory rather than deleting it in one step.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): repository ports, provider bindings,
  domain entity mappings, state transitions and guard rules.
- [contracts/repository-extraction-contract.md](./contracts/repository-extraction-contract.md):
  repository interface expectations, provider tokens, method families,
  memory-test adapter contract and HTTP non-regression obligations.
- [quickstart.md](./quickstart.md): local validation commands, no-tasks/no-code
  guard, repository test strategy, migration validation and runtime smoke steps.
- `AGENTS.md`: current plan reference updated to this plan.

## Technical Plan

### 1. Repository Foundation

- Define a common repository mode contract under `modules/common/repositories`:
  `RuntimeRepositoryMode = "prisma-runtime" | "memory-test"` and a guard that
  fails outside `NODE_ENV=test` when a domain repository resolves to
  `memory-test`.
- Keep or extend `assertRuntimeRepository` so it can validate both individual
  repositories and module-level provider maps.
- Define stable provider tokens per domain, preferably symbol or exported const
  tokens local to each module, such as `COUNTRIES_REPOSITORY`,
  `PRODUCTS_REPOSITORY`, `OFFERS_REPOSITORY`,
  `QUOTE_REQUESTS_REPOSITORY`, `PROSPECTS_REPOSITORY`,
  `CONSENT_RECORDS_REPOSITORY`, `LEAD_ASSIGNMENTS_REPOSITORY`,
  `PARTNERS_REPOSITORY`, `PARTNER_LICENSES_REPOSITORY`,
  `CRM_ACTIVITY_REPOSITORY`, `NOTIFICATIONS_REPOSITORY`,
  `ROUTING_DECISIONS_REPOSITORY`.
- Keep `FeatureFlagsRepository` and `AuditLogRepository` as existing ports, but
  align their provider binding and runtime guard with the new repository mode
  pattern.
- Keep repository ports domain-specific. Avoid a generic CRUD base repository
  because tenant scope, consent, public filtering, retention and routing
  constraints differ by domain.

### 2. Prisma Runtime Implementations

- Implement or finalize `Prisma...Repository` classes for the priority domains:
  countries, products, offers, prospects, quote requests, consent records, lead
  assignments, partners, partner licenses and CRM activity.
- Implement Prisma repositories for routing decisions and notifications where
  current services write/read data already modeled by `RoutingDecision`,
  `Notification` and `QueueJobRecord`.
- Use existing Prisma models first:
  `Country`, `Product`, `CountryProduct`, `Offer`, `OfferHistory`,
  `Prospect`, `ConsentText`, `ConsentRecord`, `QuoteRequest`,
  `LeadAssignment`, `LeadActionHistory`, `BrokerCrmLeadState`,
  `BrokerCrmPipelineHistory`, `BrokerCrmNote`, `BrokerCrmTask`,
  `BrokerCrmReminder`, `BrokerCrmDocument`, `BrokerCrmProposal`,
  `BrokerCrmDispute`, `PartnerTenant`, `PartnerCountryAuthorization`,
  `PartnerProductAuthorization`, `PartnerLicense`, `RoutingDecision`,
  `Notification`, `QueueJobRecord`, `FeatureFlag`, `FeatureFlagHistory` and
  `AuditLog`.
- Inject `PrismaService` into each Prisma repository through Nest providers.
  No repository should create its own Prisma client.
- Use `PrismaService.transaction(...)` or direct Prisma transactions for
  multi-entity quote submission: Prospect, ConsentRecord, QuoteRequest and
  initial routing/assignment decision when applicable.
- Preserve current enum semantics. Do not add statuses unless a missing status
  blocks persistence of behavior already accepted by previous specs.
- Keep Decimal/Date/Json mapping inside repository mappers so services continue
  using current domain DTO/record types.

### 3. Memory Test Adapters

- Add `Memory...Repository` or `...TestRepository` classes only under test
  helpers or clearly named test modules, except where current source already
  exposes memory adapters that need to be migrated gradually.
- Every memory repository must expose `mode = "memory-test"` and have no
  provider binding in runtime-normal modules.
- Unit tests can instantiate services with memory adapters directly or through
  a `TestRepositoryModule`.
- Integration/runtime tests must bind Prisma repositories unless the test name
  explicitly verifies memory adapter behavior.
- Add a guardrail test that scans extracted domain modules for new arrays/maps
  used as runtime state and fails with a domain-specific message.

### 4. NestJS Provider Wiring

- Convert domain modules from plain TypeScript composition classes to Nest
  provider modules where needed, following the spec 008 module graph direction.
- Domain modules should declare:
  repository token -> Prisma implementation,
  service providers that consume repository tokens,
  existing decorated controllers,
  exports needed by neighboring modules.
- Keep manual instantiation only inside explicit test helpers or transition
  code documented under `AssurMatchRuntime` residuals.
- AppModule should import real domain modules. `RuntimeHttpWiringModule` and
  `AssurMatchRuntime` remain only for routes/services not yet migrated.
- Avoid dependency cycles by splitting provider ownership:
  catalog owns catalog repositories; quote requests orchestrates quote flow;
  leads/routing owns routing and assignments; partners/licenses own eligibility
  reads; audit and feature flags are infrastructure/domain support modules.

### 5. Domain Service Refactors

- `CountriesService`: replace `private countries: Country[]` with
  `CountriesRepository`. Public list/detail and admin create/update read/write
  through the repository and keep audit in the service layer.
- `ProductsService`: replace `private products: Product[]` and countryIds
  mutation with repository methods over `Product` and `CountryProduct`.
- `OffersModule`, `OfferAdminService`, `PublicOfferCatalogService`: replace
  shared `offers`/`history` arrays with `OffersRepository`, keeping
  publication/validity decisions in policy/service code.
- `ProspectsService`: replace `private prospects` with `ProspectsRepository`
  and keep identity normalization in `ProspectIdentityService`.
- `ConsentService`: split consent text and record persistence into
  repositories, with `ConsentRecordsRepository` as required P1 and consent text
  reads maintained for quote forms.
- `QuoteSubmissionService`: replace `private requests` with
  `QuoteRequestsRepository`, use injected repositories for prospect/consent,
  and keep validation, duplicate/rate-limit/anti-spam/routing orchestration in
  service code.
- `LeadAssignmentService`: replace `private assignments` with
  `LeadAssignmentsRepository`; active count, list/detail and status updates use
  tenant-aware repository methods.
- `RoutingDecisionService`: replace `private decisions` with
  `RoutingDecisionsRepository` and preserve current refusal/success reasons.
- `BrokerStarterHistoryService` and `BrokerCrmHistoryService`: move history to
  `LeadActionHistory` and `BrokerCrmPipelineHistory` repositories where already
  modeled.
- `BrokerCrmActivityService`: replace notes/tasks/reminders/documents/proposals
  /disputes arrays with `CRMActivityRepository`.
- `PartnersService` and `PartnerLicensesService`: replace partner/license and
  authorization memory state with `PartnersRepository` and
  `PartnerLicensesRepository`.
- `NotificationsService` and quote notification services: persist notification
  and queue job traces via `NotificationsRepository` while BullMQ/InMemoryQueue
  remains the queue abstraction.
- `FeatureFlagsService` and `AuditLogWriter`: align existing repository ports
  with Nest provider injection and remove default memory fallback from
  runtime-normal paths.

### 6. AssurMatchRuntime Reduction

- Add a documented residual inventory for `AssurMatchRuntime` in code comments
  or a small markdown section under the feature docs during implementation:
  remaining responsibilities, why they remain, route/domain owner and exit
  criterion.
- Remove direct `new CountriesModule`, `new ProductsModule`, `new OffersModule`,
  `new ConsentModule`, `new ProspectsModule`, `new LeadsModule`,
  `new PartnersModule`, `new PartnerLicensesModule`,
  `new NotificationsModule`, `new FeatureFlagsModule`,
  `new AuditLogsModule` for extracted domains from runtime-normal paths.
- During transition, `AssurMatchRuntime` may delegate to Nest-resolved providers
  or adapter services, but it must not create the extracted domain state
  itself.
- Guardrail tests should fail if extracted domains reintroduce arrays/maps as
  source-of-truth fields in runtime-normal source files.
- Keep `RuntimeHttpController`/`RuntimeHttpWiringModule` compatibility only for
  route ownership still accepted by spec 008 transition, and list what remains.

### 7. Prisma And Migrations

- Current `backend/prisma/schema.prisma` already includes the priority models
  for catalog, quote flow, consent, routing, leads, partners, licenses, CRM,
  notifications, feature flags and audit.
- Plan for no initial schema migration unless implementation uncovers a
  missing field needed for already-specified behavior. Candidate gaps to verify
  before implementation: direct relations vs id fields, indexes for public
  catalog reads, indexes for publicReference/status, tenant-scoped CRM queries,
  and fields needed to reconstruct current in-memory helper data.
- If a migration is required, it must:
  preserve fresh database reconstruction,
  use defaults that keep sensitive modules disabled,
  avoid new product/business capability,
  update seed/test fixtures separately from runtime defaults.
- Keep Prisma seed limited to baseline operational/reference data and test
  fixtures. Do not seed CRM, AI, payments, e-signature, policy issuance, claims
  or insurer API as enabled by default.

### 8. Seed And Fixture Strategy

- Separate runtime seed from test fixtures. Runtime seed may include closed
  default flags, system roles/permissions and minimal reference data if already
  expected by prior specs.
- Test fixtures should create explicit active country/product/offer,
  published consent text, eligible partner/license, feature flags and actors
  needed for repository/HTTP non-regression.
- Provide fixture helpers for:
  public catalog seed,
  consented quote request seed,
  no-consent refusal seed,
  eligible routing seed,
  expired-license routing blocker seed,
  Starter lead assignment seed,
  CRM lead/activity seed,
  cross-tenant denial seed.
- Seeds must keep regulated/sensitive flags false unless the individual test
  deliberately enables a safe already-modeled feature such as CRM access for a
  Pro broker.

### 9. HTTP And Contract Non-Regression

- Existing HTTP routes must remain stable:
  `GET /countries`, country-scoped product reads, offer reads, quote form/status
  if already exposed, `POST /quote-requests`, Starter dashboard/leads/detail/
  history/actions/notifications/capabilities, CRM dashboard/list/kanban/detail/
  activity/notifications and admin support routes touched by repositories.
- Add or extend HTTP tests that prove route responses come from seeded
  repositories rather than in-memory runtime setup.
- Preserve response shapes unless a mismatch with an existing shared contract
  is documented and fixed compatibly.
- Keep public errors non-sensitive. Broker/admin errors must not reveal
  cross-tenant resource existence.
- Keep contract/OpenAPI tests focused on existing routes and absence of
  forbidden regulated endpoints.

### 10. Test Plan

- Unit tests for every repository interface and memory test adapter behavior.
- Integration tests for each Prisma repository using isolated test database
  setup or Prisma test harness.
- Service tests for catalog, quote submission, consent, prospects, lead
  assignments, routing, Starter, CRM, notifications, feature flags and audit
  with repository injection.
- Guardrail tests:
  memory repositories forbidden outside test,
  no new arrays/maps as source of truth in extracted domains,
  `AssurMatchRuntime` residual inventory maintained,
  sensitive flags fail closed.
- HTTP non-regression tests:
  public catalog,
  consented quote creation,
  no-consent refusal,
  Starter leads,
  CRM leads with plan/flag checks,
  cross-tenant denial,
  admin audit/flags when touched.
- Data tests:
  fresh database reconstruction,
  migrations,
  Prisma client generation,
  seed safety.
- Final implementation validation:
  `npm run typecheck`,
  `npm run lint`,
  `npm run test:unit`,
  `npm run test:integration`,
  `npm run test:contract`,
  `npm run test:guardrails`,
  `npm run build`,
  and `npm run validate` when runtime dependencies are available.

## Progressive Implementation Strategy

1. **Inventory and guardrails**: freeze extracted domain list, current memory
   fields, existing repository ports and routes that must not regress.
2. **Common repository boundary**: implement tokens/mode/guard helpers and
   align FeatureFlags/AuditLog repositories first.
3. **Catalog slice**: Countries, Products, Offers repositories, services and
   public HTTP non-regression.
4. **Quote creation slice**: Prospects, ConsentRecords, QuoteRequests and quote
   transaction, including no-consent and disabled country/product tests.
5. **Routing and assignments slice**: Partners, PartnerLicenses,
   RoutingDecisions, LeadAssignments and routing blocker/success tests.
6. **Starter slice**: Starter list/detail/history/actions/notifications from
   durable repositories with tenant/read-only checks.
7. **CRM slice**: CRM state/activity/history repositories with plan/flag/tenant
   checks and Starter denial.
8. **Notifications slice**: Notification and queue job trace persistence while
   preserving BullMQ/InMemoryQueue queue abstraction rules.
9. **AssurMatchRuntime cleanup**: remove extracted domain state and document
   remaining residuals.
10. **Regression pass**: run repository, service, HTTP, guardrail, migration,
   typecheck, lint and build validations.

## Recommended Implementation Order

1. Add repository provider tokens and common runtime repository guard.
2. Align `AuditLogRepository` and `FeatureFlagRepository` with Nest provider
   injection and runtime guard.
3. Implement catalog repositories and refactor catalog services.
4. Implement quote flow repositories and transactional quote submission.
5. Implement partner/license repositories and route eligibility reads through
   them.
6. Implement routing decision and lead assignment repositories.
7. Refactor Starter services and tests to repository-backed reads/mutations.
8. Implement CRM activity repositories and refactor CRM services.
9. Implement notifications repository for existing traces.
10. Reduce `AssurMatchRuntime` to residual orchestration and update its
    inventory.
11. Expand HTTP non-regression and guardrails.
12. Validate migrations/fresh database, typecheck, lint, build and test suites.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Repository providers | Domain tokens resolve Prisma implementations in runtime-normal modules |
| Memory adapters | Memory repositories work in tests and fail outside test/runtime-allowed mode |
| Catalog | `GET /countries`, products and offers read from repositories and enforce flags/status/validity |
| Quote submission | Prospect, ConsentRecord and QuoteRequest persist through repositories; no-consent creates no assignment |
| Routing | Consent, country/product, partner status, authorization, license and quota blockers remain enforced |
| Lead assignments | Starter and CRM lead reads use `LeadAssignmentsRepository` and tenant filters |
| CRM activity | CRM notes/tasks/reminders/documents/proposals/disputes persist through CRM repositories |
| Audit | Sensitive success/refusal events persist durably and remain admin-readable |
| Feature flags | Persistent flags remain source of truth; sensitive absent/false values fail closed |
| AssurMatchRuntime | Extracted domains no longer store primary state in facade/manual module instances |
| HTTP compatibility | Public, Starter, CRM and touched admin routes keep existing paths and response contracts |
| Prisma/migrations | Fresh database reconstruction, Prisma generation and migration tests pass |
| Frontend separation | No public/back-office route, auth or privilege mixing is introduced |
| Constitution | No direct sale/subscription/payment/policy/attestation/e-signature/claims/advanced AI activation |

## Risks

- Existing services combine business decisions with in-memory persistence; moving
  persistence may accidentally move or duplicate sensitive logic.
- Nest provider wiring can reveal dependency cycles hidden by manual
  `AssurMatchRuntime` construction.
- Tests currently seeded through runtime memory may need durable fixtures.
- Quote creation may need careful transaction boundaries to avoid partial
  Prospect/ConsentRecord/QuoteRequest persistence.
- Tenant filters can become inconsistent if split between repository and
  service without clear method contracts.
- Prisma schema appears broad enough, but relation/index gaps may emerge during
  implementation and require a carefully scoped migration.
- Runtime-normal refusal of memory fallback can expose missing local
  `DATABASE_URL` or incomplete test/runtime configuration.
- Removing too much of `AssurMatchRuntime` at once could break routes still
  owned by the spec 008 transition facade.

## Complexity Tracking

No constitutional violations or exceptions are planned.

## Post-Design Constitution Re-Check

- **Technical platform role**: Pass. Design artifacts describe repository
  extraction only and do not activate regulated business capabilities.
- **Regulatory and consent**: Pass. Consent before transmission, no-consent
  refusal and durable audit remain explicit across plan, data model, contract
  and quickstart.
- **Feature flags and activation**: Pass. Persistent flags remain source of
  truth; sensitive and regulated flags fail closed.
- **Frontend application separation**: Pass. Frontend impact is limited to
  optional compatibility fixes; public/back-office app separation is preserved.
- **Security and RBAC**: Pass. Tenant, plan, RBAC, MFA, read-only and PII-safe
  constraints remain service/controller requirements and are reinforced by
  repository method scopes.
- **Data and auditability**: Pass. Critical data moves to Prisma-backed
  repositories with history/retention fields preserved.
- **Routing integrity**: Pass. Existing blockers and durable routing decisions
  are required; no routing policy changes are introduced.
- **AI control**: Pass. No AI activation or new model call is introduced.
- **UX and content safety**: Pass. No new public wording or UI is introduced.
- **Testing discipline**: Pass. Repository, service, HTTP, guardrail, migration,
  feature flag, audit, tenant and routing tests are required.
- **Async and reliability**: Pass. Redis/BullMQ roles from 007 remain unchanged;
  no heavy public synchronous work is added.
- **Continuous workflow safety**: Pass with stop condition. Planning stops here
  per user request; no `tasks.md` or implementation is generated.
