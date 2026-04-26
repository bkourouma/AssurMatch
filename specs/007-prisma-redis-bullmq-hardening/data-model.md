# Data Model: Prisma Redis BullMQ Hardening AssurMatch

## Runtime Adapter Entities

### RuntimeConfig

- **Purpose**: Validated runtime mode and dependency configuration.
- **Fields**: `nodeEnv`, `appEnv`, `databaseUrl`, `redisUrl`, queue namespace,
  memory override flags, production marker, degraded mode marker if introduced.
- **Rules**:
  - Production/runtime-normal rejects memory overrides.
  - Missing PostgreSQL is fatal outside tests.
  - Missing Redis/BullMQ is fatal for sensitive paths and production startup
    unless an explicit tested degraded mode exists.

### PrismaRuntimeRepository

- **Purpose**: Domain repository backed by Prisma/PostgreSQL.
- **Fields/shape**: Domain-specific methods for read/write/search; transaction
  support where the domain participates in quote/routing/action flows.
- **Relationships**: Uses `PrismaService`; returns domain DTOs used by existing
  services.
- **Rules**:
  - Registered in runtime modules outside tests.
  - Does not own business decisions; it persists and queries state.

### TestMemoryRepository

- **Purpose**: Explicit test-only repository for unit tests.
- **Fields/shape**: Mirrors the domain repository port with in-memory storage.
- **Rules**:
  - Registered only in tests or test modules.
  - Runtime-normal module graph must reject or not import it.

## Critical Prisma Domains

### Catalog

- **Models**: `Country`, `ProductCategory`, `Product`, `CountryProduct`,
  `Offer`, `OfferHistory`, `QuoteFormDefinition`, `RegulatoryRegime`.
- **Runtime usage**: Public catalog, admin catalog, offer validity, product and
  country activation, public quote form.
- **Validation rules**:
  - Disabled country/product blocks public exposure and quote submission.
  - Expired or invalid offer is not publicly available.
  - Offer/history changes remain durable and auditable.

### Partners And Users

- **Models**: `PartnerTenant`, `PartnerCountryAuthorization`,
  `PartnerProductAuthorization`, `PartnerLicense`, `AccreditationDocument`,
  `User`, `Role`, `Permission`, `UserRole`, `RolePermission`.
- **Runtime usage**: Auth/RBAC, broker eligibility, routing, tenant isolation,
  admin partner management.
- **Validation rules**:
  - Inactive partner or invalid/expired/suspended license blocks routing.
  - Broker users are tenant-scoped.
  - Admin/broker roles remain strict and MFA requirements from 005/006 remain.

### Consent And Quote Flow

- **Models**: `ConsentText`, `ConsentRecord`, `Prospect`, `QuoteRequest`,
  `RoutingPrecheck`, `RoutingDecision`, `LeadAssignment`.
- **Runtime usage**: Public quote submission, consent proof, duplicate result,
  routing evaluation, lead assignment.
- **Validation rules**:
  - No transmission without valid scoped ConsentRecord.
  - Quote request duplicate/spam/non-routable states persist.
  - LeadAssignment has stable identifiers and tenant scope.

### Starter And CRM

- **Models**: `LeadActionHistory`, `BrokerCrmLeadState`,
  `BrokerCrmPipelineHistory`, `BrokerCrmNote`, `BrokerCrmTask`,
  `BrokerCrmReminder`, `BrokerCrmDocument`, `BrokerCrmProposal`,
  `BrokerCrmDispute`, `BrokerCrmAiAssistRequest`.
- **Runtime usage**: Starter accept/reject/dispute/history, CRM status, notes,
  tasks, reminders, assignments, documents metadata and disputes.
- **Validation rules**:
  - Starter cannot access CRM.
  - CRM requires Pro/Enterprise, permission and `broker_crm_enabled=true`.
  - Each mutation writes history and audit.

### Runtime Operations

- **Models**: `FeatureFlag`, `FeatureFlagHistory`, `AuditLog`,
  `Notification`, `QueueJobRecord`, `EnvironmentSetting`.
- **Runtime usage**: Activation control, durable audit, notification metadata,
  job status and operational health.
- **Validation rules**:
  - Sensitive flags default false when absent.
  - AuditLog persists sensitive successes/refusals.
  - Queue/notification status is observable and retryable.

## Redis Runtime State

### FeatureFlagCacheEntry

- **Key**: `ff:{key}:{scopeType}:{scopeId}:{version}` or equivalent.
- **Value**: Boolean decision plus metadata needed to detect stale entries.
- **TTL**: Explicit short TTL or invalidation on mutation.
- **Rules**: Cache miss reads PostgreSQL. Error on sensitive flag fails closed.

### PublicCatalogCacheEntry

- **Keys**: Active countries, active country, active products for country,
  public offers by country/product/filter.
- **Value**: Public DTOs without back-office fields.
- **TTL**: Explicit TTL; invalidated on catalog/admin mutation when available.
- **Rules**: No PII. May bypass to PostgreSQL in explicit non-sensitive degrade.

### RateLimitCounter

- **Keys**: Public catalog, quote request, auth/MFA if applicable.
- **Value**: Counter with expiry.
- **TTL**: Request window duration.
- **Rules**: Exceeding threshold blocks/slows action and audits sensitive
  refusal where required.

### AntiSpamMarker

- **Key**: Session/IP/device-like fingerprint using non-reversible hash.
- **Value**: Marker or score.
- **TTL**: Spam window duration.
- **Rules**: No raw PII in keys or values.

### DuplicateFingerprint

- **Key**: Country/product/contact fingerprint.
- **Value**: Existing quote request reference or marker.
- **TTL**: Duplicate window from existing rules.
- **Rules**: Duplicate result persists in PostgreSQL when submission is handled.

### RoutingLock

- **Key**: Quote request or lead assignment lock.
- **Value**: Correlation/owner token.
- **TTL**: Short routing lock duration.
- **Rules**: Acquired atomically with set-if-not-exists and released/expired.

### NotificationIdempotency

- **Key**: Visitor notification by quote request or broker notification by lead
  assignment.
- **Value**: Notification/job reference.
- **TTL**: Long enough to cover retries.
- **Rules**: Prevents duplicate enqueue.

## BullMQ Job Entities

### BullMQJob

- **Queues**: Visitor quote notification, broker lead notification, Starter/CRM
  action notification when already planned, maintenance/report if already
  planned.
- **Payload**: Durable references only: `notificationId`, `quoteRequestId`,
  `leadAssignmentId`, `auditLogId`, `correlationId`.
- **States**: queued, active, completed, failed, retryable, discarded.
- **Rules**:
  - Jobs do not contain raw email/phone/secret unless a delivery worker has a
    justified, minimized need loaded from the database.
  - Enqueue is idempotent.
  - HTTP endpoints do not wait for delivery completion.

### QueueJobRecord

- **Model**: Existing Prisma `QueueJobRecord`.
- **Fields**: id, queue name, job type, status, payload reference, retry count,
  failure reason, correlation id, timestamps.
- **Rules**: Created or updated when enqueue/processing/failure occurs.

## Transaction Boundaries

### Quote Submission Transaction

1. Validate public input, flags, country/product/offer availability and consent.
2. Persist or lookup Prospect.
3. Persist ConsentRecord linkage and QuoteRequest.
4. Run duplicate/spam/routing prechecks.
5. Persist RoutingDecision and LeadAssignment only when eligible.
6. Persist AuditLog entries for success/refusal.
7. Commit database transaction.
8. Enqueue idempotent visitor/broker notifications and update job metadata.

### Starter/CRM Action Transaction

1. Validate auth, MFA, RBAC, tenant, plan and flag.
2. Persist action mutation and history.
3. Persist AuditLog.
4. Commit.
5. Enqueue notification if already planned.

### Feature Flag Mutation Transaction

1. Validate admin role/permission.
2. Persist FeatureFlag and FeatureFlagHistory.
3. Persist AuditLog.
4. Commit.
5. Invalidate Redis cache or rely on documented short TTL.

## State Transitions

- **QuoteRequest**: created -> routed | non_routable | duplicate |
  spam_blocked | manual_review | cancelled.
- **LeadAssignment**: assigned -> broker_notified -> seen/received ->
  accepted/contacted/rejected/closed/disputed according to existing rules.
- **QueueJobRecord**: queued -> active -> completed | failed | retryable |
  discarded.
- **Notification**: pending/queued -> sent | failed/retryable according to
  existing delivery status enums.
- **FeatureFlag**: absent -> false by default for sensitive decisions; persisted
  false/true -> history entry -> cache invalidated/refreshed.

## Data Protection Rules

- Redis keys must never include raw email, phone, names, documents, tokens or
  secrets.
- Job payloads must prefer durable identifiers and load PII only inside the
  authorized delivery processor.
- Audit context is PII-minimized and masked before persistence.
- Broker-scoped queries must filter by partner tenant before exposing existence.
- Exports remain RBAC, scope, volume and audit controlled.
