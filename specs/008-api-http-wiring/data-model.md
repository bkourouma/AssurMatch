# Data Model: API HTTP Wiring AssurMatch

This feature does not add new business entities. It defines runtime ownership,
request context, repository bindings and acceptance state around existing
Prisma models and frontend/API contracts.

## Runtime Wiring Entities

### DomainModule

- **Purpose**: Own a bounded HTTP/API domain in NestJS.
- **Fields**:
  - `name`: stable module name such as `CountriesModule`.
  - `imports`: explicit Nest module dependencies.
  - `controllers`: decorated controllers owned by the module.
  - `providers`: services, repositories, guards/policies and adapters.
  - `exports`: providers consumed by other modules.
- **Validation rules**:
  - Runtime modules must use `@Module`.
  - Controllers and providers must be declared through Nest metadata.
  - Manual instantiation is allowed only in tests/fixtures.
- **Relationships**:
  - Imported by `AppModule`.
  - Owns one or more `RouteOwnership` records in test inventory.

### RouteOwnership

- **Purpose**: Prove which controller owns an HTTP route after migration.
- **Fields**:
  - `method`: HTTP method.
  - `path`: stable route path.
  - `scope`: `public`, `broker` or `admin`.
  - `owningController`: expected decorated controller.
  - `temporaryFacadeAllowed`: whether RuntimeHttpController may still serve it.
  - `acceptanceTest`: test file/case proving runtime behavior.
- **Validation rules**:
  - P1 migrated routes must have `temporaryFacadeAllowed=false`.
  - Duplicate method/path registrations must fail route inventory tests.
  - Public routes must not require partner/admin ActorContext.

### ActorContext

- **Purpose**: Trusted per-request identity and scope for protected routes.
- **Fields**:
  - `actorId`: authenticated user id, required for broker/admin.
  - `roles`: AssurMatch roles.
  - `partnerTenantId`: broker tenant scope when applicable.
  - `partnerPlan`: starter, pro or enterprise when applicable.
  - `countryScopes`: allowed country ids/codes when applicable.
  - `productScopes`: allowed product ids/keys when applicable.
  - `mfaVerified`: boolean MFA state.
  - `correlationId`: optional request correlation id.
- **Validation rules**:
  - Broker/admin routes require actor id and at least one role.
  - Broker routes require partner tenant where a broker resource is accessed.
  - MFA must be true for sensitive roles/actions according to policy.
  - Simulation headers are test/development-only and rejected in production.
- **Relationships**:
  - Derived from bearer/session auth by guards.
  - Passed to services, repositories and audit writer.

### HttpGuardDecision

- **Purpose**: Normalize protected access decisions and refusal audit.
- **Fields**:
  - `actorContext`: ActorContext or anonymous context.
  - `requiredPermissions`: permissions needed by route.
  - `requiredRoles`: optional role allow-list.
  - `requiresMfa`: boolean.
  - `tenantScope`: expected partner tenant for broker resources.
  - `result`: `allowed`, `unauthenticated`, `forbidden`, `mfa_required`,
    `tenant_denied`, `read_only_denied`, `flag_denied`.
  - `auditRequired`: boolean.
  - `safeErrorCode`: non-sensitive error code.
- **Validation rules**:
  - Important refusals on sensitive routes must be audited.
  - Cross-tenant denials must not confirm resource existence.

### PrismaRepositoryBinding

- **Purpose**: Bind a domain repository token to durable Prisma implementation
  in runtime modules.
- **Fields**:
  - `token`: repository provider token.
  - `domain`: country, product, offer, quote, prospect, consent, lead, flag,
    audit, CRM or access domain.
  - `runtimeImplementation`: Prisma implementation.
  - `testImplementation`: optional explicit memory/test implementation.
  - `runtimeAllowed`: boolean.
- **Validation rules**:
  - Runtime-normal bindings must use Prisma or approved runtime adapter.
  - Memory implementations require test module/factory and cannot be selected by
    missing config.

### FeatureFlagDecision

- **Purpose**: Resolved activation decision for route and module gates.
- **Fields**:
  - `key`: flag key.
  - `scopeType`: global, country, product, partner, plan, module or ai.
  - `scopeId`: optional scope id.
  - `value`: boolean final decision.
  - `source`: `persistent`, `redis_cache` or `default_closed`.
  - `cacheVersion`: optional version.
  - `reason`: optional resolver reason.
- **Validation rules**:
  - Sensitive flags default false when absent or unreadable.
  - Redis cache cannot be the only source of truth.
  - Mutations require reason, history, audit and cache invalidation.

### AuditEvent

- **Purpose**: Durable evidence for sensitive success or refusal.
- **Fields**:
  - `actorId`: optional actor id.
  - `action`: stable action name.
  - `targetType`: target entity type.
  - `targetId`: target id or safe public reference.
  - `scope`: JSON scope with tenant/country/product when safe.
  - `result`: success, refused or failed.
  - `reason`: safe reason category.
  - `context`: PII-minimized metadata.
  - `correlationId`: optional correlation id.
  - `occurredAt`: timestamp.
  - `retentionUntil`: retention date.
- **Validation rules**:
  - No raw email, phone, token, secret or cross-tenant sensitive detail in
    context.
  - Critical actions must await durable write or enter explicit failure state.

### FrontendApiState

- **Purpose**: Distinguish success, true empty result and API error in frontend
  clients.
- **Fields**:
  - `status`: `success`, `empty`, `error`, `unauthenticated`, `forbidden`,
    `mfa_required`, `rate_limited`.
  - `data`: typed payload for success/empty.
  - `errorCode`: safe error code for display/logging.
  - `publicMessage`: safe message for UI.
- **Validation rules**:
  - API transport or non-OK responses cannot be returned as silent `[]` or `{}`.
  - Public app states cannot include broker/admin sensitive data.

## Existing Prisma Models In Scope

### Catalog And Activation

- `Country`: public country state, flags, regime, timestamps and author.
- `Product`: public product state, flags, sensitivity, manual review and
  timestamps.
- `CountryProduct`: country/product availability and flags.
- `Offer`: indicative offer, validity, validation status, sponsorship,
  priority and disclaimers.
- `OfferHistory`: durable offer change history.
- `QuoteFormDefinition`: public form fields, validation schema, consent text and
  publication state.

**Validation rules**:
- Public country requires `status=public` and applicable public/waitlist flags.
- Public product requires `status=public` and applicable country/product flags.
- Public offer requires active/validated status and valid date window.
- Quote form must be published for the country/product/language.

### Consent, Prospect And Quote

- `ConsentText`: published legal text version by purpose/country/product/channel.
- `ConsentRecord`: durable granted/withdrawn/expired consent evidence.
- `Prospect`: PII-minimized visitor identity and fingerprints.
- `QuoteRequest`: public reference, verification token hash, consent,
  prospect, payload, duplicate/routing status and refusal/manual review reasons.

**State transitions**:
- `QuoteRequest.status`: `created` -> `routed` when assigned, `non_routable`
  when no eligible route, `duplicate` or `spam_blocked` for abuse controls,
  `manual_review` when required, `cancelled` when closed.
- `DuplicateStatus`: `not_checked` -> `unique`, `possible_duplicate` or
  `blocked_duplicate`.
- `RoutingStatus`: `not_started` -> `eligible`, `assigned`, `blocked`,
  `no_broker_available` or `manual_review_required`.

**Validation rules**:
- `ConsentRecord.status=granted` is required before transmission.
- Quote response exposes `publicReference`, not internal lead/broker data.
- Refusal states require safe reason and durable audit.

### Routing And Leads

- `RoutingPrecheck`: eligibility trace for country/product/partner/license/quota
  status.
- `RoutingDecision`: selected partner or refusal reasons with correlation id.
- `LeadAssignment`: durable partner tenant assignment and broker action state.
- `LeadActionHistory`: broker-visible action history.

**State transitions**:
- `LeadAssignment.status`: `assigned` -> `broker_notified` -> `seen` ->
  `accepted` or `rejected`/`disputed`/`closed`.
- Refused or non-routable quote requests must not create a transmitted lead.

**Validation rules**:
- One lead assignment per quote request.
- Every broker read/mutation is scoped by `partnerTenantId`.
- License, authorization, active status and quota must be checked before
  assignment.

### Broker CRM

- `BrokerCrmLeadState`: tenant CRM state and assigned advisor.
- `BrokerCrmPipelineHistory`: status history.
- `BrokerCrmNote`, `BrokerCrmTask`, `BrokerCrmReminder`: CRM activities.
- `BrokerCrmDocument`, `BrokerCrmProposal`, `BrokerCrmDispute`: already-modeled
  CRM records.
- `BrokerCrmAiAssistRequest`: disabled/controlled metadata for AI assistance.

**State transitions**:
- CRM is unavailable for Starter plan.
- CRM is unavailable unless `broker_crm_enabled=true` in the exact applicable
  scope.
- CRM status changes append history and audit.

**Validation rules**:
- All CRM records include `leadAssignmentId` and `partnerTenantId`.
- Read-only actors cannot mutate CRM records.
- AI assist remains disabled unless existing flags and guardrails allow it; spec
  008 adds no AI behavior.

### Access And Compliance

- `User`, `Role`, `Permission`, `UserRole`, `RolePermission`: authenticated
  actor and RBAC source.
- `PartnerTenant`: broker tenant, plan, status, quota and capacity.
- `PartnerCountryAuthorization`, `PartnerProductAuthorization`: eligibility
  scope.
- `PartnerLicense`: license status, scope and expiration.

**Validation rules**:
- Broker/admin ActorContext must map to active user/role policy when runtime
  lookup is required.
- Expired, suspended, invalid or revoked licenses block routing and activation.
- Starter plan blocks CRM.

### Operations

- `FeatureFlag`: persistent flag value, scope, reason, actor and cache version.
- `FeatureFlagHistory`: mutation history.
- `AuditLog`: durable audit evidence.
- `Notification`: notification metadata.
- `QueueJobRecord`: queue/job observability.
- `EnvironmentSetting`: runtime configuration metadata when used.

**Validation rules**:
- Sensitive flags default false.
- Admin flag mutation requires history and audit.
- Admin audit reads are paginated/limited and permission-gated.
- Jobs and notifications carry durable references, not unnecessary PII.

## Relationships Summary

- `QuoteRequest` references `Country`, `Product`, `QuoteFormDefinition`,
  `Prospect` and `ConsentRecord` by ids.
- `LeadAssignment` references `QuoteRequest` and `PartnerTenant` by ids.
- CRM records reference `LeadAssignment` and duplicate `partnerTenantId` for
  tenant isolation.
- Routing decisions/prechecks connect quote, partner, country, product,
  license and quota evidence.
- Feature flag decisions gate public, broker and admin flows before sensitive
  action execution.
- Audit events reference actor, target and scope for every sensitive success or
  refusal.

## Data Protection Rules

- Raw email/phone may exist only in appropriate PII fields; logs/audit/context/
  Redis keys/job payloads use fingerprints or internal references.
- Public responses never include broker tenant internals, admin roles,
  permission lists, license details or cross-tenant existence hints.
- Back-office responses are scoped to actor role, tenant, country/product scopes
  and read-only/export permissions.
- Correlation ids are propagated to audit and safe errors when available.
