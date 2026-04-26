# Data Model: Prisma Domain Persistence AssurMatch

## Repository Runtime Model

### RuntimeRepository

- **Purpose**: Common metadata contract for runtime and test repositories.
- **Fields**:
  - `mode`: `prisma-runtime` or `memory-test`.
- **Validation rules**:
  - `memory-test` is rejected outside test.
  - `prisma-runtime` classes must not contain incomplete methods.
  - Runtime Prisma repositories receive `PrismaService` by injection.

### RepositoryToken

- **Purpose**: Stable provider token for each domain repository.
- **Fields**:
  - `tokenName`: exported symbol, for example `COUNTRIES_REPOSITORY`.
  - `domain`: owning module.
  - `port`: TypeScript interface.
  - `runtimeBinding`: Prisma implementation.
  - `testBinding`: memory-test implementation.
- **Validation rules**:
  - Exactly one runtime binding per priority domain in runtime modules.
  - Test bindings are explicit and not selected by default.

## Priority Domain Model Coverage

### CountriesRepository

- **Backed by**: `Country`.
- **Current port methods**: `create`, `update`, `list`, `listPublic`,
  `findByIsoCode`, `require`.
- **Planned async methods**: same method families, returning promises.
- **Mappings**:
  - Prisma `isoCode`, `status`, `flags`, `regulatoryFamily`, timestamps to
    existing country domain type.
- **Rules**:
  - Public list includes status/flag combinations accepted by existing
    services.
  - Admin mutations remain audited by service layer.

### ProductsRepository

- **Backed by**: `Product`, `CountryProduct`, optionally `ProductCategory`.
- **Current port methods**: `create`, `update`, `associateCountry`, `list`,
  `listPublic`, `findByKey`, `require`.
- **Mappings**:
  - `countryIds` in current domain records maps through `CountryProduct`.
  - Product and country-product `flags` are both considered where existing
    services require them.
- **Rules**:
  - Public reads require public product status and enabled product flags.
  - Country/product association must exist and be active enough for the route
    behavior already accepted.

### OffersRepository

- **Backed by**: `Offer`, `OfferHistory`.
- **Current port methods**: `create`, `update`, `appendHistory`, `list`,
  `history`, `require`.
- **Mappings**:
  - Decimal values map to existing numeric/string DTO expectations without
    changing public contracts.
  - Public key, validity, sponsor fields and disclaimers remain preserved.
- **Rules**:
  - Public offers require accepted status, validation status and active date
    window.
  - History is appended for admin/service changes already audited by behavior.

### ConsentRecordsRepository

- **Backed by**: `ConsentText`, `ConsentRecord`.
- **Current port methods**: `createText`, `updateText`, `listTexts`,
  `createRecord`, `hasValidConsent`, `searchRecords`, `requireText`.
- **Rules**:
  - Valid consent is `granted`, scoped to purpose/country/product and not
    withdrawn/expired.
  - Consent text search/management remains admin/compliance-scoped.
  - Consent creation precedes any lead transmission.

### ProspectsRepository

- **Backed by**: `Prospect`.
- **Current port methods**: `createOrLink`, `list`, `require`.
- **Mappings**:
  - Existing normalized email/phone and fingerprints map directly to
    `emailNormalized`, `phoneNormalized`, `emailFingerprint`,
    `phoneFingerprint`.
  - `consentRecordIds` remains the link list until a future spec introduces a
    relational join.
- **Rules**:
  - Create-or-link uses country/product plus email or phone fingerprint.
  - PII remains masked from logs.

### QuoteRequestsRepository

- **Backed by**: `QuoteRequest`.
- **Current port methods**: `create`, `update`, `findByPublicReference`,
  `list`.
- **Mappings**:
  - Existing quote statuses map to `QuoteRequestStatus`,
    `DuplicateStatus`, `RoutingStatus`.
  - Payload remains JSON with existing validation at DTO/service boundary.
- **Rules**:
  - `publicReference` remains unique and stable.
  - Quote creation must not imply routing when consent is absent.

### PartnersRepository

- **Backed by**: `PartnerTenant`, `PartnerCountryAuthorization`,
  `PartnerProductAuthorization`.
- **Current port methods**: `create`, `update`, `require`, `list`,
  `authorizeCountry`, `authorizeProduct`, `isAuthorizedForCountry`,
  `isAuthorizedForProduct`.
- **Rules**:
  - Active status, plan, capacity, quotas and authorizations feed eligibility.
  - Authorizations are explicit records, not in-memory maps.

### PartnerLicensesRepository

- **Backed by**: `PartnerLicense`.
- **Current port methods**: `create`, `update`, `listForPartner`, `eligible`,
  `require`.
- **Rules**:
  - Eligible license has status `valid`, matching country, non-expired
    expiration date and matching product when product scope is populated.
  - Expired, suspended, invalid and revoked block routing/activation.

### RoutingDecisionsRepository

- **Backed by**: `RoutingDecision`.
- **Current port methods**: `create`, `list`.
- **Rules**:
  - Store result, selected partner, candidate count, excluded candidates,
    reasons and correlation id.
  - Repository does not decide eligibility; services do.

### LeadAssignmentsRepository

- **Backed by**: `LeadAssignment`, `LeadActionHistory`.
- **Current port methods**: `create`, `update`, `activeCountForPartner`,
  `list`, `require`, `updateStatus`, `appendHistory`, `historyForLead`,
  `historyForTenant`.
- **Rules**:
  - Broker read/mutation methods must include tenant scope in implementation or
    be wrapped by tenant-scoped service methods.
  - One active assignment per quote request follows existing schema unique
    constraint.

### CRMActivityRepository

- **Backed by**: `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`,
  `BrokerCrmNote`, `BrokerCrmTask`, `BrokerCrmReminder`,
  `BrokerCrmDocument`, `BrokerCrmProposal`, `BrokerCrmDispute`.
- **Current port methods**: append/list pipeline history and add/list notes,
  tasks, reminders, documents, proposals, disputes.
- **Rules**:
  - Every read/write is tenant-scoped through lead assignment or explicit
    `partnerTenantId`.
  - Starter brokers are blocked before repository access.
  - `broker_crm_enabled` false or absent blocks CRM mutation.

### NotificationsRepository

- **Backed by**: `Notification`, `QueueJobRecord` where job trace persistence is
  part of the existing service.
- **Current port methods**: `create`, `updateDelivery`, `list`,
  `mutableList`.
- **Rules**:
  - Runtime Prisma implementation must not expose mutable in-memory lists.
  - Persist payload references, statuses, retry count and queue job link.
  - Delivery remains asynchronous.

### AuditLogRepository

- **Backed by**: `AuditLog`.
- **Status**: Already Prisma-runtime.
- **Rules**:
  - Keep durable writes for sensitive actions/refusals.
  - Align with common guard metadata and do not regress to memory.

### FeatureFlagRepository

- **Backed by**: `FeatureFlag`, `FeatureFlagHistory`.
- **Status**: Already Prisma-runtime.
- **Rules**:
  - PostgreSQL remains source of truth.
  - Redis cache is acceleration only.
  - Sensitive absent/invalid/unreadable values fail closed.

## State Transitions

### Quote Request

```text
created -> manual_review
created -> routed
created -> non_routable
created -> duplicate
created -> spam_blocked
created -> cancelled
```

- `created`: durable quote exists after valid consent.
- `routed`: durable assignment exists.
- `non_routable`: durable refusal/routing decision exists.
- `duplicate` and `spam_blocked`: no forbidden broker transmission.

### Lead Assignment

```text
assigned -> broker_notified -> seen -> accepted/received/contacted
assigned -> rejected
assigned -> disputed
any active state -> closed
```

- All transitions are tenant-scoped.
- History writes go to `LeadActionHistory`.

### CRM Pipeline

```text
nouveau -> accepte -> contact_tente -> contacte -> qualifie
  -> documents_demandes -> devis_en_preparation -> devis_envoye
  -> negociation -> gagne/perdu/doublon/injoignable/hors_cible/rejete_conteste
```

- Requires Pro/Enterprise scope and `broker_crm_enabled`.
- History writes go to `BrokerCrmPipelineHistory`.

### Consent Record

```text
granted -> withdrawn
granted -> expired
granted -> anonymized
```

- Only `granted` scoped consent allows transmission.
- Withdrawn/expired/anonymized consent blocks routing.

## Validation Rules

- Public reads apply public status, feature flags and validity windows.
- Broker reads/mutations are tenant-scoped and do not confirm cross-tenant
  resource existence.
- Quote submission is atomic for critical durable entities.
- No-consent paths create no assignment and no broker notification.
- Routing excludes inactive, unauthorized, expired-license and quota/capacity
  blocked partners.
- CRM mutations require plan, flag, RBAC and read-only checks before write.
- Repository lists for broker/admin routes are bounded or paginated.
- Memory repositories are invalid outside test runtime.
- Sensitive audit writes remain durable and PII-minimized.
