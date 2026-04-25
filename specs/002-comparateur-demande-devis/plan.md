# Implementation Plan: Comparateur public et demande de devis AssurMatch

**Branch**: `002-comparateur-demande-devis` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-comparateur-demande-devis/spec.md`

**Note**: This plan stops at Phase 2 planning artifacts. Implementation tasks are generated separately by `/speckit.tasks`.

## Summary

Implement the public AssurMatch journey that lets a visitor select an active country and product, view indicative validated offers, request a quote with explicit consent, and create a routable lead for one eligible broker partner. The implementation extends the existing 001 foundation with offer administration, public offer comparison, dynamic quote forms, quote requests, prospects, lead assignments, deterministic routing, Redis-backed public protections, BullMQ asynchronous notifications and optional AI request summaries. It does not activate payments, e-signature, policy issuance, attestations, claims, insurer APIs, direct subscription or automated personalized advice.

## Technical Context

**Language/Version**: Node.js 24.15.0+; TypeScript 6.0.3 strict; Next.js 16.2.4; React 19.2.5; NestJS 11.1.19.
**Primary Dependencies**: Prisma 7.8.0 and `@prisma/client` 7.8.0; BullMQ 5.76.2; `redis` 5.12.1; Zod 4.3.6 shared validation contracts; Vitest 4.1.5; Playwright 1.59.1; existing NestJS-style guards, filters, interceptors and services from the 001 foundation.
**Storage**: PostgreSQL remains the durable source of truth. Redis supports feature flag/catalog cache, public rate limiting, anti-spam, duplicate fingerprints, routing locks and BullMQ queues. S3-compatible storage is not used for this feature unless a future product explicitly enables document upload.
**Testing**: Vitest for unit, integration, contract and constitutional guardrail tests; Playwright for public smoke flows across mobile and desktop. Contract tests validate the OpenAPI artifact in `contracts/comparator-quote-api.openapi.yaml`.
**Target Platform**: SaaS web platform with public site, broker portal, admin back-office and backend API.
**Project Type**: B2B2C regulated insurance marketplace technical platform.
**Performance Goals**: 95% of enabled public country/product/offer reads under 2 seconds; 95% of valid quote submissions return a confirmation state under 5 seconds excluding asynchronous delivery and optional AI; flag or cache uncertainty fails closed; public endpoints perform no heavy synchronous work.
**Constraints**: No direct sale, no direct subscription, no premium collection, no payment, no e-signature, no policy issuance, no attestation, no claims, no insurer API, no binding advice, no official recommendation, no broker transmission without valid consent, no routing to inactive/unauthorized/expired-license brokers, no public expired or non-validated offers.
**Scale/Scope**: First activation can stay limited to a pilot country, two products and a small broker set, while the model supports country/product/partner/plan flags and future growth.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The journey displays indicative offers and quote requests only; it never sells, subscribes, collects premiums, issues policies/attestations, handles claims or states an official recommendation.
- **Regulatory and consent**: Pass. `ConsentRecord` with purpose `lead_transmission`, country, product, channel, text version and intended recipient category is mandatory before any `LeadAssignment` or broker notification.
- **Feature flags and activation**: Pass. Global flags `public_comparator_enabled`, `quote_request_enabled`, `sponsored_offers_enabled`, `ai_summary_enabled`, `ai_duplicate_detection_enabled` plus country/product flags control every public step. Broader-scope disables override lower-scope enables.
- **Security and RBAC**: Pass. Public endpoints use strict DTO validation, rate limiting, anti-spam and duplicate controls. Admin and broker endpoints use existing auth, MFA/RBAC, tenant isolation, country/product scope and pagination.
- **Data and auditability**: Pass. New critical entities include status, timestamps and actor fields where applicable. `AuditLog` covers flag blocks, offer exposure/refusal, consent outcomes, quote creation, duplicate/rate-limit/spam events, routing decisions, broker exclusions, notifications and AI interactions.
- **Routing integrity**: Pass. Routing is deterministic and single-broker. It requires valid consent, active country/product flags, active partner, country/product authorization, valid license, capacity/quota availability and a routing lock. All exclusions are auditable.
- **AI control**: Pass. AI is optional, centralized in the `ai` module, flag-gated, PII-minimized, asynchronous, audited and limited to an assistance summary. It cannot choose an offer, broker, price, eligibility or official advice.
- **UX and content safety**: Pass. Public copy must say "offre indicative", "prix a confirmer" and "courtier partenaire" where relevant, label sponsorship, and avoid forbidden sales/subscription/contract wording.
- **Testing discipline**: Pass. Plan requires unit, integration, contract, RBAC, feature-flag, consent, expired-license, disabled-country/product, routing, AI guardrail and Playwright smoke tests.
- **Async and reliability**: Pass. Notifications, optional AI summary and operational review jobs run through BullMQ; Redis provides idempotency and public protections; endpoints return before delivery or AI completion.

**Post-Design Constitution Check**: Pass. Phase 1 artifacts preserve the regulated exclusions, add only the data/contracts needed for indicative comparison and lead routing, and define fail-closed behavior for flags, consent, offers and licenses.

## Backend Architecture Plan

### Existing Modules To Reuse

- `feature-flags`: extend flag resolution for public journey checks across global, country, product, partner/plan and AI scopes.
- `countries` and `products`: keep public catalog responsibilities, adding detail endpoints and country-product journey state.
- `partners` and `partner-licenses`: reuse eligibility foundations and extend checks to include country/product authorizations, quota/capacity and license validity at routing time.
- `consent`: reuse `ConsentText`, `ConsentRecord` and `ConsentTransmissionGuardService` for public lead transmission consent.
- `routing`: extend from non-transmissive precheck to simple single-broker assignment after consent.
- `notifications`: extend notification types and queueing for visitor confirmations and assigned broker lead notifications.
- `audit-logs`: use `AuditLogWriter` for every sensitive success/refusal/failure.
- `ai`: extend as the only entry point for optional quote summary jobs and `AIInteraction` evidence.
- `common`: reuse validation, pagination, PII masking, correlation IDs, Redis and queue abstractions.

### Modules To Add Or Complete

- `offers`: public offer reads plus admin offer CRUD/validation/publication controls.
- `quote-forms`: dynamic country/product form definitions, field validation metadata and published consent text references.
- `quote-requests`: public quote submission, status lookup, duplicate/rate-limit/spam orchestration and admin review.
- `prospects`: normalized contact profile and non-reversible dedupe fingerprint ownership. This can be a subdomain inside `quote-requests` if the implementation keeps the first increment smaller.
- `leads`: `LeadAssignment`, broker lead listing/detail/status and admin lead assignment search.
- `public-comparator` is not required as a separate module unless implementation needs a facade; prefer thin public controllers delegating to `countries`, `products`, `offers` and `quote-requests`.

### Services To Create

- `OfferAdminService`: create/update/validate/suspend/retire offers; enforce validity windows, sponsor labels and audit.
- `PublicOfferCatalogService`: list/detail only active, validated, in-scope, in-period offers; apply filters/sorts without recommendation semantics.
- `OfferPublicationPolicy`: fail closed when offer status, validation, flags, scope or validity cannot be verified.
- `QuoteFormDefinitionService`: select active published form definition for country/product, including field schemas and consent text reference.
- `QuoteSubmissionService`: public use case for validate -> rate-limit/spam -> duplicate check -> consent -> quote/prospect persistence -> routing -> jobs -> confirmation.
- `ProspectIdentityService`: normalize email/phone, create PII-protected prospect records, compute salted hashes for Redis and database duplicate checks.
- `QuoteDuplicateDetectionService`: Redis-first duplicate check plus durable duplicate state on `QuoteRequest`.
- `PublicAntiSpamService`: honeypot/challenge/burst checks with no raw PII in Redis or logs.
- `QuoteRoutingService`: deterministic single-broker routing, Redis lock, `LeadAssignment` creation and refusal preservation.
- `BrokerEligibilityPolicy`: active partner, authorizations, capacity/quota, license status/date/scope and plan checks.
- `LeadAccessPolicy`: broker tenant isolation and admin country/product scope checks.
- `QuoteNotificationService`: enqueue visitor and broker notifications with idempotency keys and minimized payloads.
- `QuoteAISummaryService`: enqueue and process optional AI summary, guardrails and AI audit evidence.
- `QuoteAuditService`: centralize audit action names and sanitized contexts for quote/comparator events.

### DTOs And Shared Contracts To Create

Add `packages/shared/contracts/quote.contracts.ts` and export it from `packages/shared/contracts/index.ts` during implementation. Planned DTO groups:

- Public catalog: `CountryPageResponse`, `ProductPageResponse`, `OfferListQuery`, `OfferSummary`, `OfferDetail`.
- Admin offers: `OfferCreateDto`, `OfferUpdateDto`, `OfferValidationDto`, `OfferListAdminQuery`.
- Quote forms: `QuoteFormDefinitionCreateDto`, `QuoteFormFieldDto`, `PublicQuoteFormResponse`.
- Quote submission: `QuoteRequestCreateDto`, `QuoteRequestConfirmation`, `QuoteStatusResponse`.
- Leads: `BrokerLeadListQuery`, `BrokerLeadSummary`, `BrokerLeadDetail`, `BrokerLeadStatusUpdateDto`.
- Admin operations: `AdminQuoteRequestQuery`, `AdminQuoteRequestReviewUpdateDto`, `AdminLeadAssignmentQuery`, `AdminProspectQuery`.

All DTOs must use Zod schemas, country-aware email/phone validation hooks, enum allowlists and explicit forbidden-wording checks for public/admin content that can be displayed to visitors.

### Guards And Policies

- Public: `PublicJourneyFlagPolicy`, `PublicCatalogRateLimitGuard`, `PublicQuoteRateLimitGuard`, `PublicAntiSpamGuard`, `DuplicateSubmissionPolicy`, `OfferPublicationPolicy`.
- Consent: `LeadTransmissionConsentPolicy` wraps `ConsentTransmissionGuardService` and blocks `LeadAssignment` creation when consent is missing, withdrawn, expired or out of scope.
- Admin: existing `RbacGuard` and `MfaRequiredGuard`; add permissions for `offers`, `quote_requests`, `prospects`, `lead_assignments`, `quote_form_definitions` and `routing`.
- Broker: `BrokerLeadTenantGuard` and `BrokerLeadScopePolicy` ensure only the assigned broker tenant can read/update an assigned lead.
- AI: `AISummaryFlagPolicy` checks global, country, product, partner/plan visibility and `AIModuleConfig` before queueing or invoking a model.

## API Endpoints

Public endpoints are unauthenticated but validate, rate-limit, anti-spam and audit refusals:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/countries` | List public or waitlist-eligible countries using foundation flags. |
| GET | `/countries/:countryCode` | Return country page data, legal positioning and enabled journey state. |
| GET | `/countries/:countryCode/products` | List public active products for the country. |
| GET | `/countries/:countryCode/products/:productKey` | Return product page data and quote/comparison availability. |
| GET | `/countries/:countryCode/products/:productKey/offers` | Return active validated indicative offers with filters/sorts/sponsor labels. |
| GET | `/offers/:offerId` | Return public offer detail only when still public and valid. |
| GET | `/countries/:countryCode/products/:productKey/quote-form` | Return the dynamic form definition and published consent text reference. |
| POST | `/quote-requests` | Create consented quote request, prospect, optional routing and async jobs. |
| GET | `/quote-requests/:publicReference` | Return minimal visitor-safe confirmation status using verification token/reference. |

Admin endpoints required if missing:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/admin/offers` | Search/create indicative offers. |
| GET/PATCH | `/admin/offers/:id` | Inspect/update offer wording, status, validity, sponsor state and scope. |
| POST | `/admin/offers/:id/validate` | Validate or reject an offer for public display with audit. |
| GET/POST | `/admin/quote-form-definitions` | Search/create form definitions by country/product. |
| GET/PATCH | `/admin/quote-form-definitions/:id` | Update, publish, retire or suspend form definitions. |
| GET | `/admin/quote-requests` | Search quote requests with pagination and PII scope controls. |
| GET | `/admin/quote-requests/:id` | Inspect request, consent, duplicate, routing and notification state. |
| PATCH | `/admin/quote-requests/:id/review-status` | Mark duplicate/non-routable/manual-review without bypassing blockers. |
| GET | `/admin/prospects` | Search prospects under strict PII/RBAC controls. |
| GET | `/admin/lead-assignments` | Search routing outcomes and refusal reasons. |
| GET | `/admin/lead-assignments/:id` | Inspect assignment, audit trail and notification state. |

Broker portal endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/broker/leads` | List only leads assigned to the broker tenant. |
| GET | `/broker/leads/:leadAssignmentId` | Read assigned lead detail and optional AI assistance. |
| PATCH | `/broker/leads/:leadAssignmentId/status` | Mark received/contacted/rejected within portal scope. |

Existing foundation endpoints remain: `/admin/routing/precheck`, `/admin/notifications`, `/admin/audit-logs`, `/admin/feature-flags`, `/admin/consent-texts`, partner/license administration and health endpoints.

## Prisma Data Plan

### New Enums

- `OfferStatus`: `draft`, `review`, `validated`, `active`, `suspended`, `expired`, `retired`.
- `OfferValidationStatus`: `pending`, `validated`, `rejected`.
- `QuoteFormStatus`: `draft`, `published`, `suspended`, `retired`.
- `QuoteRequestStatus`: `draft_refused`, `created`, `manual_review`, `routed`, `non_routable`, `duplicate`, `spam_blocked`, `cancelled`.
- `RoutingStatus`: `not_started`, `eligible`, `assigned`, `blocked`, `no_broker_available`, `manual_review_required`.
- `DuplicateStatus`: `not_checked`, `unique`, `possible_duplicate`, `blocked_duplicate`.
- `LeadAssignmentStatus`: `assigned`, `broker_notified`, `received`, `contacted`, `rejected`, `closed`, `disputed`.
- Extend `NotificationType` with `visitor_quote_confirmation`, `visitor_quote_non_routable`, `broker_lead_assigned`, `quote_notification_failed`.
- Extend `QueueJobType` with `visitor_quote_notification`, `broker_lead_notification`, `ai_quote_summary`, `quote_manual_review`.

### New Models

- `Offer`: public indicative offer scoped to country/product and optionally partner; includes status, validation status, validity period, indicative price range/currency, guarantee summary, sponsor metadata, display order, public wording, audit actor fields and indexes by country/product/status/validity.
- `OfferHistory`: immutable changes for offer wording, price range, status, sponsor state, validation and validity.
- `QuoteFormDefinition`: country/product dynamic form definition with JSON field schema, status, version, language, consentTextId, data minimization notes and publication timestamps.
- `Prospect`: visitor contact profile with normalized email/phone stored according to PII controls, hashed fingerprints, country/product context, retentionUntil and consent references.
- `QuoteRequest`: stable public reference, country/product, optional selectedOfferId, prospectId, consentRecordId, source, sanitized payload reference or JSON, status, duplicateStatus, routingStatus, refusalReason, correlationId and retentionUntil.
- `LeadAssignment`: one quote request to one partner tenant; status, assignedAt, reason, broker notification reference, routing audit reference and unique active assignment protection.
- `RoutingDecision`: optional durable decision record for candidate brokers, exclusion reasons and chosen broker; can reuse/extend `RoutingPrecheck` if implementation keeps one routing evidence table.
- `QuoteAISummary`: optional AI output reference, assistance label state, guardrail result, human validation status and AIInteraction link.

### Existing Models Impacted

- `Country`, `Product`, `CountryProduct`: read flags/status for public journey; no direct schema change unless association-level display metadata is needed.
- `PartnerTenant`, `PartnerCountryAuthorization`, `PartnerProductAuthorization`, `PartnerLicense`: routing eligibility and capacity/quota checks.
- `ConsentText`, `ConsentRecord`: public quote form uses published text; consent created before transmission.
- `AuditLog`: new action names and retention evidence.
- `Notification`, `QueueJobRecord`: new notification/job types and idempotency references.
- `AIModuleConfig`, `AIInteraction`: optional quote summary module.
- `FeatureFlag`, `FeatureFlagHistory`: activation and audit of journey flags.

### Migration Plan

Create one Prisma migration for the new enums/models/indexes. Add constraints:

- Offers cannot be publicly queryable unless status/validation/validity conditions pass in service policy.
- Unique offer slug/key per country/product.
- Quote public reference unique and non-guessable.
- At most one active `LeadAssignment` per `QuoteRequest`.
- Duplicate fingerprints indexed by country/product/contact hash/time window without reversible raw PII.
- Lead/prospect/audit/consent records include retention dates following country/regime overrides or 10-year default.

## Redis Plan

- Feature flags: cache global/country/product journey flags with fail-closed behavior on cache miss plus stale/unverifiable state.
- Public catalog: cache `countries`, `country:{code}`, `products:{country}`, `offers:{country}:{product}:{filterHash}:{sort}` with TTL bounded by offer validity and invalidated on offer/flag/status changes.
- Rate limiting: `rl:public:catalog:{ipHash}` and `rl:quote:{ipHash}:{country}:{product}` counters.
- Anti-spam: `spam:quote:{sessionHash}`, `spam:honey:{sessionHash}`, `spam:burst:{ipHash}` short-lived keys.
- Duplicate detection: `dup:quote:{country}:{product}:{contactFingerprint}` where `contactFingerprint` is salted hash of normalized email/phone, default 30 days.
- Routing lock: `lock:routing:quote:{quoteRequestId}` with short TTL to prevent concurrent assignment.
- Queue idempotency: `idem:notify:visitor:{quoteRequestId}`, `idem:notify:broker:{leadAssignmentId}`, `idem:ai-summary:{quoteRequestId}`.
- Redis keys must never contain raw email, phone, names, free-text answers or full form payloads.

## BullMQ Plan

- `visitor-quote-notifications`: confirmation for routed, non-routable, manual-review or duplicate outcomes.
- `broker-lead-notifications`: assigned broker notification only after `LeadAssignment` is persisted.
- `ai-quote-summary`: optional summary after quote creation when all AI flags and guardrails pass.
- `quote-operations-review`: optional non-routable/duplicate/manual-review follow-up for authorized operations users.

Jobs store only stable IDs, correlationId and minimized routing context. Delivery failures update `Notification` and `QueueJobRecord` as `failed` or `retryable`; retries must not create a second lead assignment or notify non-assigned brokers.

## Routing Rules

1. Block immediately if consent is missing, out of scope, withdrawn or expired.
2. Block if global, country or product public/quote flags are disabled or unverifiable.
3. If `product_manual_review_required` is true, create the request in `manual_review` without broker transmission unless explicit future policy allows routing.
4. Build candidate brokers from active partner tenants authorized for country and product.
5. Exclude candidates with inactive/suspended/retired status, full/blocked capacity, quota exhausted, missing authorization or invalid/expired/suspended/revoked/out-of-scope license.
6. Select at most one candidate using deterministic simple ordering: available capacity, lowest active monthly lead count, oldest successful assignment timestamp, then stable partner id. Sponsored offers cannot override eligibility or become a recommendation.
7. Persist `RoutingDecision`/audit evidence for every exclusion and final result.
8. Create one `LeadAssignment` under Redis lock; if no candidate remains, mark quote as `non_routable` and notify only the visitor/operations scope.

## Consent Logic

- Public quote form fetches a published `ConsentText` for purpose `lead_transmission`, selected country/product, channel `public_web`, language and recipient category `courtier_partenaire_eligible`.
- Submission requires an explicit consent boolean and the exact consentTextId/version/hash rendered to the visitor.
- The system creates `ConsentRecord` before any route attempt. `intendedRecipient` records the planned category before broker selection; the actual selected broker is stored on `LeadAssignment` and in audit/confirmation.
- If consent text is missing, retired or mismatched, the system refuses submission before `Prospect`, routable `QuoteRequest`, `LeadAssignment` or broker notification creation, and writes an audit refusal.
- Optional AI summary requires a separate applicable AI processing basis or documented minimization policy through the AI module; if absent, no AI job is queued.

## Audit Log Coverage

Audit actions to standardize:

- `public_journey.flag_blocked`, `public_country.exposed`, `public_product.exposed`.
- `offer.public_listed`, `offer.public_refused`, `offer.admin_created`, `offer.admin_validated`, `offer.admin_suspended`.
- `quote_form.exposed`, `quote_form.refused`.
- `quote_request.refused`, `quote_request.created`, `quote_request.duplicate_detected`, `quote_request.spam_blocked`, `quote_request.rate_limited`.
- `consent.lead_transmission_granted`, `consent.lead_transmission_refused`.
- `routing.evaluated`, `routing.broker_excluded`, `routing.assigned`, `routing.no_broker_available`, `routing.lock_conflict`.
- `notification.visitor_queued`, `notification.broker_queued`, `notification.delivery_failed`.
- `ai_summary.queued`, `ai_summary.skipped`, `ai_summary.generated`, `ai_summary.guardrail_refused`.
- `broker_lead.read`, `broker_lead.cross_tenant_refused`, `broker_lead.status_updated`.

Contexts must be PII-minimized and include `correlationId`, country/product, target IDs and refusal codes.

## Frontend Impact

### Public Next.js App

- Replace the foundation catalog shell with usable country/product routes, offer lists/details, filters/sorts and a quote form.
- Required pages: country page, product comparison page, offer detail, quote form, confirmation/status.
- UI copy must keep the role of AssurMatch visible and use only allowed CTAs: "Comparer les offres", "Demander un devis", "Etre rappele par un courtier partenaire".
- Form UX must handle mobile/desktop labels, errors, focus order, explicit consent, non-sensitive refusal messages and disabled country/product/offers.
- No page may display buying, subscription, contract-validity, attestation or official recommendation language.

### Admin Back-Office

- Add offer management if missing: list, create, edit, validate/reject, suspend, retire, sponsor label and validity window.
- Add quote operations views: quote requests, non-routable/manual-review requests, prospects under PII scope, lead assignments and notification status.
- Add quote form definition administration if forms are not seed-only.
- Existing feature flag, consent text, partner/license and audit views remain part of activation readiness.

### Broker Portal

- Add minimal assigned lead list/detail/status update for Starter and Pro brokers.
- Starter sees only assigned leads, detail, accept/reject/contacted-style status, minimal history and notifications. It must not receive CRM/Kanban/team assignment/advanced AI by this feature.
- Pro may reuse the same minimal endpoints now; full CRM remains outside this spec unless already enabled by the 001 scope.

## Tests Plan

- Unit: offer publication policy, quote form selection, quote DTO validation, consent policy, duplicate hashing, rate limit/anti-spam, broker eligibility, routing ordering, notification idempotency, AI summary flag policy and content safety.
- Integration: public country/product/offers/form/submission/status endpoints; admin offer/form/quote/lead endpoints; broker lead endpoints; Redis duplicate/rate limit locks; BullMQ job creation; audit log writes.
- Contract: OpenAPI contract for all public/admin/broker endpoints, request/response schemas and error shapes.
- RBAC/MFA: admin scopes, broker tenant isolation, cross-broker refusal, PII-restricted prospect access and sensitive admin mutation MFA.
- Constitutional guardrails: no expired/non-validated offers public, no consent means no assignment, no inactive/unauthorized/expired-license broker routing, disabled country/product/global flags block, AI disabled means zero model calls, no forbidden public wording.
- Playwright smoke: public country -> product -> offers -> detail -> quote form -> consent -> confirmation on desktop and mobile; disabled country/product and no-consent paths; visible indicative/sponsored wording.

## Project Structure

### Documentation

```text
specs/002-comparateur-demande-devis/
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    comparator-quote-api.openapi.yaml
```

### Source Code To Touch During Implementation

```text
apps/
  public/app/                         # country/product/offers/quote public journey
  admin/app/                          # offers, quote operations and form admin views
  broker/app/                         # assigned lead list/detail/status
backend/
  src/modules/
    offers/
    quote-forms/
    quote-requests/
    prospects/
    leads/
    routing/                          # extend from precheck to assignment
    notifications/                    # extend visitor/broker notification jobs
    ai/                               # optional quote summary only
    common/                           # reusable rate limit, anti-spam, duplicate helpers
  prisma/
    schema.prisma
    migrations/
  tests/
    unit/
    integration/
    contract/
    guardrails/
packages/
  shared/contracts/
    quote.contracts.ts
```

**Structure Decision**: Keep the 001 modular monolith. Add narrow domain modules rather than a broad comparator module so public catalog, quote submission, routing, leads, notifications and AI remain separately testable and auditable.

## Complexity Tracking

No constitutional violations or exceptions are required.
