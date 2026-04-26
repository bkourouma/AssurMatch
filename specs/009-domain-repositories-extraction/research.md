# Research: Domain Repositories Extraction AssurMatch

## Decision 1: Use domain-owned repository ports and Nest provider tokens

**Decision**: Each extracted domain owns a repository interface/port and provider
token in its module. App/runtime modules bind the token to a Prisma runtime
implementation, while tests may bind it to an explicit memory-test adapter.

**Rationale**: AssurMatch domains have different safety constraints. Public
catalog reads, quote submission, lead routing, CRM activity and audit do not
share the same tenant, consent, retention or visibility rules. Domain-owned
ports keep those boundaries explicit and make service tests focused.

**Alternatives considered**:
- One generic repository abstraction: rejected because it hides tenant,
  consent and public-filter semantics.
- Keep repositories behind `AssurMatchRuntime`: rejected because it preserves
  the transition facade as source of truth.
- Expose raw Prisma client directly to services: rejected because it spreads
  persistence details and makes test-only bindings harder.

## Decision 2: Keep Prisma as the only runtime-normal persistence adapter

**Decision**: Runtime-normal repositories use Prisma through `PrismaService`.
No domain repository may silently fall back to memory outside `NODE_ENV=test` or
an explicitly named test mode.

**Rationale**: The constitution requires durable consent, audit, routing and
lead state. Spec 007 established Prisma/PostgreSQL as source of truth and
memory adapters as test-only. This feature extends that rule from audit/flags
to the domain repositories.

**Alternatives considered**:
- Allow memory fallback when `DATABASE_URL` is missing: rejected because it can
  mask production misconfiguration and lose compliance evidence.
- Keep hybrid memory/Prisma state during runtime migration: rejected for
  extracted domains because it creates divergence.

## Decision 3: Reuse existing Prisma schema before adding migrations

**Decision**: Implementation starts from existing models in
`backend/prisma/schema.prisma`. New migrations are allowed only when a field or
model is missing for behavior already promised by specs 001-008.

**Rationale**: The schema already contains countries, products, country/product
links, offers, prospects, quote requests, consent, lead assignments, lead
history, CRM activity, partners, partner licenses, routing decisions,
notifications, queue job records, audit logs and feature flags. Adding schema
without a proven gap risks creating accidental new scope.

**Alternatives considered**:
- Create a new repository-specific schema layer: rejected because it duplicates
  the durable model.
- Add relations/indexes up front without implementation proof: rejected because
  this planning phase should avoid speculative migrations.

## Decision 4: Keep business rules in services and policies

**Decision**: Repositories own persistence queries/mutations and safe scope
filters. They do not become the source of complex business decisions such as
lead routing eligibility, publication policy, consent policy or CRM plan rules.

**Rationale**: Existing services/policies already express constitutional
decisions. Moving those rules into repositories would make them harder to audit
and could create duplicate behavior between memory and Prisma adapters.

**Alternatives considered**:
- Put all filtering/rules into Prisma queries: partially rejected. Tenant and
  public visibility filters belong in repository methods, but final decisions
  stay in services/policies.
- Keep rules and state together in memory services: rejected because state must
  become durable and injectable.

## Decision 5: Extract by vertical slices, not by a single backend rewrite

**Decision**: Extract progressively in vertical slices: repository foundation,
catalog, quote flow, routing/assignments, Starter, CRM, notifications and
finally runtime facade cleanup.

**Rationale**: Spec 008 still allows a transition facade. A vertical slice can
be protected by HTTP non-regression tests and repository/service tests before
the next slice moves.

**Alternatives considered**:
- Remove `AssurMatchRuntime` immediately: rejected as high-risk for route
  compatibility.
- Extract every repository first, then wire services later: rejected because it
  delays useful runtime validation and leaves untested adapters.

## Decision 6: Use explicit runtime guardrails for memory adapters

**Decision**: Add guardrails at both provider resolution and source-level tests:
repository mode assertion outside test, and a scan for new arrays/maps used as
source-of-truth in extracted domains.

**Rationale**: Existing code contains several `private readonly ...[] = []`
fields and some `Map` state. The desired architecture must prevent
reintroduction after domains are extracted, not only migrate current code.

**Alternatives considered**:
- Rely on code review: rejected because the constitution asks for executable
  tests.
- Ban all arrays/maps globally: rejected because transient local collections
  and queue/cache test adapters still need them.

## Decision 7: Preserve HTTP contracts and frontend app boundaries

**Decision**: Repository extraction must be invisible to existing public,
Starter, CRM and touched admin routes except for compatibility-safe fixes.
Frontend apps are not feature scopes.

**Rationale**: The user explicitly excluded new frontend screens and business
features. The constitution requires separate public and back-office apps.
HTTP non-regression is the right acceptance boundary for this technical work.

**Alternatives considered**:
- Change response contracts to mirror Prisma models: rejected because it would
  leak implementation details and risk frontend breakage.
- Add new endpoints for repository-backed behavior: rejected because no new
  business feature is in scope.

## Decision 8: Seed only what tests need, keep runtime defaults closed

**Decision**: Use test fixtures for repository/HTTP acceptance data. Runtime
seed remains minimal and closed by default for sensitive modules.

**Rationale**: Tests need active countries/products/offers, consent texts,
eligible partners/licenses, actors and flags. Runtime defaults must not
activate CRM, AI, payment, policy issuance or other regulated modules by
accident.

**Alternatives considered**:
- Make seed data broadly production-like: rejected because it can activate
  features accidentally.
- Avoid seed helpers and construct data ad hoc in every test: rejected because
  it increases drift and makes constitutional cases harder to audit.
