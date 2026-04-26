# Data Model: Domain Repositories Extraction AssurMatch

## Repository Binding Model

### RepositoryToken

- **Purpose**: Stable Nest provider token for a domain repository port.
- **Fields**:
  - `name`: exported token name, e.g. `COUNTRIES_REPOSITORY`.
  - `domain`: owning module/domain.
  - `runtimeBinding`: Prisma implementation in runtime-normal modules.
  - `testBinding`: memory-test implementation for unit tests.
- **Validation rules**:
  - Each extracted domain must have exactly one runtime binding.
  - Runtime binding must expose `mode = "prisma-runtime"`.
  - Test binding must expose `mode = "memory-test"`.
  - Non-test module startup fails if a token resolves to memory mode.

### RuntimeRepository

- **Purpose**: Common metadata contract for repository implementations.
- **Fields**:
  - `mode`: `prisma-runtime` or `memory-test`.
- **Relationships**:
  - Implemented by Prisma and memory repositories.
  - Validated by common runtime repository guard.
- **Validation rules**:
  - `memory-test` is allowed only under `NODE_ENV=test` or explicit test
    module configuration.
  - Runtime repositories must not create their own Prisma client.

## Domain Repository Models

### CountriesRepository

- **Backed by**: `Country`, optionally `RegulatoryRegime` when public page data
  needs regime information.
- **Core methods**:
  - `findByIsoCode(countryCode)`
  - `listPublic()`
  - `getPublicPage(countryCode, flags/context)`
  - `create(input, actor)`
  - `update(id, input, actor)`
  - `listAdmin(query)`
- **Rules**:
  - Public reads include only status `public` plus allowed waitlist behavior.
  - Public quote/comparison depends on country flags.
  - Admin mutations remain audited by service layer.

### ProductsRepository

- **Backed by**: `Product`, `CountryProduct`, `ProductCategory`.
- **Core methods**:
  - `findByKey(productKey)`
  - `listPublicForCountry(countryId, flags/context)`
  - `getPublicProduct(countryId, productKey, flags/context)`
  - `associateCountry(productId, countryId, actor)`
  - `create(input, actor)`
  - `update(id, input, actor)`
  - `listAdmin(query)`
- **Rules**:
  - Public reads require active country/product association.
  - Product flags and country-product flags are evaluated before exposure.
  - Sensitive/manual-review flags keep existing semantics.

### OffersRepository

- **Backed by**: `Offer`, `OfferHistory`.
- **Core methods**:
  - `listPublic(countryId, productId, query, now)`
  - `findPublicDetail(offerIdOrPublicKey, now)`
  - `create(input, actor)`
  - `update(id, input, actor)`
  - `appendHistory(offerId, change, actor)`
  - `listAdmin(query)`
- **Rules**:
  - Public offers require valid date window, exposed status and validation.
  - Expired, suspended, retired or unvalidated offers are excluded.
  - Sponsored metadata remains visible when already part of public output.

### ProspectsRepository

- **Backed by**: `Prospect`.
- **Core methods**:
  - `findByFingerprint(countryId, productId, emailFingerprint, phoneFingerprint)`
  - `create(input)`
  - `linkConsent(prospectId, consentRecordId)`
  - `createOrLink(countryId, productId, contact, consentRecordId)`
  - `require(id)`
- **Rules**:
  - Store normalized contact and fingerprints only as currently modeled.
  - Preserve `retentionUntil`.
  - Avoid exposing raw PII in logs/test names.

### ConsentRecordsRepository

- **Backed by**: `ConsentRecord`, and read side may use `ConsentText`.
- **Core methods**:
  - `create(input, actor)`
  - `hasValidConsent(recordId, purpose, countryId, productId)`
  - `findForQuoteScope(...)`
  - `searchRecords(actor, query)`
- **Rules**:
  - Consent must be `granted`, scoped to purpose/country/product and not
    withdrawn/expired.
  - Consent record creation precedes any lead transmission.
  - Admin search requires authorized compliance/support/admin roles.

### QuoteRequestsRepository

- **Backed by**: `QuoteRequest`.
- **Core methods**:
  - `create(input)`
  - `findByPublicReference(publicReference)`
  - `updateRoutingState(id, status, routingStatus, refusalReason)`
  - `updateDuplicateState(id, duplicateStatus)`
  - `listAdmin(query)`
  - `transaction(callback)`
- **Rules**:
  - `publicReference` is unique and stable.
  - Retention and correlationId are preserved.
  - Quote submission creates no assignment without valid consent.

### LeadAssignmentsRepository

- **Backed by**: `LeadAssignment`, `LeadActionHistory`, optionally
  `QuoteRequest` joins for broker-visible details.
- **Core methods**:
  - `create(input, actor)`
  - `findByIdForTenant(id, partnerTenantId)`
  - `listForTenant(partnerTenantId, query)`
  - `listCrmForTenant(partnerTenantId, query)`
  - `updateStatus(id, partnerTenantId, status, actor, reason)`
  - `updateCrmMetadata(id, partnerTenantId, input, actor)`
  - `activeCountForPartner(partnerTenantId)`
  - `appendHistory(input)`
- **Rules**:
  - Every broker read/mutation is tenant-scoped.
  - Cross-tenant absence is indistinguishable from not found/forbidden per
    existing HTTP policy.
  - Status transitions preserve existing Starter and CRM behavior.

### RoutingDecisionsRepository

- **Backed by**: `RoutingDecision`, optionally `RoutingPrecheck`.
- **Core methods**:
  - `createDecision(input)`
  - `findForQuoteRequest(quoteRequestId)`
  - `listRefusals(query)`
- **Rules**:
  - Store candidate count, excluded candidates, reasons and correlationId.
  - No new routing policy is encoded here; service decides eligibility.

### PartnersRepository

- **Backed by**: `PartnerTenant`, `PartnerCountryAuthorization`,
  `PartnerProductAuthorization`.
- **Core methods**:
  - `create(input, actor)`
  - `update(id, input, actor)`
  - `require(id)`
  - `list(query)`
  - `authorizeCountry(partnerTenantId, countryId, actor)`
  - `authorizeProduct(partnerTenantId, productId, actor)`
  - `isAuthorizedForCountry(partnerTenantId, countryId)`
  - `isAuthorizedForProduct(partnerTenantId, productId)`
  - `findEligibleCandidates(countryId, productId)`
- **Rules**:
  - Active status, plan, capacity and authorizations are exposed to eligibility
    services.
  - Suspension reason remains required for suspended partners.

### PartnerLicensesRepository

- **Backed by**: `PartnerLicense`.
- **Core methods**:
  - `create(input, actor)`
  - `validate(id, actor)`
  - `listForPartner(partnerTenantId)`
  - `eligible(partnerTenantId, countryId, productId, now)`
  - `require(id)`
- **Rules**:
  - Valid license requires status `valid`, expiration after `now`, matching
    country and matching product if product scope is set.
  - Expired/suspended/invalid/revoked licenses block activation/routing.

### CRMActivityRepository

- **Backed by**: `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`,
  `BrokerCrmNote`, `BrokerCrmTask`, `BrokerCrmReminder`,
  `BrokerCrmDocument`, `BrokerCrmProposal`, `BrokerCrmDispute`.
- **Core methods**:
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
- **Rules**:
  - Every method is tenant-scoped.
  - Starter brokers never access CRM methods through service policy.
  - `broker_crm_enabled` false/absent blocks CRM before repository mutation.

### NotificationsRepository

- **Backed by**: `Notification`, `QueueJobRecord`.
- **Core methods**:
  - `createQueued(input, jobRecord, actor)`
  - `updateDelivery(id, statuses)`
  - `list(query)`
  - `findForRecipientScope(scope, query)`
- **Rules**:
  - Notification traces are durable; queue execution still uses BullMQ/QueuePort.
  - Payload references, not raw PII payloads, are persisted.

### FeatureFlagsRepository

- **Backed by**: `FeatureFlag`, `FeatureFlagHistory`.
- **Current status**: Exists; align with provider injection/runtime guard.
- **Rules**:
  - PostgreSQL remains source of truth.
  - Redis cache is acceleration only.
  - Sensitive absent/false/invalid values fail closed.

### AuditLogsRepository

- **Backed by**: `AuditLog`.
- **Current status**: Exists; align with provider injection/runtime guard.
- **Rules**:
  - Sensitive success/refusal events are durable.
  - Admin reads are permission-gated, paginated and PII-minimized.

## State Transitions

### Quote Request

```text
draft/refused input
  -> created
  -> manual_review
  -> routed
  -> non_routable
  -> duplicate
  -> spam_blocked
  -> cancelled
```

- `created`: durable quote exists after valid consent.
- `manual_review`: product/manual review requires no immediate routing.
- `routed`: assignment exists for eligible broker.
- `non_routable`: no eligible broker or blocker, with refusal reason.
- `duplicate` / `spam_blocked`: duplicate/spam controls applied.

### Lead Assignment

```text
assigned -> broker_notified -> seen -> accepted/received/contacted
assigned -> rejected
assigned -> disputed
any active state -> closed
```

- All transitions are tenant-scoped.
- Starter actions use assignment status/history.
- CRM actions can add pipeline metadata without exposing Starter CRM.

### CRM Pipeline

```text
nouveau -> accepte -> contact_tente -> contacte -> qualifie
  -> documents_demandes -> devis_en_preparation -> devis_envoye
  -> negociation -> gagne/perdu/doublon/injoignable/hors_cible/rejete_conteste
```

- Pipeline transitions require Pro/Enterprise plan and `broker_crm_enabled`.
- History is persisted in `BrokerCrmPipelineHistory`.

### Consent Record

```text
granted -> withdrawn
granted -> expired
granted -> anonymized
```

- Only `granted` scoped consent permits transmission.
- Withdrawn/expired/anonymized records do not authorize routing.

## Relationships

- `Country` has many `CountryProduct`, `Offer`, `ConsentRecord`,
  `QuoteRequest`, `PartnerLicense`.
- `Product` has many `CountryProduct`, `Offer`, `ConsentRecord`,
  `QuoteRequest`.
- `ConsentRecord` is linked to `QuoteRequest` by `consentRecordId`.
- `Prospect` is linked to `QuoteRequest` by `prospectId` and stores
  `consentRecordIds`.
- `QuoteRequest` has at most one active `LeadAssignment` by schema unique
  `quoteRequestId`.
- `LeadAssignment` belongs to one `partnerTenantId` and can have many history
  and CRM activity records.
- `PartnerTenant` has country/product authorizations and licenses.
- `RoutingDecision` links to `QuoteRequest` and optional selected partner.
- `Notification` may reference `QueueJobRecord` and related audit log.

## Validation Rules

- Public repository reads must apply public status/flag/validity filters.
- Broker repository reads must take `partnerTenantId` or be wrapped by a
  service method that scopes by tenant before returning data.
- Quote creation must not persist assignment or broker notification without
  valid consent.
- Routing must not select inactive, unauthorized, expired-license or
  quota/capacity-blocked partners.
- CRM activity mutations require service-level plan/flag/RBAC checks before
  repository mutation.
- Repository list methods for broker/admin surfaces must be bounded or
  paginated.
- Memory repositories are invalid outside test runtime.
- Audit writes for sensitive actions remain durable and PII-minimized.
