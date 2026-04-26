# Research: API HTTP Wiring AssurMatch

## Decision: Use AppModule as the single runtime composition root

**Rationale**: The repository already has `backend/src/app.module.ts`,
`backend/src/main.ts` and domain directories under `backend/src/modules`. The
least disruptive path is to make AppModule import those modules directly and
keep the current Nest runtime entrypoint.

**Alternatives considered**:
- Create a second API runtime: rejected because it would duplicate deployment,
  auth and tests without business value.
- Rewrite the backend around a new module layout: rejected because spec 008 must
  be a progressive transition, not a total rewrite.

## Decision: Migrate route ownership by domain group

**Rationale**: RuntimeHttpController currently centralizes many route groups.
Moving everything at once would create high risk of duplicate routes and
regressions. Domain groups provide testable increments: public catalog, quote
requests, auth, Starter, CRM, admin flags/audit/health, then remaining admin
compatibility.

**Alternatives considered**:
- Keep RuntimeHttpController and only add decorators around it: rejected because
  it would preserve the facade as the long-term architecture.
- Delete RuntimeHttpController first: rejected because it would risk breaking
  existing HTTP paths before domain controllers are ready.

## Decision: Build ActorContext once per protected request

**Rationale**: Controllers must not re-parse simulation headers. Guards or a
request-scoped provider should verify bearer/session identity, attach
ActorContext and allow controllers/services to consume that single trusted
context. This also makes RBAC, MFA and tenant checks testable through Nest.

**Alternatives considered**:
- Continue parsing headers in each controller method: rejected because it
  duplicates security logic and makes production/test boundaries blurry.
- Require ActorContext on public routes: rejected because public visitor
  journeys must not depend on partner/admin auth state.

## Decision: Gate simulation headers to tests/development only

**Rationale**: The current test helper pattern relies on simulated actors. It is
useful for deterministic HTTP tests, but it must be impossible to activate
silently in production. The accepted boundary is `NODE_ENV=test` with
`ASSURMATCH_ALLOW_TEST_AUTH_HEADERS=true`, plus an explicitly documented local
development mode only if needed.

**Alternatives considered**:
- Remove simulation headers entirely: rejected because it would make current
  integration tests harder to preserve during transition.
- Allow simulation headers whenever no bearer token exists: rejected because it
  would be a critical security risk.

## Decision: Reuse shared Zod contracts for HTTP DTO validation

**Rationale**: The repo already uses schemas in `packages/shared/contracts` and
`packages/shared/validation`. Reusing them avoids drift between backend,
frontend and contract tests. Controllers should call a common validation helper
or pipe rather than bespoke parsing.

**Alternatives considered**:
- Introduce class-validator DTOs in parallel: rejected for this feature because
  it would duplicate existing schemas and increase drift risk.
- Trust frontend validation: rejected because the server remains the authority.

## Decision: Keep Prisma repositories per domain, memory only for tests

**Rationale**: Spec 007 established PostgreSQL/Prisma as runtime source of
truth. Spec 008 should consume that hardening by binding repositories in domain
modules. Memory adapters remain useful for unit tests but cannot be runtime
defaults.

**Alternatives considered**:
- Let services continue owning arrays while controllers become decorated:
  rejected because HTTP idiom alone would not make the runtime durable.
- Put all Prisma access in one generic repository: rejected because it obscures
  domain rules such as flags, consent, tenant and license checks.

## Decision: Use persistent feature flags with Redis as cache only

**Rationale**: Activation decisions must be durable and auditable. Redis is
appropriate for acceleration, not as the source of truth. Sensitive flags must
fail closed when data is absent, stale or unavailable.

**Alternatives considered**:
- Read flags from memory arrays: rejected because it loses state and audit.
- Treat Redis values as authoritative: rejected because cache corruption or
  expiry could activate forbidden modules.

## Decision: Treat durable audit as acceptance evidence

**Rationale**: The constitution requires AuditLog evidence for sensitive
actions. For quote transmission, routing, broker/admin access, feature flag
mutation and important refusals, audit cannot be best-effort-only.

**Alternatives considered**:
- Fire-and-forget audit writes everywhere: rejected because critical evidence
  could be silently lost.
- Block every minor read when audit fails: rejected for non-critical reads; the
  plan differentiates high-risk actions from low-risk observability paths.

## Decision: Replace frontend silent fallbacks with explicit state

**Rationale**: Returning `[]` or `{}` on API failure makes unavailable services
look like valid empty results. Public users and back-office users need visible
error, empty and success states, while still avoiding sensitive detail.

**Alternatives considered**:
- Keep fallbacks and only log errors: rejected because it does not satisfy the
  spec acceptance criteria.
- Throw unhandled errors in pages: rejected because users need controlled,
  compliant error states.

## Decision: Make HTTP e2e the primary acceptance proof

**Rationale**: Existing structural/source-reading tests are useful guardrails but
do not prove Nest module/controller wiring, guards, persistence and frontend
runtime behavior. AppModule HTTP tests and Playwright navigation must be the
primary proof for spec 008.

**Alternatives considered**:
- Keep source-reading tests as acceptance: rejected because RuntimeHttpController
  could still serve paths despite files looking correct.
- Require Playwright always: rejected because local/CI environments may not
  always have all servers configured. The accepted mode is real navigation when
  e2e URLs exist and explicit skip otherwise.

## Decision: Contract artifact documents route ownership and auth requirements

**Rationale**: The feature is a technical HTTP wiring transition. A markdown
contract with route groups, auth, status mapping and frontend boundaries is
enough for planning and can later be translated to OpenAPI/contract tests.

**Alternatives considered**:
- Generate a full OpenAPI YAML during planning: rejected because there is no
  implementation yet and the existing contracts are still spread across prior
  specs.
- Skip contracts: rejected because the user explicitly requested
  OpenAPI/contract coverage and a runtime wiring contract.
