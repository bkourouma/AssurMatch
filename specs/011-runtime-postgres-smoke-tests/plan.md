# Implementation Plan: Runtime PostgreSQL Smoke Tests AssurMatch

**Branch**: `011-runtime-postgres-smoke-tests` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-runtime-postgres-smoke-tests/spec.md`

**Continuous Workflow Eligibility**: Eligible for `/speckit.tasks` after this
plan is accepted. The user states the spec 011 is created and validated, and
this request contains no unresolved clarification. This invocation must stop
after planning artifacts because the user explicitly requested no `tasks.md`
and no implementation. Future continuation must stop for constitutional
conflict, DATABASE_URL safety ambiguity, compliance/security/data leakage risk,
forbidden activation, production database risk, uncovered product decision or
blocking validation failure. Do not auto-commit unless the user asks.

## Summary

Create a dedicated runtime PostgreSQL smoke-test suite that starts the real
NestJS backend outside `NODE_ENV=test`, uses an explicit smoke `DATABASE_URL`,
fails if memory repositories or memory runtime overrides are present, applies or
validates Prisma migrations, seeds only synthetic smoke data, exercises existing
HTTP routes, verifies resulting rows directly with `PrismaClient`, and cleans
or isolates smoke data by run id.

The plan adds a new validation layer; it does not add business features, does
not change public or broker/admin routes unless a future implementation proves a
compatibility-safe technical fix is required, and does not activate payments,
subscription, issuance, signature, claims, insurer API or advanced AI.

## Technical Context

**Language/Version**: Node.js >=24.15.0; TypeScript 6.0.3 strict; NestJS 11.1.19; Prisma 7.8.0; Vitest 4.1.5; Playwright 1.59.1; Next.js 16.2.4 and React 19.2.5 remain present but not in scope.
**Primary Dependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@prisma/client`, `prisma`, `tsx`, `vitest`, `zod`, shared contracts in `packages/shared`, existing `AssurMatchRuntime`, `AppModule`, repository guardrails and HTTP controller wiring.
**Storage**: PostgreSQL is the runtime source of truth for smoke data. Redis remains available through existing local runtime for feature flag cache, rate limiting, queues and BullMQ behavior, but the smoke proof focuses on PostgreSQL persistence and direct DB verification.
**Testing**: Add a dedicated runtime smoke script, recommended as `npm run test:runtime:postgres`, backed by a separate Vitest config or runner entry that does not rely on `NODE_ENV=test`. Existing scripts remain unchanged: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:guardrails`, `npm run test:web`, `npm run build`, `npm run validate`.
**Target Platform**: SaaS B2B2C regulated insurance marketplace with separated Web Publique Client, Back-office Partenaires/Plateforme, Backend API and shared packages.
**Impacted Application(s)**: Backend API, backend tests, root npm scripts, optional Docker Compose documentation/configuration, and spec documentation. Web Publique Client and Back-office Partenaires/Plateforme are not changed.
**Project Type**: Technical runtime evidence and end-to-end smoke validation for a regulated marketplace backend.
**Performance Goals**: Local smoke suite should complete in a practical developer/CI window, target under 2 minutes after dependencies are running, and keep each HTTP scenario bounded by seeded data. Public endpoints must not gain new heavy synchronous work.
**Constraints**: No `NODE_ENV=test` for the runtime smoke path; no memory repositories; explicit smoke `DATABASE_URL`; never production database; smoke data synthetic only; preserve existing HTTP contracts; sensitive flags fail closed; no prohibited regulated modules activated; no frontend app mixing.
**Scale/Scope**: One isolated smoke run covers health/runtime, public catalog, consented quote, no-consent refusal, Starter tenant isolation, CRM Pro enabled/disabled, persisted feature flags and durable audit. Optional CI runs against an ephemeral PostgreSQL service.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. This is a test/runtime proof only. It does not introduce direct sale, direct subscription, premium collection, policy issuance, attestation issuance, claims, signature, insurer API or binding advice.
- **Regulatory and consent**: Pass. The smoke matrix explicitly tests consented quote persistence and no-consent refusal, with direct database verification of `ConsentRecord`, `QuoteRequest`, `LeadAssignment` absence/presence and audit traces.
- **Feature flags and activation**: Pass. The plan requires persistent flags to be fail-closed, activates `broker_crm_enabled` only for the positive CRM scenario, then disables/removes it for the refusal scenario. Prohibited flags remain false/absent.
- **Frontend application separation**: Pass. Backend API and tests only. Public and broker/admin routes are exercised through existing backend HTTP scopes; no frontend route, layout, auth state or deployment is modified.
- **Security and RBAC**: Pass. Broker/admin calls use synthetic actors/tokens with role, tenant, plan and MFA headers or tokens already supported by existing runtime helpers. Cross-tenant reads and unauthorized audit access are negative checks.
- **Data and auditability**: Pass. The suite uses run ids/correlation ids for smoke rows, verifies durable `AuditLog` where required, and either cleans smoke rows or isolates audit evidence when deletion is not appropriate.
- **Routing integrity**: Pass. Consented quote with eligible broker should create durable assignment; no-consent and ineligible states must not route or notify a broker.
- **AI control**: Pass. No AI model call is introduced. AI flags remain fail-closed and no AI scenario is part of the smoke proof.
- **UX and content safety**: Pass. No new public wording is introduced. Existing route responses remain subject to prior wording and indicative-offer guardrails.
- **Testing discipline**: Pass. The feature is itself a smoke-test suite and includes negative cases for no consent, tenant isolation, disabled CRM flag, memory adapter rejection, production DB rejection and durable audit.
- **Async and reliability**: Pass. The plan verifies durable traces and leaves queue/notification delivery asynchronous. It does not add heavy synchronous public processing.
- **Continuous workflow safety**: Pass with stop condition. The spec is validated by user statement and has no clarification markers, but this command stops after plan artifacts per user request.

## Project Structure

### Documentation (this feature)

```text
specs/011-runtime-postgres-smoke-tests/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    runtime-postgres-smoke-contract.md
  checklists/
    requirements.md
```

`tasks.md` is intentionally not generated in this request.

### Source Code (repository root)

```text
package.json
docker-compose.yml
prisma.config.ts
vitest.config.ts
backend/
  src/
    app.module.ts
    config/config.module.ts
    runtime/
      assurmatch-runtime.ts
      runtime-http.controller.ts
    modules/
      common/
        prisma/prisma.service.ts
        repositories/runtime-repository.ts
      http-wiring/runtime-http-wiring.module.ts
      admin/system-health.module.ts
      audit-logs/
      feature-flags/
      countries/
      products/
      offers/
      consent/
      prospects/
      quote-requests/
      leads/
      partners/
      partner-licenses/
      notifications/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/
    runtime-postgres/
      runtime-postgres-smoke.spec.ts
      runtime-postgres-smoke-harness.ts
      runtime-postgres-smoke-seed.ts
      runtime-postgres-smoke-cleanup.ts
      runtime-postgres-smoke-assertions.ts
    integration/
      runtime-http-test-utils.ts
    guardrails/
packages/
  shared/
```

**Structure Decision**: Add a new `backend/tests/runtime-postgres/` suite rather
than changing existing `backend/tests/integration` tests, because the current
integration suite is allowed to run with `NODE_ENV=test`. Reuse existing
runtime HTTP patterns and shared contracts, but create a smoke-specific harness
that sets `NODE_ENV=runtime-smoke` or equivalent and refuses memory overrides.
Do not create or modify frontend application structure.

## Phase 0 Research Decisions

See [research.md](./research.md). Key decisions:

- Use `NODE_ENV=runtime-smoke` plus `ASSURMATCH_RUNTIME_SMOKE=true` to make the
  suite clearly non-test and opt-in.
- Require an explicit `DATABASE_URL` whose database name or query metadata is
  smoke-identifiable, and reject production/staging-looking URLs.
- Prefer `prisma migrate deploy` for schema application in local/CI smoke runs,
  preceded by schema validation, instead of `migrate dev`.
- Reuse the existing root `docker-compose.yml` PostgreSQL service for local
  development, with a separate smoke database or URL.
- Use a real in-process Nest application listening on an ephemeral port so HTTP
  calls are real network calls while remaining easy to manage in tests.
- Verify database state with a separate `PrismaClient` instance from the test
  verifier, not by reading runtime service memory.
- Isolate data by `smokeRunId`/correlation and synthetic prefixes; clean rows
  where legally/test-wise safe and retain only isolated audit traces when
  deletion would undermine audit semantics.

## Phase 1 Design Outputs

- [data-model.md](./data-model.md): smoke run model, seeded records, scenario
  dependencies, cleanup ownership and state transitions.
- [contracts/runtime-postgres-smoke-contract.md](./contracts/runtime-postgres-smoke-contract.md):
  command/environment contract, HTTP scenario contract, DB verification
  contract, safety guardrails and failure semantics.
- [quickstart.md](./quickstart.md): local PostgreSQL/Docker setup, environment,
  migration validation, script usage, cleanup and optional CI notes.
- `AGENTS.md`: current plan reference updated to this plan.

## Technical Plan

### 1. Add Smoke Runtime Environment Contract

- Introduce a dedicated smoke environment path:
  `NODE_ENV=runtime-smoke`, `APP_ENV=runtime-smoke` if supported, and
  `ASSURMATCH_RUNTIME_SMOKE=true`.
- Extend runtime validation so `runtime-smoke` is outside test behavior but is
  accepted as a controlled local/CI runtime environment.
- Keep `process.env.NODE_ENV !== "test"` for Prisma runtime binding in
  `AssurMatchRuntime`; do not weaken this rule.
- Fail fast when any memory override is true:
  `ASSURMATCH_PRISMA_MEMORY`, `ASSURMATCH_REDIS_MEMORY`,
  `ASSURMATCH_QUEUE_MEMORY`, `ASSURMATCH_AUDIT_MEMORY`.
- Add a smoke-specific DATABASE_URL validator that rejects:
  missing URL, non-PostgreSQL URL, production/staging host or db names,
  default production-like credentials, missing smoke marker, and any URL not
  explicitly acknowledged by `ASSURMATCH_RUNTIME_SMOKE=true`.

### 2. Add Dedicated Script And Runner

- Add root script `test:runtime:postgres` that sets the smoke env explicitly and
  runs only `backend/tests/runtime-postgres`.
- Prefer a small wrapper script or npm command sequence that:
  1. validates smoke env;
  2. validates Prisma schema;
  3. applies or checks migrations;
  4. runs the smoke test runner;
  5. returns non-zero on cleanup or verification failure.
- Avoid running the default `npm run test` path for this suite because Vitest
  commonly sets or assumes test semantics. If Vitest is used, configure the
  smoke runner so `NODE_ENV` remains `runtime-smoke`.
- Keep existing scripts unchanged and additive.

### 3. PostgreSQL And Docker Compose Strategy

- Reuse `docker-compose.yml` PostgreSQL when available.
- Prefer a separate database name for smoke, for example
  `assurmatch_runtime_smoke`, rather than the shared `assurmatch` development
  database.
- Document either:
  - creating a smoke DB inside the existing `postgres` service; or
  - overriding `POSTGRES_DB` through a compose profile/env file if a future
    implementation chooses a dedicated service/profile.
- Do not require Docker if an operator provides a safe PostgreSQL
  `DATABASE_URL` that passes validation.
- Redis may use the existing compose Redis service unless a future task proves a
  dedicated namespace is needed; set `BULLMQ_PREFIX`/queue namespace to include
  the smoke run where possible.

### 4. Migration Validation

- Before HTTP calls, execute or require:
  - Prisma schema validation;
  - migration status check when available;
  - `prisma migrate deploy` against the smoke database for local/CI;
  - Prisma client generation only if the project workflow requires it.
- Fail before seeding if migrations are missing, drifted or incompatible.
- Do not add schema migrations for the smoke suite unless implementation
  reveals a missing field/index needed for already-specified behavior.

### 5. Smoke Harness And Server Boot

- Create a smoke harness that starts `AppModule` through `NestFactory` with
  `ErrorResponseFilter`, listens on port `0`, and returns a `baseUrl`.
- Use real HTTP requests via `fetch` to `http://127.0.0.1:<port>`.
- Resolve `AssurMatchRuntime` only for runtime inspection and setup support, not
  as a substitute for HTTP scenario execution.
- Use a separate verifier `PrismaClient` for direct DB assertions.
- Close Nest app, queues, Redis and Prisma clients in `finally` blocks.
- Ensure any server boot failure includes sanitized diagnostics and never logs
  `DATABASE_URL` credentials.

### 6. Repository Runtime Guard

- Build a guard assertion that verifies all critical repository instances report
  `mode = "prisma-runtime"` when available.
- Include at minimum the 12 post-010 critical repositories:
  Countries, Products, Offers, Prospects, ConsentRecords, QuoteRequests,
  LeadAssignments, RoutingDecisions, Partners, PartnerLicenses, CRMActivity and
  Notifications.
- Also assert `AuditLogRepository` and `FeatureFlagRepository` remain
  Prisma-runtime in smoke.
- Fail immediately if any repository is `memory-test`, undefined because of
  test mode, or lacks runtime metadata required by the guard.
- Keep existing unit/integration memory adapter tests unchanged.

### 7. Seed Minimal Synthetic Data

- Generate a `smokeRunId` at test start and derive deterministic prefixes:
  country code/name suffix where legal, product key, offer name, broker names,
  emails, license numbers, public references and correlation ids.
- Seed or create through services only where needed to preserve business rules;
  direct Prisma seed is allowed for test setup only when the row is pure
  reference/setup data and the plan documents why HTTP/service setup is not
  available.
- Minimum positive catalog/quote seed:
  active public country, active product, country-product association, active
  non-expired indicative offer, published consent text, quote form if required,
  eligible active broker, valid license and explicit safe feature flags.
- Minimum broker seed:
  Starter broker A, Starter broker B, Pro broker, leads assigned to the
  intended tenants, and actor identities/tokens with MFA/roles where required.
- Keep prohibited flags false/absent:
  payments, e-signature, policy issuance, claims, insurer API, advanced AI and
  unrelated modules.

### 8. HTTP Scenario Matrix

#### Health/runtime

- Start backend with smoke env and real PostgreSQL.
- Call `GET /admin/system/health` with an authorized super admin actor/token.
- Assert healthy status for PostgreSQL and applicable runtime dependencies.
- Assert repository guard confirms Prisma runtime and no memory repositories.

#### Public catalog

- Seed active smoke country/product/offer.
- Call:
  - `GET /countries`;
  - `GET /countries/:countryCode/products`;
  - `GET /countries/:countryCode/products/:productKey/offers`.
- Compare HTTP response values to rows read by verifier `PrismaClient`.
- Add an expired/inactive offer check if feasible inside the same suite without
  making the smoke too broad.

#### Quote request with consent

- Submit `POST /quote-requests` with valid payload, consent and correlation id.
- Assert HTTP success per existing contract.
- Verify directly:
  `Prospect`, `ConsentRecord`, `QuoteRequest`, `LeadAssignment` when eligible,
  `AuditLog`, and `RoutingDecision` or equivalent trace when modeled.

#### Quote request without consent

- Submit `POST /quote-requests` without consent.
- Assert HTTP refusal per existing contract.
- Verify no valid routable `QuoteRequest`, no `LeadAssignment`, no broker
  notification and no non-compliant persisted state.
- Verify refusal audit/trace if current behavior defines one.

#### Broker Starter tenant isolation

- Seed Starter broker A and B plus lead assigned to A.
- Call `GET /broker/starter/leads` as A and verify the lead is visible.
- Call the same endpoint as B and verify A's lead is absent.
- Verify direct DB tenant ownership matches HTTP visibility.

#### Broker CRM Pro enabled/disabled

- Seed Pro broker and assigned lead.
- Persist `broker_crm_enabled=true`.
- Call `GET /broker/crm/leads` and assert success/visibility.
- Set `broker_crm_enabled=false` or remove it; invalidate/wait for runtime cache
  as documented.
- Call again and assert access refused.

#### Persisted feature flags

- Verify sensitive flags are absent/false by default in a clean smoke scope.
- Verify CRM access follows the persisted/cache runtime flag, not a memory test
  adapter or process-only override.
- Assert prohibited flags remain false/absent throughout the run.

#### Durable audit

- Use quote submission or another sensitive action to create an audit.
- Query `AuditLog` directly by smoke correlation id.
- If `GET /admin/audit-logs` is available, call it with authorized admin and
  verify smoke audit visibility; call with unauthorized actor and verify refusal.

### 9. Direct DB Verification

- Use a verifier `PrismaClient` constructed from the same smoke `DATABASE_URL`.
- Query by `smokeRunId`, correlation id, unique email/license/offer names or
  related IDs returned by HTTP responses.
- Assertions must prove both existence and relationship:
  prospect-to-consent, quote-to-prospect, assignment-to-broker, decision-to-quote,
  audit-to-action/correlation.
- Do not accept runtime service arrays/maps as proof.
- Keep PII synthetic and avoid printing raw payloads in failure messages.

### 10. Cleanup And Isolation

- Implement cleanup in reverse dependency order:
  CRM activity, notifications/job traces, lead assignments/history, routing
  decisions, quote requests, consent records, prospects, offers/history,
  licenses, partner authorizations, partners, quote forms/consent texts,
  products/country-product links, countries and smoke-only flags.
- Use `smokeRunId`, correlation id and unique prefixes in every cleanup filter.
- Never run broad deletes without smoke filters.
- If audit deletion conflicts with audit semantics, leave audit rows tagged with
  smoke run id and document retention/isolation.
- Cleanup runs before seeding to remove leftovers and after tests in `finally`.
- A cleanup failure should fail the suite unless the row type is explicitly
  configured for retained isolated evidence.

### 11. Documentation And Quickstart

- Document:
  - required env vars;
  - Docker and external PostgreSQL options;
  - migration/validation commands;
  - smoke script;
  - expected success output;
  - common failures and fixes;
  - cleanup behavior;
  - CI example.
- Make clear that this suite is not a replacement for unit/integration/contract
  tests and should not run against production or shared staging data.

### 12. Optional CI Strategy

- Add a future CI job that provisions PostgreSQL service, creates an ephemeral
  smoke database, sets `ASSURMATCH_RUNTIME_SMOKE=true`, runs migrations, starts
  the smoke test script and uploads sanitized logs.
- Keep it separate from quick tests if duration or infrastructure availability
  would slow every PR.
- Mark the job required only after it is stable and not flaky.

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| Env safety | `NODE_ENV=test`, missing smoke flag, missing DATABASE_URL and production-like URLs fail before seeding |
| Runtime repositories | Critical repositories resolve `prisma-runtime`; memory repositories fail immediately |
| Migrations | Prisma schema validates and migrations are applied or confirmed before HTTP calls |
| Health | `GET /admin/system/health` succeeds with authorized admin and real runtime dependencies |
| Catalog | Countries/products/offers HTTP responses match PostgreSQL rows |
| Quote with consent | Success response plus durable Prospect, ConsentRecord, QuoteRequest, LeadAssignment and audit |
| Quote without consent | Refusal response plus no routable request, no assignment, no broker notification |
| Starter | Broker A sees own lead; broker B does not see A's lead |
| CRM flag true | Pro broker sees CRM lead only when persisted `broker_crm_enabled=true` |
| CRM flag false/absent | CRM access is refused when flag is false or absent |
| Flags | Sensitive flags remain false/absent; no prohibited module activated |
| Audit | AuditLog exists by correlation id; admin audit endpoint returns it if applicable |
| Cleanup | Smoke data is deleted or isolated by smoke run id without touching non-smoke data |
| Documentation | Quickstart covers local, Docker/external DB, migrations, CI and troubleshooting |

## Risks

- `runtime-smoke` is not currently one of the recognized `APP_ENV` values; the
  implementation must add support without weakening production validation.
- Vitest and other test runners may force `NODE_ENV=test`; the smoke runner must
  preserve or restore `NODE_ENV=runtime-smoke`.
- DATABASE_URL safety is hard to prove perfectly; use multiple heuristics and
  require an explicit smoke acknowledgement flag.
- Feature flag cache may produce stale reads; the implementation must document
  invalidation or start a fresh app between flag toggles.
- Direct DB cleanup can violate audit expectations if it deletes evidence; use
  isolated audit rows when deletion is not appropriate.
- Smoke data dependencies may be broad because catalog, quote, routing, broker
  and audit flows intersect.
- CI PostgreSQL setup can be slower or flaky if the service is not ready before
  migrations.

## Rollback And Cleanup Strategy

- The implementation should be additive: new script, new tests, new docs and
  small config guard changes only.
- If smoke environment validation breaks normal local/test/staging/production,
  revert the config change before reverting the whole suite.
- If the runtime smoke suite is flaky, keep the script available locally but do
  not make CI required until stable.
- If a scenario fails because current runtime behavior is non-compliant, keep
  the failing scenario as evidence and stop implementation rather than weakening
  the assertion.
- Cleanup must be idempotent and scoped by smoke run id. On rollback, any
  leftover smoke data can be removed by the documented cleanup command/query.
- No migration should be introduced solely for test convenience. If a migration
  is required for existing specified behavior, it must be reversible through the
  normal Prisma migration process.

## Recommended Implementation Order

1. Add smoke environment validation and DATABASE_URL safety checks.
2. Add `backend/tests/runtime-postgres` harness, verifier client and cleanup
   helpers.
3. Add npm script and optional runner config that preserves
   `NODE_ENV=runtime-smoke`.
4. Add migration validation/application step.
5. Implement repository runtime guard assertions.
6. Implement seed helpers with synthetic smoke run id.
7. Add health/runtime smoke scenario.
8. Add public catalog smoke scenario.
9. Add quote with consent and no-consent scenarios.
10. Add Starter tenant isolation scenario.
11. Add CRM enabled/disabled and persisted feature flag scenarios.
12. Add durable audit DB/admin scenario.
13. Add quickstart and optional CI notes.
14. Run targeted smoke, guardrails, typecheck, lint and existing validations.

## Complexity Tracking

No constitutional violations or exceptions are planned.

## Post-Design Constitution Re-Check

- **Technical platform role**: Pass. Design artifacts describe runtime evidence
  only and do not introduce prohibited regulated capabilities.
- **Regulatory and consent**: Pass. Consent-positive and no-consent-negative
  scenarios are mandatory, with durable DB and audit verification.
- **Feature flags and activation**: Pass. Sensitive flags remain fail-closed;
  only `broker_crm_enabled` is toggled inside an isolated smoke scope.
- **Frontend application separation**: Pass. No frontend code, route, layout,
  auth state or deployment is touched.
- **Security and RBAC**: Pass. Broker/admin scenarios require authenticated
  synthetic actors, MFA where required, role checks and tenant isolation.
- **Data and auditability**: Pass. Smoke data is synthetic, correlated,
  directly verified and cleaned or isolated; audit durability is a core check.
- **Routing integrity**: Pass. Eligible routing is verified only after consent
  and broker eligibility; no-consent and ineligible cases remain blocked.
- **AI control**: Pass. No model calls or AI activation are planned.
- **UX and content safety**: Pass. Existing HTTP contracts remain unchanged.
- **Testing discipline**: Pass. The plan adds a targeted end-to-end runtime
  smoke suite plus negative guardrails.
- **Async and reliability**: Pass. No delivery/job behavior is made
  synchronous; only durable traces are verified.
- **Continuous workflow safety**: Pass with stop condition. Planning stops here
  per user request; no `tasks.md` or implementation is generated.
