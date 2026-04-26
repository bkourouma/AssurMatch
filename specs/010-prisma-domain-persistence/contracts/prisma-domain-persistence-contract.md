# Prisma Domain Persistence Contract

This contract defines the internal backend obligations for spec
010-prisma-domain-persistence. It adds no new external API route and no new
business capability.

## Runtime Repository Contract

Every priority repository implementation must expose:

```ts
interface RuntimeRepository {
  readonly mode: "prisma-runtime" | "memory-test";
}
```

Runtime binding shape:

```ts
{
  provide: COUNTRIES_REPOSITORY,
  useClass: PrismaCountriesRepository
}
```

Test binding shape:

```ts
{
  provide: COUNTRIES_REPOSITORY,
  useClass: MemoryCountriesRepository
}
```

Runtime modules must reject `mode = "memory-test"` outside `NODE_ENV=test`.

## Async Port Contract

Priority repository ports must be async in runtime-capable code:

- create/update methods return `Promise<Record>`.
- list/search methods return `Promise<Record[]>`.
- find methods return `Promise<Record | undefined>`.
- require methods return `Promise<Record>` and throw standardized not-found
  errors compatible with existing services.
- boolean checks return `Promise<boolean>`.

Services and controllers must await these calls and preserve existing response
contracts.

## Prisma Implementation Contract

Prisma repositories must:

- declare `mode = "prisma-runtime"`;
- receive `PrismaService` by Nest injection;
- use `PrismaService`/runtime Prisma client, never instantiate `PrismaClient`
  directly;
- implement every method on the port;
- map Prisma `Date`, `Decimal`, `Json`, arrays and enums to existing domain
  records/DTOs;
- preserve timestamps, retention, correlation ids and createdBy fields where
  modeled;
- use transactions for quote/consent/prospect/request/routing/assignment flows
  where partial persistence would violate compliance;
- not expose raw Prisma model shapes directly to public/broker API consumers.

Forbidden in Prisma runtime classes:

- `throw new Error("requires async Prisma service integration")`;
- TODO/non-implemented runtime errors;
- silent fallback to memory arrays/maps;
- direct business feature activation.

## Priority Repository Method Families

### Catalog

- `CountriesRepository`: create, update, list, listPublic, findByIsoCode,
  require.
- `ProductsRepository`: create, update, associateCountry, list, listPublic,
  findByKey, require.
- `OffersRepository`: create, update, appendHistory, list, history, require.

### Quote Intake

- `ConsentRecordsRepository`: createText, updateText, listTexts, createRecord,
  hasValidConsent, searchRecords, requireText.
- `ProspectsRepository`: createOrLink, list, require.
- `QuoteRequestsRepository`: create, update, findByPublicReference, list.

### Routing And Leads

- `PartnersRepository`: create, update, require, list, authorizeCountry,
  authorizeProduct, isAuthorizedForCountry, isAuthorizedForProduct.
- `PartnerLicensesRepository`: create, update, listForPartner, eligible,
  require.
- `RoutingDecisionsRepository`: create, list.
- `LeadAssignmentsRepository`: create, update, activeCountForPartner, list,
  require, updateStatus, appendHistory, historyForLead, historyForTenant.

### CRM And Notifications

- `CRMActivityRepository`: appendPipelineHistory, pipelineHistoryForLead,
  add/list notes, tasks, reminders, documents, proposals and disputes.
- `NotificationsRepository`: create, updateDelivery, list. `mutableList` must
  be removed from runtime usage or replaced by explicit test-only access.

### Existing Durable Support Repositories

- `AuditLogRepository`: persist remains durable through Prisma.
- `FeatureFlagRepository`: list, upsert and historyFor remain durable through
  Prisma.

## Memory Test Adapter Contract

Memory adapters must:

- declare `mode = "memory-test"`;
- be named `Memory...Repository` or `...TestRepository`;
- be selected only by unit tests or explicit test modules;
- mirror domain behavior needed by service tests;
- be rejected outside test runtime;
- never be used as fallback for missing Prisma configuration.

## Service Boundary Contract

Services must keep these responsibilities outside repositories:

- consent policy and no-consent refusal;
- public catalog publication policy;
- lead routing eligibility and deterministic partner selection;
- RBAC, MFA, read-only and plan checks;
- tenant isolation decisions;
- feature flag fail-closed behavior;
- audit orchestration for sensitive actions;
- notification delivery orchestration.

Repositories may enforce safe query scoping, such as public filters and
tenant-scoped reads, but must not introduce new business behavior.

## HTTP Non-Regression Contract

Existing routes must remain stable unless a compatible correction is documented
and tested:

```text
GET /countries
GET /countries/:countryCode/products
GET /countries/:countryCode/products/:productKey/offers
POST /quote-requests
GET /broker/starter/leads
GET /broker/crm/leads
```

The same applies to existing quote status/form, Starter detail/actions,
CRM detail/activity, notifications and touched admin routes.

Tests must prove:

- route data comes from seeded PostgreSQL state;
- no-consent requests create no assignment or broker notification;
- Starter cannot access CRM;
- CRM fails closed when `broker_crm_enabled` is absent or false;
- cross-tenant reads/mutations are denied;
- public responses do not expose broker/admin-only data.

## Migration Contract

Migrations are allowed only when required for behavior already specified by
specs 001-010. Any migration must:

- preserve fresh database reconstruction;
- keep sensitive defaults closed;
- avoid new product/business capability;
- include schema/migration tests;
- update fixture/seed documentation.

## Rollback Contract

- Each vertical slice must be revertible independently.
- Revert provider binding and service async changes for a failing slice before
  proceeding.
- Do not rollback to memory fallback in runtime-normal modules.
- If a migration fails fresh reconstruction, revert or fix the migration before
  shipping the slice.
- If an API response drifts, restore the mapper/contract rather than changing
  frontend consumers.
