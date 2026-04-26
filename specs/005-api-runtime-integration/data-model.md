# Data Model: API Runtime Integration AssurMatch

This feature does not introduce new business entities. It makes the durable
entities from specs 001-004 executable through runtime repositories and HTTP
routes.

## Runtime Infrastructure Entities

### RuntimeModuleGraph

- **Purpose**: Effective Nest runtime graph of modules, controllers, providers
  and exported dependencies.
- **Source**: Code structure, route inventory tests.
- **Validation**:
  - AppModule imports every runtime module needed by 001-004.
  - Controllers are decorated and discoverable by Nest.
  - Providers are injected, not manually instantiated outside tests.

### ActorContext

- **Purpose**: Trusted authenticated context used by controllers, guards,
  services and audit.
- **Fields**:
  - `actorId`
  - `roles`
  - `partnerTenantId`
  - `countryScopes`
  - `productScopes`
  - `mfaVerified`
  - `correlationId`
- **Validation**:
  - Broker/admin routes require actor.
  - Sensitive routes require MFA.
  - Tenant and scope checks happen before data lookup is revealed.

### RuntimeAdapterConfiguration

- **Purpose**: Declares which adapter is active in each environment.
- **Fields**:
  - database URL/runtime mode
  - Redis URL/runtime mode
  - queue mode
  - audit persistence mode
  - test adapter opt-in flag
- **Validation**:
  - Non-test environments reject memory Prisma/Redis/queue/audit adapters.
  - Test modules may explicitly provide memory adapters.

## Durable Business Entities To Use At Runtime

### User, Role, Permission, UserRole, RolePermission

- **Runtime use**: Auth, RBAC, MFA and ActorContext building.
- **Key rules**:
  - Admin and broker sensitive access requires MFA.
  - Read-only roles cannot mutate.
  - Partner users receive partner tenant scope.

### PartnerTenant

- **Runtime use**: Broker tenant isolation, plan gating and routing
  eligibility.
- **Key rules**:
  - `starter` cannot access CRM.
  - `pro` and `enterprise` can access CRM only with flag and permission.
  - Suspended/inactive partners cannot receive new routed leads.

### Country, Product, CountryProduct, Offer, OfferHistory

- **Runtime use**: Public country/product/offer pages and admin catalog.
- **Key rules**:
  - Public routes return only enabled/allowed country/product scopes.
  - Expired, draft, suspended or non-validated offers are not public.
  - Offer changes are auditable/history-backed.

### ConsentText, ConsentRecord

- **Runtime use**: Quote form consent display and lead transmission
  authorization.
- **Key rules**:
  - Lead transmission requires granted, scoped ConsentRecord.
  - Missing/expired/withdrawn/out-of-scope consent blocks routing.

### Prospect, QuoteRequest

- **Runtime use**: Public quote submission and visitor status.
- **Key rules**:
  - Public reference must be stable and non-guessable.
  - Payloads are validated and PII-minimized in logs.
  - Duplicate/spam/manual-review states do not create duplicate active
    lead assignments.

### RoutingDecision, RoutingPrecheck

- **Runtime use**: Durable routing proof and admin diagnostics.
- **Key rules**:
  - No routing without consent, active flags, active partner, valid license and
    quota/capacity.
  - Refusal reasons are persisted and auditable.

### LeadAssignment, LeadActionHistory

- **Runtime use**: Broker Starter, broker base lead access and admin lead
  assignments.
- **Key rules**:
  - Unique assignment per quote request.
  - Broker users can access only their tenant's assignments.
  - Starter actions are limited to already specified minimal statuses.

### BrokerCrmLeadState And CRM Activity Models

- **Runtime use**: Pro/Enterprise CRM already specified by 004.
- **Entities**:
  - BrokerCrmLeadState
  - BrokerCrmPipelineHistory
  - BrokerCrmNote
  - BrokerCrmTask
  - BrokerCrmReminder
  - BrokerCrmDocument
  - BrokerCrmProposal
  - BrokerCrmDispute
  - BrokerCrmAiAssistRequest
- **Key rules**:
  - Pro/Enterprise only.
  - `broker_crm_enabled` required and false by default.
  - Same-tenant assignment only.
  - Proposals are non-contractual.
  - Documents are internal-only unless a future spec says otherwise.

### FeatureFlag, FeatureFlagHistory

- **Runtime use**: Activation control and fail-closed runtime decisions.
- **Key rules**:
  - Sensitive absent flags evaluate false.
  - Flag changes are persisted, cached and audited.
  - Global/module deny overrides lower-scope enable.

### AuditLog

- **Runtime use**: Durable compliance proof for successes and refusals.
- **Key fields**:
  - actorId
  - action
  - targetType
  - targetId
  - scope
  - result
  - reason
  - context
  - correlationId
  - occurredAt
  - retentionUntil
- **Key rules**:
  - PII minimized in context.
  - Sensitive mutation without audit must fail or enter operational review.

### Notification, QueueJobRecord

- **Runtime use**: Async visitor/broker notifications and operational job
  visibility.
- **Key rules**:
  - Jobs use stable references and minimized payloads.
  - Public endpoints do not wait for job delivery.
  - Failures are visible and retryable where configured.

### AIModuleConfig, AIInteraction, QuoteAISummary

- **Runtime use**: Optional existing AI summary foundations only.
- **Key rules**:
  - No call when AI flags are disabled.
  - Output is assistance only.
  - PII minimized and interactions audited.

## Repository Boundaries

- `CatalogRepository`: Country, Product, CountryProduct, Offer, QuoteFormDefinition.
- `ComplianceRepository`: ConsentText, ConsentRecord, PartnerLicense, AuditLog.
- `PartnerRepository`: PartnerTenant and authorizations.
- `QuoteRepository`: Prospect, QuoteRequest, RoutingDecision.
- `LeadRepository`: LeadAssignment, LeadActionHistory.
- `BrokerCrmRepository`: CRM state/activity models.
- `FeatureFlagRepository`: FeatureFlag and history.
- `NotificationRepository`: Notification and QueueJobRecord.

Each repository has a Prisma implementation for runtime and a memory
implementation only for isolated unit tests.

## State Transitions To Preserve

- QuoteRequest: refused/spam/duplicate/manual-review/created/routed/non-routable
  exactly as defined in 002.
- LeadAssignment Starter: assigned -> broker_notified -> seen -> accepted,
  rejected, disputed, closed according to 003.
- Broker CRM pipeline: statuses from 004 only, with controlled transitions and
  history.
- FeatureFlag: value change always records FeatureFlagHistory and AuditLog.
- Partner/license: invalid state blocks future routing and relevant actions.

## Migration Validation

- Fresh database applies `0001_foundation` through `0004_broker_crm_pro`.
- Prisma schema validates after migrations.
- Minimal seed creates acceptance fixtures without enabling regulated modules.
- No migration imports memory-only runtime state.
