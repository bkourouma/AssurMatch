# Data Model: Runtime PostgreSQL Smoke Tests AssurMatch

This document describes the logical data created, verified and cleaned by the
runtime PostgreSQL smoke suite. It does not introduce new business entities.
Implementation should prefer existing Prisma models and existing services.

## SmokeRun

**Purpose**: Correlate one smoke execution across seed data, HTTP calls,
database assertions, logs and cleanup.

**Fields**:
- `id`: unique run id, recommended `runtime-smoke-<timestamp>-<random>`.
- `startedAt`: run start timestamp.
- `correlationId`: value sent in HTTP headers where supported.
- `prefix`: short string used in names, emails, license numbers and reasons.
- `cleanupPolicy`: `delete-safe-rows` or `isolate-audit`.

**Relationships**:
- Referenced indirectly by synthetic values in Country/Product/Offer, Partner,
  QuoteRequest, AuditLog and FeatureFlag records.

**Validation Rules**:
- Must be generated before any seed.
- Must be included in every cleanup filter.
- Must never contain secrets or real PII.

## RuntimeEnvironment

**Purpose**: Define the controlled non-test environment used to start the real
backend.

**Fields**:
- `NODE_ENV`: `runtime-smoke`.
- `ASSURMATCH_RUNTIME_SMOKE`: `true`.
- `DATABASE_URL`: explicit PostgreSQL smoke URL.
- `REDIS_URL`: optional local/CI Redis URL, defaulting only when safe.
- `BULLMQ_PREFIX`: optional smoke-specific namespace.
- memory override flags: all absent or false.

**Validation Rules**:
- `NODE_ENV=test` is invalid.
- `DATABASE_URL` must be PostgreSQL and smoke-identifiable.
- Production/staging-looking URLs are invalid.
- Memory overrides are invalid outside test.

## MigrationState

**Purpose**: Prove the smoke database schema is ready before HTTP scenarios.

**Fields**:
- `schemaValid`: boolean from Prisma schema validation.
- `migrationsApplied`: boolean from deploy/status command.
- `checkedAt`: timestamp.
- `databaseUrlFingerprint`: sanitized URL fingerprint, never full URL.

**Validation Rules**:
- Must be valid before seeding.
- Failures stop the suite before any data creation.

## RepositoryRuntimeGuard

**Purpose**: Verify source bindings are Prisma-runtime outside test.

**Critical repositories**:
- Countries
- Products
- Offers
- Prospects
- ConsentRecords
- QuoteRequests
- LeadAssignments
- RoutingDecisions
- Partners
- PartnerLicenses
- CRMActivity
- Notifications
- AuditLog
- FeatureFlag

**Validation Rules**:
- Each critical repository must be `prisma-runtime`.
- `memory-test`, undefined because of test mode, or missing mode metadata fails
  the smoke suite.

## Catalog Seed

### Country

**Purpose**: Public country visible through `GET /countries`.

**Required State**:
- Active/public status.
- `country_public_enabled=true`.
- `country_comparison_enabled=true`.
- `country_quote_enabled=true`.
- Smoke-identifiable name or metadata.

### Product

**Purpose**: Product visible through
`GET /countries/:countryCode/products`.

**Required State**:
- Active/public status.
- Linked to smoke country.
- `product_public_enabled=true`.
- `product_comparison_enabled=true`.
- `product_quote_enabled=true`.
- `product_manual_review_required=false` unless existing route requires a
  manual-review scenario.

### Offer

**Purpose**: Indicative active offer visible through
`GET /countries/:countryCode/products/:productKey/offers`.

**Required State**:
- Linked to smoke country/product and eligible partner.
- Valid from before run start and valid until after run end.
- Public/validated/active according to existing model.
- Indicative price fields only; no binding price promise.

**Negative State**:
- Optional expired/inactive smoke offer must not be exposed as available.

## Quote Consent Seed

### ConsentText

**Purpose**: Published text used to create a valid `ConsentRecord`.

**Required State**:
- Purpose `lead_transmission`.
- Country/product scope matching smoke catalog.
- Channel `public_web` or existing accepted value.
- Recipient category matching eligible broker flow.
- Published/active status.

### QuoteForm

**Purpose**: Provides required form metadata when quote submission validates
against published forms.

**Required State**:
- Linked to smoke country/product.
- Published status.
- Minimal fields required by current contract.
- Linked to smoke consent text.

## Quote Flow Records

### Prospect

**Created By**: `POST /quote-requests` with consent.

**Verification**:
- Exists after successful consented quote.
- Uses synthetic contact data.
- Linked to quote/consent according to schema.

### ConsentRecord

**Created By**: `POST /quote-requests` with consent.

**Verification**:
- Exists after successful consented quote.
- Contains purpose, text version/hash, country/product/channel and recipient
  scope expected by the submitted payload.

### QuoteRequest

**Created By**: `POST /quote-requests`.

**Verification**:
- Consented scenario: persisted and linked to prospect/consent.
- No-consent scenario: no valid routable request or non-compliant persisted
  state exists.

### RoutingDecision

**Created By**: routing evaluation when modeled.

**Verification**:
- Positive scenario: decision or equivalent trace exists.
- Refusal scenario: refusal reason exists when current behavior defines it.

### LeadAssignment

**Created By**: routing success with eligible broker.

**Verification**:
- Exists only for consented and eligible scenario.
- Linked to the intended partner tenant.
- Not created for no-consent scenario.

## Broker Seed

### Partner/Broker

**Starter A/B**:
- Active partner tenants.
- Plan Starter.
- Valid actor context or token with tenant id and MFA where required.
- A has one assigned lead; B does not have A's lead.

**Pro**:
- Active partner tenant.
- Plan Pro.
- Valid actor context or token with tenant id and MFA where required.
- Has one assigned lead for CRM scenario.

### PartnerLicense

**Purpose**: Make the positive quote/routing partner eligible.

**Required State**:
- Valid status.
- Effective before run date.
- Expiration after run date.
- Country/product scope matches smoke catalog.

## FeatureFlag

**Purpose**: Prove persisted runtime flag behavior.

**Required Flags**:
- `public_comparator_enabled`, `quote_request_enabled`,
  `starter_portal_enabled` as needed by existing runtime policies.
- `broker_crm_enabled=true` only for the positive CRM scenario.

**Fail-Closed Flags**:
- `payments_enabled`
- `e_signature_enabled`
- `policy_issuance_enabled`
- `claims_enabled`
- `insurer_api_enabled`
- AI-sensitive flags

**Validation**:
- Defaults are absent/false.
- CRM behavior changes when persisted flag is true vs absent/false.
- Flag cache is invalidated, bypassed or refreshed before assertions.

## AuditLog

**Purpose**: Durable proof for sensitive actions and refusals.

**Created By**:
- Consented quote submission/routing.
- No-consent refusal when current behavior defines audit.
- Admin/broker sensitive actions used by smoke.

**Verification**:
- Query by correlation id, actor, action, target or smoke prefix.
- Contains result and context without raw PII leakage.

**Cleanup**:
- Delete only if test policy allows audit deletion.
- Otherwise retain with smoke run id and document retention/isolation.

## Cleanup Ownership

Cleanup must run in reverse dependency order:

1. CRM activity and CRM state for smoke leads.
2. Notifications and queue job traces for smoke quote/leads.
3. Lead action history and lead assignments.
4. Routing decisions.
5. Quote requests.
6. Consent records and prospects when safe.
7. Offer history and offers.
8. Partner licenses and authorizations.
9. Partners/brokers and users created only for smoke.
10. Quote forms and consent texts.
11. Product-country links and products.
12. Countries.
13. Smoke-only feature flags/history when safe.
14. Audit logs only if allowed; otherwise isolate.

Every cleanup query must include the smoke run id, prefix, correlation id or a
related ID collected from the smoke run.

