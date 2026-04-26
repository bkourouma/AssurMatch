# Research: API Runtime Integration AssurMatch

## Decision: Use real Nest modules and DI as the runtime boundary

**Rationale**: The audit finding is that the API exposes zero real routes
because `AppModule` and modules are manually instantiating classes. The
constitutional architecture requires a NestJS modular backend with thin
controllers and injected services. Real `@Module`, `@Controller`, route
decorators and guards are therefore the central correction.

**Alternatives considered**:
- Keep manual modules and add an HTTP adapter around them: rejected because
  guards, OpenAPI and Nest testing would still not prove real route behavior.
- Rewrite to a different backend framework: rejected as a total architecture
  refactor outside scope.

## Decision: Preserve existing business services, move persistence behind repositories

**Rationale**: Specs 001-004 already produced meaningful business rules. The
runtime integration should not rewrite those rules. Repository interfaces allow
services to keep behavior while replacing memory arrays with Prisma-backed
runtime stores.

**Alternatives considered**:
- Rewrite services around Prisma directly: rejected because it risks changing
  business behavior and making tests brittle.
- Keep memory stores in production temporarily: rejected because audit,
  consent, routing, leads and flags must be durable.

## Decision: Prisma/PostgreSQL is the runtime source of truth

**Rationale**: The constitution names PostgreSQL as source of truth and Prisma
as recommended ORM. `schema.prisma` already contains models for 001-004, so
the plan focuses on migration correctness, real `PrismaService` and repository
alignment.

**Alternatives considered**:
- Add another persistence layer: rejected as unnecessary and inconsistent.
- Use Prisma only in tests later: rejected because runtime behavior must be
  durable and restart-safe.

## Decision: Redis and BullMQ are real runtime dependencies outside tests

**Rationale**: Redis is required for cache, flags, rate limiting, anti-spam,
duplicates and locks; BullMQ is required for async notifications/jobs. Memory
adapters are useful only for unit isolation.

**Alternatives considered**:
- Continue in-memory runtime queues: rejected because they lose jobs and do not
  prove operational behavior.
- Perform notifications synchronously in public endpoints: rejected because
  public endpoints must avoid heavy synchronous work.

## Decision: Use shared Zod contracts for validation and align OpenAPI to controllers

**Rationale**: `packages/shared/contracts` already contains Zod schemas used by
tests/services. Keeping them avoids schema drift. OpenAPI must still be
validated against actual decorated controllers because generated contracts
without routes were part of the audit problem.

**Alternatives considered**:
- Hand-maintain OpenAPI only: rejected because drift risk is high.
- Ignore OpenAPI until after implementation: rejected because contract/runtime
  mismatch is a core issue of this feature.

## Decision: Auth can remain JWT/session choice as long as ActorContext is trusted

**Rationale**: The spec does not require changing the auth product decision.
The constitutional requirement is reliable identity, MFA, RBAC, tenant scope
and audit. The implementation can use the existing auth direction if route
guards produce a trusted ActorContext.

**Alternatives considered**:
- Force a new OAuth/session design now: rejected as out of scope.
- Use static actors in tests/runtime: rejected because guards would not protect
  real routes.

## Decision: Frontend work is data-source replacement, not UI redesign

**Rationale**: The user explicitly excluded UI refactor. The public and
back-office apps must keep separate routes/layouts and replace critical mocks
with API clients plus loading/error/empty states.

**Alternatives considered**:
- Merge broker/admin into public app for convenience: rejected by constitution.
- Redesign pages while wiring API: rejected as scope creep.

## Decision: Implementation should proceed in thin vertical runtime slices

**Rationale**: Converting all storage, controllers and frontends at once is
risky. A route inventory plus public catalog slice proves Nest wiring early;
then persistence/security/frontend/test slices can be added without changing
business behavior.

**Alternatives considered**:
- Big-bang rewrite: rejected due to high regression risk.
- Only add tests first: rejected because there are currently no real routes to
  test.
