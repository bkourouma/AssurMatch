# Implementation Plan: API HTTP Wiring AssurMatch

**Branch**: `008-api-http-wiring` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-api-http-wiring/spec.md`

**Continuous Workflow Eligibility**: Eligible after this plan is accepted. The
user stated that spec 008 is created and validated, the spec is committed, and
there are no open clarification markers. This invocation must stop after
planning because the user explicitly requested no `tasks.md` and no
implementation. Future `/speckit.tasks` or `/speckit.implement` may proceed
only if no constitutional, security, data leakage, migration, product-decision
or blocking validation risk appears. Do not auto-commit unless the user asks.

## Summary

Move AssurMatch from a RuntimeHttpController-centric HTTP surface to an
idiomatic NestJS modular API. AppModule will import real domain modules;
domains will expose decorated controllers; guards will provide a trusted
ActorContext; runtime services will depend on durable Prisma repositories,
persistent feature flags and durable audit. RuntimeHttpController remains only a
temporary facade for unmigrated endpoints while each accepted route is moved to
its domain controller and proved by HTTP e2e tests.

The plan preserves all business behavior delivered by specs 001-004 and the
runtime hardening from spec 007. It adds no business capability. Frontend work is
limited to wiring the public quote form to `POST /quote-requests`, removing
misleading silent fallbacks, and preserving strict separation between Web
Publique Client and Back-office Partenaires/Plateforme.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Redis client 5.12.1; BullMQ 5.76.2; Next.js 16.2.4; React 19.2.5.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@prisma/client`, `prisma`, `redis`, `bullmq`, `zod`, `vitest`, `@playwright/test`, existing shared contracts in `packages/shared`.
**Storage**: PostgreSQL via Prisma remains the source of truth for critical data. Redis remains cache/runtime infrastructure for flags, rate limiting, anti-spam, duplicates, locks and BullMQ. BullMQ remains the queue runtime. No new storage is introduced.
**Testing**: Vitest unit/integration/contract/guardrail suites; real Nest HTTP tests using AppModule; Playwright 1.59.1 for public and back-office smoke/e2e when URLs are configured. Existing scripts: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:guardrails`, `npm run test:web`, `npm run validate`.
**Target Platform**: SaaS B2B2C regulated insurance marketplace with two separated web applications, one Backend API and shared packages.
**Impacted Application(s)**: Multiple scopes. Backend API is primary. Web Publique Client is touched only for quote form API wiring and public error states. Back-office Partenaires/Plateforme is touched only for broker/admin client boundaries and visible protected error states. Packages shared may be touched for DTOs, schemas, contracts and test helpers.
**Project Type**: Regulated marketplace API wiring and runtime architecture hardening.
**Performance Goals**: Public catalog and quote endpoints remain responsive; 95% of local acceptance public reads stay under 2 seconds; valid quote submission returns confirmation without waiting for notification delivery; broker/admin lists are bounded or paginated; no heavy public synchronous work is introduced.
**Constraints**: No new business features; no payment, subscription, policy issuance, attestation, e-signature, claims, advanced AI, advanced insurer API, advanced webhooks, SSO/OAuth expansion, total backend rewrite or UI redesign. Maintain public/back-office application separation. Preserve existing HTTP paths unless a path is unsafe.
**Scale/Scope**: Existing domains from specs 001-007: public catalog, quote requests, prospects, consent, routing, lead assignments, Starter portal, Broker CRM, users/RBAC/MFA, feature flags, audit logs, notifications and health.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The plan rewires HTTP architecture only and does not introduce sale, subscription, premium collection, policy issuance, attestation, claims, payments, e-signature, insurer API, binding advice or regulated activation.
- **Regulatory and consent**: Pass. `POST /quote-requests` remains blocked without durable ConsentRecord, and refusal must be audited. Partner license checks remain mandatory before routing or lead exposure.
- **Feature flags and activation**: Pass. Persistent flags are the source of truth, Redis is acceleration only, and sensitive flags fail closed. `broker_crm_enabled`, payments, e-signature, policy issuance, claims, insurer API and sensitive AI flags remain false by default.
- **Frontend application separation**: Pass. Public app calls only public APIs; broker/admin apps call only authenticated broker/admin APIs. No public route may load back-office auth, routes, layouts or privileges.
- **Security and RBAC**: Pass. Broker/admin endpoints use Nest guards, trusted ActorContext, RBAC, MFA where applicable, read-only enforcement, tenant checks, PII-safe errors and rate limiting/validation for public endpoints.
- **Data and auditability**: Pass. Prisma repositories, durable AuditLog, createdAt/updatedAt/createdBy where modeled, feature flag history and correlationId propagation are required.
- **Routing integrity**: Pass. Existing routing rules are preserved: no consentless transmission, no disabled country/product, no expired or unvalidated offer, no inactive/unauthorized/expired-license broker, no cross-tenant exposure.
- **AI control**: Pass. No new AI behavior is introduced. Existing AI-sensitive flags remain closed and no model call is added.
- **UX and content safety**: Pass. Public wording remains indicative and quote-oriented; no forbidden sale/subscription wording is introduced.
- **Testing discipline**: Pass. The plan requires HTTP e2e, controller/module tests, RBAC, tenant isolation, no-consent, feature flags, durable audit, frontend separation and Playwright runtime coverage.
- **Async and reliability**: Pass. Public endpoints keep heavy work out of the synchronous path; BullMQ/Redis behavior from 007 is preserved.
- **Continuous workflow safety**: Pass with stop condition. The spec is validated and eligible for later tasks/implementation, but this request explicitly stops after plan artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/008-api-http-wiring/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    runtime-http-wiring-contract.md
  checklists/
    requirements.md
```

`tasks.md` is intentionally not generated in this request.

### Source Code (repository root)

```text
backend/
  src/
    app.module.ts
    main.ts
    runtime/
      runtime-http.controller.ts        # temporary facade only
      assurmatch-runtime.ts             # to be decomposed away from runtime route ownership
    modules/
      auth/
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
      users/
      feature-flags/
      audit-logs/
      notifications/
      documents/
      ai/
      admin/
      common/
        filters/
        guards/
        http/
        middleware/
        pagination/
        prisma/
        queues/
        redis/
        repositories/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/
    unit/
    integration/
    contract/
    guardrails/
apps/
  public/                              # Web Publique Client only
  broker/                              # Back-office broker surface
  admin/                               # Back-office platform/admin surface
packages/
  shared/
    contracts/
    rbac/
    validation/
```

**Structure Decision**: Keep the NestJS modular monolith and the existing three
frontend workspaces. Introduce domain ownership inside `backend/src/modules/*`
rather than creating a new backend application. Public and back-office concerns
remain separated by route prefixes, frontend app boundaries, auth policies and
tests. RuntimeHttpController may temporarily coexist, but AppModule becomes a
real module graph and not a single-controller shell.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use AppModule as the composition root and import existing domain modules with
  real `@Module` metadata. Do not create a second API runtime.
- Migrate endpoints by route group and protect each migration with HTTP e2e
  route ownership tests to avoid duplicate or missing routes.
- Build ActorContext once in guard/middleware/request context and expose it to
  controllers through a small backend common boundary. Simulation headers remain
  test/development-only.
- Reuse existing Zod/shared contract schemas for DTO validation and add a
  common Nest validation/mapping layer instead of letting controllers parse
  raw bodies and headers ad hoc.
- Bind Prisma repositories per domain in runtime modules and keep memory
  adapters only in explicit tests.
- Keep feature flags persisted in PostgreSQL with Redis cache acceleration and
  fail-closed sensitive defaults.
- Treat durable audit as part of sensitive action acceptance, with explicit
  handling for audit write failures.
- Replace silent frontend fallback data with explicit error states while keeping
  true empty states distinct.
- Promote runtime HTTP and Playwright tests above source-reading guardrails for
  e2e acceptance.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): request context, route ownership, repository
  bindings, durable entities, state transitions and validation rules.
- [contracts/runtime-http-wiring-contract.md](./contracts/runtime-http-wiring-contract.md):
  HTTP route ownership, auth, status mapping and frontend/API contracts.
- [quickstart.md](./quickstart.md): local validation, runtime e2e setup,
  Playwright environment and no-tasks/no-implementation guard.

## Technical Plan

### 1. AppModule And Module Graph

- Convert `backend/src/app.module.ts` into a normal `@Module` composition root
  that imports runtime domain modules rather than declaring only
  RuntimeHttpController and AssurMatchRuntime.
- Import at minimum: `ConfigModule`, common infrastructure modules
  (Prisma/Redis/Queues where locally modeled), `AuditLogsModule`,
  `FeatureFlagsModule`, `AuthModule`, `UsersModule`, `CountriesModule`,
  `ProductsModule`, `OffersModule`, `QuoteFormsModule`,
  `QuoteRequestsModule`, `ProspectsModule`, `ConsentModule`, `PartnersModule`,
  `PartnerLicensesModule`, `RoutingModule`, `LeadsModule`,
  `NotificationsModule`, `DocumentsModule`, `AiModule` and admin/health module.
- Keep `RuntimeHttpController` in AppModule only as a temporary import for route
  groups not yet migrated. It must not be the route source for accepted P1
  endpoints once they move to domain controllers.
- Ensure domain modules declare controllers/providers/repositories with Nest
  metadata. Existing classes that currently behave as plain TypeScript services
  must be promoted to injectable providers when used in runtime modules.
- Remove manual runtime instantiation gradually by moving dependency creation
  into module providers. Unit tests may still instantiate classes directly.
- Introduce route ownership tests that fail if a route is served only through
  RuntimeHttpController after its domain migration is declared complete.

### 2. Decorated Controllers

- `AuthController`: owns `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`, `POST /auth/mfa/enroll`, `POST /auth/mfa/verify`.
  It uses DTO validation, Auth guard where needed, and no manual actor header
  parsing.
- `PublicCountriesController`: owns `GET /countries` and
  `GET /countries/:countryCode`, with public feature flag checks and no
  back-office dependency.
- `PublicProductsController`: owns
  `GET /countries/:countryCode/products` and
  `GET /countries/:countryCode/products/:productKey`.
- `PublicOffersController`: owns
  `GET /countries/:countryCode/products/:productKey/offers` and
  `GET /offers/:offerId`, filtering out expired, non-validated or disabled
  offers and preserving indicative wording.
- `PublicQuoteRequestsController`: owns `POST /quote-requests` and public
  status where applicable. It validates consent, country/product/offer
  availability, anti-abuse, duplicate rules and public response shape.
- `BrokerStarterController`: owns Starter dashboard, list, detail, history,
  accept/reject/dispute, notifications and capabilities. It requires auth,
  MFA where applicable, tenant isolation and read-only mutation refusal.
- `BrokerCrmController`: owns CRM dashboard, list, kanban, detail, status,
  note, task, reminder, assign, document, proposal, dispute, notifications and
  AI foundations. It refuses Starter users and refuses all CRM when
  `broker_crm_enabled` is false or absent.
- `AdminFeatureFlagsController`: owns flag list/update with RBAC/MFA, reason,
  persistence, history, audit and cache invalidation.
- `AdminAuditLogsController`: owns durable audit read/search with RBAC/MFA,
  pagination/limits and PII minimization.
- `AdminHealthController`: owns protected health checks for database, Redis,
  BullMQ/queues, feature flag source and audit durability, without exposing
  secrets.
- Existing admin controllers remain in their modules and are corrected only as
  needed to preserve current endpoints and move away from RuntimeHttpController
  route ownership.

### 3. HTTP Validation And Error Mapping

- Centralize DTO/schema validation through a common Nest helper or pipe that
  reuses `packages/shared` Zod schemas.
- Controllers map validation errors to 400, auth absence/invalid token to 401,
  RBAC/MFA/tenant/flag/plan/read-only refusal to 403, hidden/not public resource
  to 404, conflict/duplicate/routing lock to 409, semantically invalid
  accepted-shape payloads to 422 when local conventions require it, rate limit
  to 429 and unexpected failures to 500.
- Public errors expose safe reason categories only. Broker/admin errors do not
  reveal cross-tenant resource existence.
- Keep `ErrorResponseFilter` as the common response layer and extend it only if
  needed for stable machine-readable error codes.

### 4. ActorContext, Guards, RBAC, MFA

- Define a single request actor boundary in `modules/common/http`:
  request-scoped provider, parameter decorator, or middleware-attached value.
- Auth guards verify bearer/session-derived actor and attach ActorContext once.
  Controllers consume the context; they do not reconstruct it from headers.
- Simulation headers are allowed only when `NODE_ENV=test` and
  `ASSURMATCH_ALLOW_TEST_AUTH_HEADERS=true`, or a documented development-only
  equivalent. Production/runtime-normal rejects them.
- Apply guards directly at controller or route level for all broker/admin
  endpoints. Public controllers must not require partner/admin state.
- RBAC guard checks required permissions and role allow-lists. MFA guard applies
  to admin and broker sensitive roles/actions per existing auth/session policy.
- Tenant isolation is enforced both in service/repository reads and at HTTP
  boundary tests. Broker A must never read, mutate, export or infer Broker B's
  resources.
- Read-only broker/admin roles may read allowed resources but cannot mutate,
  export or mark notifications/actions unless explicitly permitted.
- Refusals for auth/RBAC/MFA/tenant/Starter CRM/flag/read-only are audited when
  they touch sensitive resources or admin/broker actions.

### 5. Prisma Repositories By Domain

- Introduce repository tokens/interfaces per domain and bind Prisma
  implementations in runtime modules.
- Catalog repositories:
  `CountriesRepository`, `ProductsRepository`, `OffersRepository` and
  `QuoteFormDefinitionsRepository` read activation flags, validity windows,
  public status, offer validation and quote form publication.
- Quote flow repositories:
  `QuoteRequestsRepository`, `ProspectsRepository`,
  `ConsentRecordsRepository`, `RoutingRepository`,
  `LeadAssignmentsRepository`, `NotificationsRepository` and
  `QueueJobRecordRepository` persist submission, consent, duplicate/routing
  state, lead assignment and async visibility.
- Access/compliance repositories:
  `UsersRepository`, `RolesRepository`, `PartnersRepository`,
  `PartnerLicensesRepository` and authorization repositories support ActorContext,
  RBAC, tenant isolation, plan, license and eligibility checks.
- Operations repositories:
  `FeatureFlagsRepository`, `FeatureFlagHistoryRepository` and
  `AuditLogsRepository` provide source-of-truth reads/writes.
- Broker CRM repositories cover already-modeled records:
  `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`, `BrokerCrmNote`,
  `BrokerCrmTask`, `BrokerCrmReminder`, `BrokerCrmDocument`,
  `BrokerCrmProposal`, `BrokerCrmDispute` and existing AI-assist-disabled
  metadata.
- Memory repositories remain in `tests`, fixtures or explicitly named
  test modules only. Runtime-normal binding must fail tests if memory adapters
  are selected by default.

### 6. Feature Flags

- PostgreSQL is source of truth for all runtime decisions. Redis may cache
  computed decisions with exact scope and cache version/TTL.
- Public routes resolve global, country and product flags:
  `public_comparator_enabled`, `quote_request_enabled`,
  `country_public_enabled`, `country_waitlist_enabled`,
  `country_quote_enabled`, `country_comparison_enabled`,
  `product_public_enabled`, `product_quote_enabled`,
  `product_comparison_enabled`.
- Broker routes resolve `starter_portal_enabled`, `broker_crm_enabled`, plan and
  partner/plan scopes as applicable.
- Sensitive flags are false when absent, invalid, stale, cache-missed or source
  unavailable. This includes CRM, payments, e-signature, policy issuance,
  claims, insurer API and AI-sensitive flags.
- Admin flag mutation persists history, writes audit, increments cache version
  or invalidates Redis and returns a safe response.
- Tests cover absent/false/true, cache hit/miss, Redis unavailable, cache stale
  and `broker_crm_enabled` false/absent for Pro/Enterprise brokers.

### 7. Durable Audit

- `AuditLogWriter` depends on a durable repository in runtime modules.
- Critical sensitive actions await audit write or fail into an explicit
  operational state. Fire-and-forget audit is not an accepted path for critical
  quote, routing, broker/admin or feature-flag actions.
- Durable audit events include quote creation/refusal, consent grant/refusal,
  routing decision/refusal, lead detail read, Starter actions, CRM actions,
  feature flag mutation, admin sensitive reads/mutations and important access
  refusals.
- Audit context is PII-minimized and includes actor, target, scope, result,
  reason, timestamp and `correlationId` when present.
- `GET /admin/audit-logs` reads from `AuditLog` persistence with RBAC/MFA,
  pagination/limits and safe filtering.

### 8. Public Frontend Wiring

- Convert the public quote form from a static form shell to a real submission
  path that calls `POST /quote-requests`.
- The client validates required display/contact fields and consent before
  submit; server validation remains authoritative.
- Success renders the returned `publicReference` and a compliant confirmation
  message without broker/admin sensitive detail.
- API error states are explicit: disabled country, disabled product, missing
  consent, no eligible offer/broker, validation, rate limit and API unavailable.
- Public API helpers return discriminated states such as `success`, `empty` and
  `error`; they no longer use `[]` or `{}` as hidden error fallbacks.
- Public app imports only public API helpers and shared safe contracts.

### 9. Back-office Frontend Boundaries

- Broker app keeps `/broker/...` calls behind back-office auth token/session and
  displays unauthenticated, forbidden, MFA required, read-only and unavailable
  states.
- Admin app keeps `/admin/...` calls behind admin/back-office auth token/session
  and displays protected error states rather than empty successful data.
- Shared packages are limited to DTOs, validation, RBAC constants and UI
  primitives that do not carry routes, auth state or privileges across apps.
- Tests assert public app does not import `backoffice-auth` or call
  `/broker`/`/admin`, and back-office apps do not use public endpoints to
  bypass access control.

### 10. HTTP, Contract And Playwright Tests

- Add HTTP e2e tests that bootstrap AppModule and exercise real decorated
  controllers with fetch/supertest-style requests. Existing runtime harness can
  be extended to assert module/controller ownership.
- Add metadata/route inventory checks as secondary guardrails, not as the sole
  acceptance proof.
- Required HTTP cases:
  `GET /countries`, public product/offer reads, successful
  `POST /quote-requests`, no-consent refusal + durable audit, disabled
  country/product refusal, no broker/offer refusal, rate limit/duplicate refusal,
  Starter CRM denial, CRM flag false/absent denial, cross-broker denial,
  read-only mutation denial, admin flag mutation audit, durable admin audit read
  and protected health.
- Contract/OpenAPI tests verify route list, methods, auth requirements, request
  DTO references, response status categories and forbidden regulated routes are
  absent.
- Playwright tests navigate real pages when configured with public, broker and
  admin URLs. Without e2e URLs they skip clearly and do not pass as runtime
  acceptance.
- E2E docs describe API/frontend startup, seed fixtures, auth tokens/test users,
  flags and environment variables.

## Progressive Implementation Strategy

1. **Inventory and safety gates**: freeze current route list, add route ownership
   expectations and ensure duplicate route registration is detected.
2. **Common HTTP foundation**: ActorContext boundary, guards, validation helper,
   error mapping and audit refusal helper.
3. **Module graph**: AppModule imports infrastructure and domain modules while
   RuntimeHttpController remains temporary for unmigrated groups.
4. **Public catalog controllers**: migrate countries, products, offers and quote
   form reads to decorated controllers with Prisma repositories.
5. **Quote submission**: migrate `POST /quote-requests` to decorated controller,
   durable repositories, consent/audit and frontend public form wiring.
6. **Auth and protected context**: migrate auth routes and ensure broker/admin
   ActorContext no longer depends on controller header parsing.
7. **Broker Starter**: migrate Starter routes, tenant isolation, read-only
   mutation refusal, audit and notifications.
8. **Broker CRM**: migrate CRM routes with Starter denial, `broker_crm_enabled`
   fail-closed, tenant isolation and CRM repositories.
9. **Admin core**: migrate feature flags, audit logs and health; keep other
   admin controllers corrected only for current endpoint compatibility.
10. **Frontend error states**: replace silent fallbacks in public, broker and
   admin helpers with visible state handling.
11. **Runtime acceptance**: expand HTTP e2e, contract, tenant/RBAC, audit,
   feature flag and Playwright tests; then retire RuntimeHttpController route
   ownership for completed domains.

## Recommended Implementation Order

1. Add route inventory/ownership tests that document current RuntimeHttpController
   coverage and expected migrated owners.
2. Implement common `ActorContext` request boundary, auth/MFA/RBAC guards and
   test-only simulation header gate.
3. Introduce common DTO validation and HTTP exception mapping.
4. Convert AppModule to import real domain modules while keeping
   RuntimeHttpController only for unmigrated routes.
5. Bind durable repositories for audit logs and feature flags first because
   protected routes and flags depend on them.
6. Migrate public catalog controllers and repositories.
7. Migrate public quote request controller, quote/consent/prospect/lead
   repositories and public frontend submission.
8. Migrate auth routes and protected ActorContext usage.
9. Migrate Broker Starter routes and tests.
10. Migrate Broker CRM routes and tests.
11. Migrate admin feature flags, audit logs and health.
12. Replace misleading frontend fallbacks and add Playwright runtime mode.
13. Run final validation: typecheck, lint, unit, integration, contract,
   guardrails, HTTP e2e and Playwright where configured.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| AppModule/module graph | AppModule imports real modules; no P1 route relies only on RuntimeHttpController |
| Controllers | Decorated controller metadata and runtime HTTP response for each migrated group |
| Public catalog | `GET /countries`, products and offers enforce public flags and offer validity |
| Quote submission | Consent success, no-consent refusal, disabled country/product, no broker/offer, rate limit and duplicate cases |
| ActorContext/Auth | Missing actor 401/403, invalid token, simulation headers gated, MFA required where applicable |
| RBAC/read-only | Permission denial, read-only mutation refusal and export limits |
| Tenant isolation | 0 successful cross-broker read/mutation/export/notification/CRM action |
| Feature flags | Persistent reads, Redis cache, absent/false fail closed, CRM flag false/absent |
| Durable audit | Sensitive success/refusal events persisted and readable through admin endpoint |
| Frontend public | Real `POST /quote-requests`, confirmation with `publicReference`, visible errors |
| Frontend back-office | Protected broker/admin clients only, visible auth/forbidden/MFA/unavailable states |
| Contracts/OpenAPI | Route methods, schemas, auth requirements, status categories and forbidden regulated routes |
| Playwright | Real navigation when URLs exist; documented skip otherwise |
| Constitution | No direct sale/subscription/payment/policy/attestation/e-signature/claims/advanced AI activation |

## Risks

- Existing domain classes may have controller-like names without Nest metadata,
  so tests must prove runtime route ownership instead of relying on filenames.
- AppModule imports may reveal dependency cycles currently hidden by
  AssurMatchRuntime manual wiring.
- During transition, duplicate routes may appear if RuntimeHttpController and a
  domain controller own the same path simultaneously.
- Moving ActorContext out of controllers can break tests using simulation
  headers unless test-only support is preserved deliberately.
- Durable audit failure handling may make previously green paths fail until
  operational behavior is explicit.
- Persistent flag/cache reads may uncover missing seed/default data; defaults
  must remain closed.
- Removing frontend silent fallbacks may expose real API availability problems
  that previous structural tests masked.
- Playwright runtime tests require coordination of API, public, broker and admin
  servers plus seed/auth fixtures.

## Complexity Tracking

No constitutional violations or exceptions are planned.

## Post-Design Constitution Re-Check

- **Technical platform role**: Pass. Design artifacts describe HTTP wiring only
  and do not activate regulated business capabilities.
- **Regulatory and consent**: Pass. Consent before transmission and audit of
  refusals remain explicit across plan, data model, contract and quickstart.
- **Feature flags and activation**: Pass. Sensitive flags fail closed and no
  regulated flag is enabled by default.
- **Frontend application separation**: Pass. Public, broker and admin app
  boundaries are preserved and tested.
- **Security and RBAC**: Pass. ActorContext, guards, MFA, RBAC, read-only and
  tenant isolation are first-class design concerns.
- **Data and auditability**: Pass. Prisma repositories and durable AuditLog are
  required runtime acceptance points.
- **Routing integrity**: Pass. Existing routing blockers remain mandatory and
  no new routing policy is introduced.
- **AI control**: Pass. No AI activation or model call is introduced.
- **UX and content safety**: Pass. Public wording remains compliant and
  frontend changes are limited to real wiring and error states.
- **Testing discipline**: Pass. Runtime HTTP and Playwright acceptance are
  required in addition to structural guardrails.
- **Async and reliability**: Pass. No heavy public synchronous work is added;
  007 Redis/BullMQ constraints remain in force.
- **Continuous workflow safety**: Pass with stop condition. Planning stops here
  per user request; no `tasks.md` or implementation is generated.
