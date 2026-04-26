# Repository Extraction Contract

This contract defines the runtime and test obligations for spec
009-domain-repositories-extraction. It is an internal backend contract for
providers, repositories, services and HTTP non-regression tests. It does not add
new external API routes.

## Repository Provider Contract

Each extracted repository must expose:

```ts
interface RuntimeRepository {
  readonly mode: "prisma-runtime" | "memory-test";
}
```

Each domain module must export a stable provider token:

```ts
export const COUNTRIES_REPOSITORY = Symbol("COUNTRIES_REPOSITORY");
```

Runtime-normal provider binding:

```ts
{
  provide: COUNTRIES_REPOSITORY,
  useClass: PrismaCountriesRepository
}
```

Test provider binding:

```ts
{
  provide: COUNTRIES_REPOSITORY,
  useClass: MemoryCountriesRepository
}
```

Required guard:

```ts
assertRuntimeRepository(repository.mode, "CountriesRepository");
```

The guard must fail outside `NODE_ENV=test` when `mode === "memory-test"`.

## Required Repository Ports

### CountriesRepository

- `findByIsoCode(countryCode)`
- `listPublic()`
- `getPublicPage(countryCode, context)`
- `listAdmin(query)`
- `create(input, actor)`
- `update(id, input, actor)`

### ProductsRepository

- `findByKey(productKey)`
- `listPublicForCountry(countryId, context)`
- `getPublicProduct(countryId, productKey, context)`
- `associateCountry(productId, countryId, actor)`
- `listAdmin(query)`
- `create(input, actor)`
- `update(id, input, actor)`

### OffersRepository

- `listPublic(countryId, productId, query, now)`
- `findPublicDetail(offerIdOrPublicKey, now)`
- `listAdmin(query)`
- `create(input, actor)`
- `update(id, input, actor)`
- `appendHistory(offerId, change, actor)`

### ProspectsRepository

- `findByFingerprint(countryId, productId, emailFingerprint, phoneFingerprint)`
- `create(input)`
- `linkConsent(prospectId, consentRecordId)`
- `createOrLink(countryId, productId, contact, consentRecordId)`
- `require(id)`

### ConsentRecordsRepository

- `create(input, actor)`
- `hasValidConsent(recordId, purpose, countryId, productId)`
- `findForQuoteScope(input)`
- `searchRecords(actor, query)`

### QuoteRequestsRepository

- `create(input)`
- `findByPublicReference(publicReference)`
- `updateRoutingState(id, input)`
- `updateDuplicateState(id, duplicateStatus)`
- `listAdmin(query)`
- `transaction(callback)`

### LeadAssignmentsRepository

- `create(input, actor)`
- `findByIdForTenant(id, partnerTenantId)`
- `listForTenant(partnerTenantId, query)`
- `listCrmForTenant(partnerTenantId, query)`
- `updateStatus(id, partnerTenantId, status, actor, reason)`
- `updateCrmMetadata(id, partnerTenantId, input, actor)`
- `activeCountForPartner(partnerTenantId)`
- `appendHistory(input)`

### PartnersRepository

- `create(input, actor)`
- `update(id, input, actor)`
- `require(id)`
- `list(query)`
- `authorizeCountry(partnerTenantId, countryId, actor)`
- `authorizeProduct(partnerTenantId, productId, actor)`
- `isAuthorizedForCountry(partnerTenantId, countryId)`
- `isAuthorizedForProduct(partnerTenantId, productId)`
- `findEligibleCandidates(countryId, productId)`

### PartnerLicensesRepository

- `create(input, actor)`
- `validate(id, actor)`
- `listForPartner(partnerTenantId)`
- `eligible(partnerTenantId, countryId, productId, now)`
- `require(id)`

### RoutingDecisionsRepository

- `createDecision(input)`
- `findForQuoteRequest(quoteRequestId)`
- `listRefusals(query)`

### CRMActivityRepository

- `getLeadState(leadAssignmentId, partnerTenantId)`
- `upsertLeadState(input, actor)`
- `appendPipelineHistory(input)`
- `addNote(input, actor)`
- `addTask(input, actor)`
- `addReminder(input, actor)`
- `addDocument(input, actor)`
- `addProposal(input, actor)`
- `addDispute(input, actor)`
- `listActivityForLead(leadAssignmentId, partnerTenantId)`
- `overdueTaskCount(partnerTenantId, actorId, now)`

### NotificationsRepository

- `createQueued(input, jobRecord, actor)`
- `updateDelivery(id, statuses)`
- `list(query)`
- `findForRecipientScope(scope, query)`

## Prisma Runtime Contract

Prisma repositories must:

- receive `PrismaService` by Nest injection;
- declare `mode = "prisma-runtime"`;
- use existing Prisma models before requesting migrations;
- map Prisma `Date`, `Decimal`, `Json` and enum values to existing domain
  record/DTO types;
- preserve retention, timestamps, correlationId and createdBy fields;
- use transactions for multi-entity quote creation where partial persistence
  would violate compliance;
- never instantiate `PrismaClient` directly.

## Memory Test Adapter Contract

Memory repositories must:

- declare `mode = "memory-test"`;
- be named `Memory...Repository` or `...TestRepository`;
- live in test helpers or explicitly test-only modules unless existing source
  is being migrated gradually;
- be rejected outside test runtime by `assertRuntimeRepository`;
- preserve the same domain behavior as the Prisma port for unit-level service
  tests;
- not be selected silently when `DATABASE_URL` or Prisma runtime is missing.

## Service Boundary Contract

Services must:

- keep validation, routing decisions, consent policy, publication policy,
  plan/flag checks and audit orchestration outside repositories;
- use repositories for persistence and scoped reads;
- pass tenant scope into broker/CRM repository reads;
- keep public routes independent from broker/admin actor state;
- keep broker/admin routes protected by existing auth, RBAC, MFA, read-only and
  tenant policies;
- audit sensitive success/refusal events durably.

## HTTP Non-Regression Contract

The following existing route families must remain stable unless a documented
compatibility-safe correction is approved:

- Public catalog: `GET /countries`, country/product public reads, offer public
  reads.
- Public quote: quote form/status if already exposed and `POST /quote-requests`.
- Broker Starter: dashboard, leads, detail, history, accept, reject, dispute,
  notifications, plan capabilities and export if already exposed.
- Broker CRM: dashboard, list, kanban, detail, status, notes, tasks, reminders,
  assign, documents, proposals, disputes, notifications and AI foundations if
  already exposed.
- Admin/support routes touched by repositories: feature flags, audit logs,
  quote requests, lead assignments, countries, products, offers, partners,
  partner licenses, consent, notifications and routing precheck.

Non-regression tests must prove:

- repository-backed seeded data appears through existing routes;
- no-consent requests create no assignment or broker notification;
- Starter cannot access CRM;
- CRM fails closed when `broker_crm_enabled` is absent or false;
- cross-tenant reads/mutations are denied without confirming resource
  existence;
- public responses do not leak broker/admin details.

## Migration Contract

Migrations are allowed only when implementation proves a missing schema element
for already-specified behavior. Any migration must:

- preserve fresh database reconstruction;
- keep sensitive defaults closed;
- avoid adding new business capability;
- update tests and seed fixtures;
- preserve existing HTTP contracts.

## AssurMatchRuntime Residual Contract

After each extracted slice, implementation must maintain a residual inventory:

| Domain | Still in AssurMatchRuntime? | Reason | Exit criterion |
|--------|------------------------------|--------|----------------|
| Countries | No after catalog slice | N/A | Repository/provider HTTP tests pass |
| Products | No after catalog slice | N/A | Repository/provider HTTP tests pass |
| Offers | No after catalog slice | N/A | Repository/provider HTTP tests pass |
| Quote flow | No after quote slice | N/A | Transactional quote tests pass |
| Leads/routing | No after routing slice | N/A | Starter/CRM/routing tests pass |
| Remaining routes | Temporary | Spec 008 transition | Route owner migrated and tested |

Any new primary domain state added to `AssurMatchRuntime` for an extracted
domain is a contract violation.
