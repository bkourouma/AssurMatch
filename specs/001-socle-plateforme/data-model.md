# Data Model: Socle plateforme AssurMatch

## Conventions

- All critical entities include `id`, `createdAt`, `updatedAt` and `createdById` when the actor is known.
- Status changes for countries, products, partners, licenses, feature flags, consent texts, AI modules and routing pre-check rules must create AuditLog entries.
- Soft deletion or anonymization must preserve minimum compliance evidence when legally permitted.
- PII fields are identified at design time and must be masked from technical logs.
- Default retention is 10 years for AuditLog, ConsentRecord and AccreditationDocument evidence unless a country/regime rule overrides it.

## Entity: User

**Purpose**: Authenticated person who can access admin, partner or future public/broker experiences.

**Fields**:
- `id`: stable unique identifier.
- `email`: unique login email, normalized lowercase.
- `phone`: optional E.164 phone, required for WhatsApp notification recipients when configured.
- `displayName`: visible internal name.
- `status`: `invited`, `active`, `suspended`, `locked`, `deleted`.
- `mfaStatus`: `not_enrolled`, `enrolled`, `required`, `verified`.
- `lastLoginAt`: last successful login timestamp.
- `partnerTenantId`: optional tenant scope for broker users.
- `countryScopes`: list of country ids for scoped admin users.
- `productScopes`: list of product ids for scoped admin users.

**Relationships**:
- Many-to-many with Role through UserRole.
- Optional many-to-one with PartnerTenant.
- One-to-many with AuditLog as actor.

**Validation rules**:
- Admin and broker users must have MFA enrolled before sensitive access.
- Broker users must belong to exactly one PartnerTenant.
- Suspended, locked or deleted users cannot perform sensitive actions.

## Entity: Role

**Purpose**: Canonical role profile.

**Fields**:
- `id`: stable unique identifier.
- `key`: unique role key (`super_admin`, `admin_pays`, `compliance_admin`, `support_admin`, `broker_owner_starter`, `broker_owner_pro`, `broker_manager`, `broker_agent`, `broker_read_only`, `finance_admin`, `content_admin`, `ai_admin`).
- `name`: human-readable role name.
- `description`: role purpose.
- `isSystemRole`: true for constitution-defined roles.

**Relationships**:
- Many-to-many with Permission through RolePermission.
- Many-to-many with User through UserRole.

**Validation rules**:
- System role keys cannot be deleted.
- Role assignment must be audited.

## Entity: Permission

**Purpose**: Fine-grained action/resource authorization.

**Fields**:
- `id`: stable unique identifier.
- `resource`: canonical resource key.
- `action`: `create`, `read`, `update`, `delete`, `activate`, `deactivate`, `export`, `approve`, `review`.
- `scopeType`: `global`, `country`, `product`, `partner`, `plan`, `module`.
- `isSensitive`: marks actions requiring MFA, audit and stronger checks.

**Relationships**:
- Many-to-many with Role.

**Validation rules**:
- Export permissions must include scope and volume limits.
- Sensitive permission checks must create AuditLog entries when refused.

## Entity: PartnerTenant

**Purpose**: Tenant boundary for a broker partner.

**Fields**:
- `id`: stable unique identifier.
- `legalName`: legal broker name.
- `tradeName`: optional commercial name.
- `registrationNumber`: optional registry identifier.
- `plan`: `starter`, `pro`, `enterprise`.
- `status`: `draft`, `pending_compliance`, `active`, `suspended`, `retired`.
- `suspensionReason`: required when suspended.
- `primaryEmail`: required contact email.
- `primaryWhatsApp`: required when partner receives technical/compliance WhatsApp notifications.
- `quotaMonthlyLeads`: future routing capacity guard.
- `capacityStatus`: `available`, `limited`, `full`, `blocked`.

**Relationships**:
- One-to-many with User.
- One-to-many with PartnerLicense.
- One-to-many with AccreditationDocument.
- Many-to-many with Country through PartnerCountryAuthorization.
- Many-to-many with Product through PartnerProductAuthorization.

**Validation rules**:
- Partner cannot become active without required valid licenses and accreditation documents for the approved scope.
- Partner suspension blocks routing eligibility and partner notifications for future leads.

## Entity: Country

**Purpose**: Country catalog and activation scope.

**Fields**:
- `id`: stable unique identifier.
- `isoCode`: unique ISO country code.
- `name`: localized country name.
- `currency`: ISO currency code.
- `languages`: supported language codes.
- `timezone`: primary timezone.
- `regulatoryFamily`: `cima`, `fanaf`, `outside_cima`, `future`.
- `status`: `draft`, `internal`, `partner_test`, `pilot`, `public`, `suspended`, `retired`.
- `flags`: country flag values for public, waitlist, quote, comparison, broker onboarding and AI.

**Relationships**:
- Many-to-one with RegulatoryRegime.
- Many-to-many with Product through CountryProduct.
- Many-to-many with PartnerTenant through PartnerCountryAuthorization.
- One-to-many with ConsentText.

**Validation rules**:
- Public status requires legal text, consent configuration and all required activation flags.
- Disabled or suspended countries block public availability and future quote/routing actions.

## Entity: RegulatoryRegime

**Purpose**: Compliance framework controlling countries, legal texts and retention.

**Fields**:
- `id`: stable unique identifier.
- `key`: unique regime key.
- `name`: regime display name.
- `description`: scope and compliance notes.
- `retentionOverrideYears`: optional override for audit/consent/accreditation evidence.
- `requiresManualActivationReview`: boolean.
- `status`: `draft`, `active`, `suspended`, `retired`.

**Relationships**:
- One-to-many with Country.
- One-to-many with ConsentText.

**Validation rules**:
- Active countries must reference an active regime or explicit compliance exception.
- Retention override cannot weaken active country legal requirements.

## Entity: ProductCategory

**Purpose**: Product grouping for catalog management.

**Fields**:
- `id`: stable unique identifier.
- `key`: unique category key.
- `name`: display name.
- `status`: `draft`, `active`, `retired`.

**Relationships**:
- One-to-many with Product.

## Entity: Product

**Purpose**: Insurance product foundation record.

**Fields**:
- `id`: stable unique identifier.
- `categoryId`: parent ProductCategory.
- `key`: unique product key.
- `name`: display name.
- `description`: non-binding product description.
- `sensitivity`: `standard`, `sensitive`, `highly_sensitive`.
- `requiresDocuments`: boolean.
- `requiresManualReview`: boolean.
- `status`: `draft`, `internal`, `pilot`, `public`, `suspended`, `retired`.
- `flags`: product flag values for public, quote, comparison, document upload, sensitive data, manual review, AI scoring and AI form assistant.

**Relationships**:
- Many-to-many with Country through CountryProduct.
- Many-to-many with PartnerTenant through PartnerProductAuthorization.
- One-to-many with ConsentText.

**Validation rules**:
- Public or quote-enabled products require active country association, legal text and consent configuration.
- Sensitive products must default to manual review unless explicitly approved otherwise.

## Entity: PartnerLicense

**Purpose**: Broker authorization proof.

**Fields**:
- `id`: stable unique identifier.
- `partnerTenantId`: broker partner.
- `licenseNumber`: official reference.
- `issuingAuthority`: authority name.
- `countryId`: license country scope.
- `productIds`: product scope list or empty for all products when legally accepted.
- `status`: `draft`, `pending_review`, `valid`, `expired`, `suspended`, `invalid`, `revoked`.
- `effectiveDate`: start date.
- `expirationDate`: required expiration date.
- `validatedById`: Compliance Admin who validated.
- `validatedAt`: validation timestamp.

**Relationships**:
- Many-to-one with PartnerTenant.
- Many-to-one with Country.
- Many-to-many with Product.
- One-to-many with AccreditationDocument.

**Validation rules**:
- Missing, expired, suspended, invalid or out-of-scope license blocks partner activation and routing eligibility.
- License status changes must be audited with before/after state.

## Entity: AccreditationDocument

**Purpose**: Secure record of partner accreditation evidence.

**Fields**:
- `id`: stable unique identifier.
- `partnerTenantId`: owning partner.
- `licenseId`: optional related license.
- `documentType`: `license`, `registration`, `identity`, `mandate`, `compliance_certificate`, `other`.
- `storageKey`: S3-compatible object key.
- `checksum`: file integrity hash.
- `status`: `uploaded`, `pending_review`, `accepted`, `rejected`, `expired`, `superseded`.
- `expirationDate`: optional date.
- `reviewedById`: reviewer.
- `reviewedAt`: review timestamp.
- `retentionUntil`: calculated from regime or default retention.

**Relationships**:
- Many-to-one with PartnerTenant.
- Optional many-to-one with PartnerLicense.

**Validation rules**:
- Access requires scoped document permission.
- Download/access attempts are audited.

## Entity: FeatureFlag

**Purpose**: Controlled activation record.

**Fields**:
- `id`: stable unique identifier.
- `key`: flag key.
- `scopeType`: `global`, `country`, `product`, `partner`, `plan`, `module`, `ai`.
- `scopeId`: nullable for global.
- `value`: boolean or enumerated value.
- `defaultValue`: baseline value.
- `reason`: required reason for changes.
- `changedById`: actor for latest change.
- `changedAt`: latest change timestamp.
- `cacheVersion`: incremented for invalidation.

**Relationships**:
- Optional relation to Country, Product or PartnerTenant depending on scope.
- One-to-many with AuditLog.

**Validation rules**:
- Global disable overrides lower-scope enables.
- Critical reads must fail closed when cache state is uncertain.
- Changes require audit and cache invalidation.

## Entity: ConsentText

**Purpose**: Versioned consent wording by purpose and scope.

**Fields**:
- `id`: stable unique identifier.
- `purpose`: `lead_transmission`, `document_upload`, `technical_notification`, `ai_processing`, `marketing_optional`.
- `countryId`: required country scope.
- `productId`: optional product scope.
- `channel`: `public_web`, `admin`, `broker`, `api`.
- `recipientCategory`: intended recipient type.
- `language`: language code.
- `version`: semantic or sequential version.
- `status`: `draft`, `review`, `published`, `retired`.
- `contentHash`: immutable text hash for evidence.
- `publishedAt`: publication timestamp.

**Relationships**:
- One-to-many with ConsentRecord.
- Many-to-one with Country.
- Optional many-to-one with Product.

**Validation rules**:
- Published consent text is immutable; corrections create a new version.
- Country public activation requires applicable published consent text.

## Entity: ConsentRecord

**Purpose**: Evidence that a user consented to a specific purpose and recipient scope.

**Fields**:
- `id`: stable unique identifier.
- `consentTextId`: versioned text.
- `subjectReference`: pseudonymous subject reference until a future lead is created.
- `purpose`: copied purpose.
- `countryId`: consent country.
- `productId`: optional product.
- `channel`: collection channel.
- `intendedRecipient`: partner, category or future recipient scope.
- `status`: `granted`, `withdrawn`, `expired`, `anonymized`.
- `grantedAt`: timestamp.
- `withdrawnAt`: optional timestamp.
- `retentionUntil`: calculated from regime or default retention.

**Relationships**:
- Many-to-one with ConsentText.
- Optional relations to Country, Product and PartnerTenant.

**Validation rules**:
- Future lead transmission requires valid granted consent scoped to country, product, purpose and recipient.
- Consent access/export is scoped and audited.

## Entity: AuditLog

**Purpose**: Immutable sensitive-action evidence.

**Fields**:
- `id`: stable unique identifier.
- `actorId`: nullable for system events.
- `action`: canonical action key.
- `targetType`: target entity type.
- `targetId`: stable target id/reference.
- `scope`: global/country/product/partner/module scope.
- `result`: `success`, `refused`, `failed`.
- `reason`: required for refused/failed events.
- `context`: minimized structured context without raw PII.
- `correlationId`: optional request/job id.
- `occurredAt`: event timestamp.
- `retentionUntil`: calculated from regime or default retention.

**Validation rules**:
- AuditLog entries are append-only.
- Search access is limited to authorized admins.

## Entity: Notification

**Purpose**: Technical or compliance notification evidence.

**Fields**:
- `id`: stable unique identifier.
- `type`: `license_expiration_warning`, `license_blocked`, `partner_suspended`, `feature_flag_changed`, `critical_job_failed`, `consent_text_changed`, `security_admin_change`.
- `recipientScope`: user, role, partner, country or platform scope.
- `whatsAppStatus`: `pending`, `queued`, `sent`, `delivered`, `failed`, `retryable`.
- `emailStatus`: `pending`, `queued`, `sent`, `delivered`, `failed`, `retryable`.
- `payloadReference`: non-PII reference to payload/template.
- `relatedAuditLogId`: optional AuditLog.
- `lastAttemptAt`: timestamp.
- `retryCount`: integer.

**Relationships**:
- Optional many-to-one with AuditLog.
- Optional many-to-one with QueueJobRecord.

**Validation rules**:
- Every WhatsApp notification must also have email delivery.
- Failure state must be visible to authorized admins.

## Entity: QueueJobRecord

**Purpose**: Operational view of asynchronous processing.

**Fields**:
- `id`: stable unique identifier.
- `queueName`: queue name.
- `jobType`: notification, document hook, future IA, future routing or maintenance.
- `status`: `queued`, `active`, `completed`, `failed`, `retryable`, `discarded`.
- `failureReason`: optional reason.
- `retryCount`: integer.
- `correlationId`: job/request correlation.
- `visibleToRoles`: roles allowed to view.

**Validation rules**:
- Critical job failures produce Notification and/or AuditLog when sensitive.
- Public endpoints cannot wait on heavy job completion.

## Entity: AIModuleConfig

**Purpose**: Central AI module control without advanced AI activation.

**Fields**:
- `id`: stable unique identifier.
- `key`: module key.
- `status`: `disabled`, `internal_test`, `enabled`.
- `allowedScopes`: countries, products, partners or plans.
- `promptTemplateReference`: optional reference.
- `guardrailStatus`: `not_configured`, `configured`, `failed_review`, `approved`.
- `auditPolicy`: `metadata_only`, `full_prompt_metadata`, `sensitive_human_validation`.
- `quotaPolicyReference`: optional reference.

**Validation rules**:
- Disabled AI produces zero model calls.
- Sensitive AI outputs require human validation before effect.

## Entity: AIInteraction

**Purpose**: Future AI audit evidence.

**Fields**:
- `id`: stable unique identifier.
- `moduleConfigId`: AI module.
- `actorId`: user or system.
- `scope`: country/product/partner/plan.
- `minimizedInputReference`: non-PII metadata reference.
- `outputReference`: output metadata reference.
- `guardrailResult`: pass/fail/review.
- `humanValidationStatus`: `not_required`, `pending`, `approved`, `rejected`.
- `occurredAt`: timestamp.

**Validation rules**:
- No official recommendation, pricing, underwriting, eligibility or routing decision can be stored as AI final output.

## Entity: RoutingPrecheck

**Purpose**: Non-transmissive eligibility evaluation.

**Fields**:
- `id`: stable unique identifier.
- `countryId`: evaluated country.
- `productId`: evaluated product.
- `partnerTenantId`: evaluated partner.
- `consentStatus`: `valid`, `missing`, `expired`, `out_of_scope`.
- `countryStatus`: active/disabled result.
- `productStatus`: active/disabled/manual-review result.
- `partnerStatus`: active/suspended/ineligible result.
- `licenseStatus`: valid/missing/expired/suspended/invalid/out-of-scope result.
- `quotaStatus`: available/over_quota/blocked.
- `result`: `eligible`, `not_eligible`.
- `reasons`: ordered refusal reasons.

**Validation rules**:
- Precheck must not notify brokers or transmit leads.
- Mandatory blockers always result in `not_eligible`.

## Entity: EnvironmentSetting

**Purpose**: Non-secret operational configuration reference.

**Fields**:
- `id`: stable unique identifier.
- `environment`: `local`, `test`, `staging`, `production`.
- `key`: config key.
- `safeDefault`: value safe for committed config.
- `requiresSecret`: boolean.
- `ownerModule`: module key.
- `status`: `active`, `deprecated`.

**Validation rules**:
- Secrets are never committed.
- Exposed environments require HTTPS.

## State Transition Summary

- Country: `draft -> internal -> partner_test -> pilot -> public -> suspended -> retired`; `suspended` can return to `pilot` or `public` only if blockers remain satisfied.
- Product: `draft -> internal -> pilot -> public -> suspended -> retired`; public requires active country association and required legal/consent texts.
- PartnerTenant: `draft -> pending_compliance -> active -> suspended -> retired`; active requires valid license and accreditation evidence.
- PartnerLicense: `draft -> pending_review -> valid -> expired|suspended|invalid|revoked`; non-valid states block scope.
- ConsentText: `draft -> review -> published -> retired`; published versions are immutable.
- FeatureFlag: value changes are versioned through AuditLog and cacheVersion; global disables override lower scopes.
- Notification: `pending -> queued -> sent -> delivered` or `pending|queued|sent -> failed|retryable`.
- QueueJobRecord: `queued -> active -> completed` or `queued|active -> failed -> retryable|discarded`.
- AIModuleConfig: `disabled -> internal_test -> enabled`; enabled requires flags, guardrails and audit policy.
