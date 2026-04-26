# Research: Prisma Domain Persistence AssurMatch

## Decision 1: Convert existing domain-owned ports to async Prisma-runtime

**Decision**: Keep the domain-owned repository ports introduced by spec 009 and
convert their runtime implementations to complete async Prisma repositories.
Ports can be refined where needed, but the owning module remains responsible
for its repository token and runtime binding.

**Rationale**: The ports already reflect AssurMatch domain boundaries. Reusing
them reduces churn while allowing services/controllers to evolve from memory
state to durable state.

**Alternatives considered**:
- Replace ports with raw Prisma client access in services: rejected because it
  spreads persistence details and weakens test-only adapter control.
- Create one generic CRUD repository: rejected because tenant, consent,
  public-filter, routing and CRM rules differ by domain.
- Keep sync ports and hide async inside services: rejected because Prisma
  operations are inherently async and hidden promises would make failures
  harder to audit.

## Decision 2: Ship no partial Prisma adapters

**Decision**: A Prisma repository may be bound in runtime only when every method
on its port is implemented functionally. Transition throws, TODOs and
"requires async Prisma service integration" are forbidden in runtime Prisma
classes.

**Rationale**: A partial adapter is worse than an explicit transition because it
can pass provider resolution but fail during a compliance-sensitive path such
as quote consent, routing or tenant-scoped CRM.

**Alternatives considered**:
- Bind partial repositories and rely on tests to avoid missing methods:
  rejected because public and broker runtime paths can drift.
- Allow partial adapters behind feature flags: rejected because the repository
  layer is infrastructure, not a business feature.

## Decision 3: Reuse current Prisma schema first

**Decision**: Treat the existing `backend/prisma/schema.prisma` as sufficient
unless implementation proves a missing field, relation, constraint or index for
already-specified behavior.

**Rationale**: The schema already contains the priority models for catalog,
quote intake, consent, prospects, leads, routing, partners, licenses, CRM,
notifications, audit and feature flags. Spec 010 is not a business expansion.

**Alternatives considered**:
- Add schema relations/indexes speculatively during planning: rejected because
  it can create scope creep and migrations without evidence.
- Create duplicate persistence tables per repository: rejected because
  PostgreSQL/Prisma source of truth already exists.

## Decision 4: Keep business policy outside repositories

**Decision**: Repositories perform durable reads/writes, mappings and safe
scope filters. Services and policy classes keep consent, routing, publication,
RBAC, plan, flag and audit decisions.

**Rationale**: AssurMatch compliance rules must remain visible and testable in
application services. Repositories should not become hidden business engines.

**Alternatives considered**:
- Encode all rules into Prisma queries: partially rejected. Public and tenant
  filters belong in repository methods, but final eligibility decisions remain
  in services.
- Keep memory service state until all rules are rewritten: rejected because the
  feature goal is durable Prisma persistence.

## Decision 5: Use transaction boundaries for quote intake

**Decision**: Quote submission must use a Prisma transaction or equivalent
unit-of-work whenever a single accepted request creates or updates multiple
critical records: `ConsentRecord`, `Prospect`, `QuoteRequest`,
`RoutingDecision`, `LeadAssignment` and notification trace references.

**Rationale**: Partial quote persistence can violate consent evidence, routing
integrity and support traceability.

**Alternatives considered**:
- Persist each entity independently and repair later: rejected for compliance
  paths.
- Put notification delivery inside the transaction: rejected because delivery
  remains asynchronous and should not block public endpoints.

## Decision 6: Keep memory adapters test-only

**Decision**: Memory repositories remain available for unit tests and explicit
test modules, but runtime-normal modules must reject `mode = "memory-test"`.

**Rationale**: Unit tests still benefit from fast in-memory isolation. Runtime
must never silently lose consent, lead, CRM, notification or audit evidence.

**Alternatives considered**:
- Delete memory adapters immediately: rejected because it would force all unit
  tests through database fixtures and slow implementation.
- Permit memory fallback when Prisma config is missing: rejected because it
  masks production misconfiguration.

## Decision 7: Preserve HTTP contracts as acceptance boundaries

**Decision**: Existing public, Starter, CRM and touched admin routes remain the
contract boundary. Tests should prove seeded PostgreSQL records appear through
the same routes and that response shapes do not drift.

**Rationale**: The feature is technical persistence hardening, not a frontend or
business workflow change.

**Alternatives considered**:
- Add new repository-backed endpoints: rejected because it adds product
  surface.
- Change responses to Prisma model shapes: rejected because it leaks
  implementation details and risks frontend breakage.

## Decision 8: Roll back by vertical slice

**Decision**: Implement catalog, quote intake, routing/leads, Starter, CRM and
notifications as separate vertical slices. Each slice has its own provider
binding, service async conversion, repository tests and HTTP non-regression.

**Rationale**: Slice rollback is feasible and reduces the risk of breaking the
spec 008 HTTP wiring transition.

**Alternatives considered**:
- Convert all repositories before running HTTP tests: rejected because failures
  become hard to localize.
- Delete transition runtime first: rejected because route ownership remains
  partially transitional.
