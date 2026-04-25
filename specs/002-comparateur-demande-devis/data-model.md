# Data Model: Comparateur public et demande de devis

## Existing Foundation Entities Used

- `Country`: controls public, quote, comparison and AI activation by country.
- `Product`: controls public, quote, comparison, sensitivity, manual review and AI form behavior.
- `CountryProduct`: binds active products to countries and may carry association-level flags/status.
- `PartnerTenant`: broker partner tenant with plan, status, capacity and quota.
- `PartnerCountryAuthorization` and `PartnerProductAuthorization`: prove broker country/product authorization.
- `PartnerLicense`: validates broker license status, dates and country/product scope.
- `ConsentText` and `ConsentRecord`: exact consent wording and visitor proof before lead transmission.
- `FeatureFlag` and `FeatureFlagHistory`: global, country, product, partner, plan, module and AI activation.
- `AuditLog`: immutable evidence for sensitive decisions and refusals.
- `Notification` and `QueueJobRecord`: observable async delivery and job state.
- `AIModuleConfig` and `AIInteraction`: optional quote summary controls and audit.
- `RoutingPrecheck`: can be reused or extended for routing diagnostic evidence.

## New Or Extended Entities

### Offer

Represents an indicative public offer.

Fields:
- `id`
- `countryId`
- `productId`
- `partnerTenantId` optional
- `publicKey` or `slug`
- `name`
- `shortDescription`
- `guaranteeSummary`
- `indicativePriceMin`
- `indicativePriceMax`
- `currency`
- `pricingUnit`
- `status`
- `validationStatus`
- `validFrom`
- `validUntil`
- `isSponsored`
- `sponsorLabel`
- `displayPriority`
- `publicDisclaimers`
- `createdAt`, `updatedAt`, `createdById`, `validatedById`, `validatedAt`

Validation rules:
- Public display requires active/validated status, country/product scope, current validity period and active comparison flags.
- Public wording must include indicative-price constraints and avoid forbidden regulated wording.
- Sponsored offers must show a visible sponsor label wherever displayed.

Relationships:
- Belongs to `Country`, `Product` and optionally `PartnerTenant`.
- Has many `OfferHistory` records.
- May be referenced by `QuoteRequest.selectedOfferId`.

### OfferHistory

Immutable history for changes to offer wording, status, validation, sponsorship and validity.

Fields:
- `id`
- `offerId`
- `changedById`
- `changeType`
- `previousValue`
- `nextValue`
- `reason`
- `changedAt`

### QuoteFormDefinition

Versioned dynamic form for one country/product.

Fields:
- `id`
- `countryId`
- `productId`
- `language`
- `version`
- `status`
- `fields` JSON
- `validationSchema` JSON
- `consentTextId`
- `dataMinimizationNotes`
- `publishedAt`
- `retiredAt`
- `createdAt`, `updatedAt`, `createdById`

Validation rules:
- Only `published` definitions are public.
- Fields must have stable keys, labels, type, required flag, allowed values and sensitivity metadata.
- Sensitive products default to manual review unless product flags explicitly allow automated next steps.

### Prospect

Visitor/prospect identity and contact context.

Fields:
- `id`
- `countryId`
- `productId`
- `emailNormalized`
- `phoneNormalized`
- `emailFingerprint`
- `phoneFingerprint`
- `displayName`
- `preferredContactChannel`
- `consentRecordIds`
- `retentionUntil`
- `createdAt`, `updatedAt`

Validation rules:
- Email and phone validation are country-aware.
- Redis/database duplicate keys use non-reversible salted fingerprints.
- Logs and audit contexts do not include raw contact values.

### QuoteRequest

Visitor quote request created after valid public submission.

Fields:
- `id`
- `publicReference`
- `verificationTokenHash`
- `countryId`
- `productId`
- `selectedOfferId` optional
- `quoteFormDefinitionId`
- `prospectId`
- `consentRecordId`
- `source`
- `payload` JSON or protected payload reference
- `status`
- `duplicateStatus`
- `routingStatus`
- `refusalReason`
- `manualReviewReason`
- `correlationId`
- `retentionUntil`
- `createdAt`, `updatedAt`

Validation rules:
- A routable request requires valid `ConsentRecord`.
- Missing consent text or unchecked consent creates no routable request, prospect or assignment.
- Duplicate/spam/rate-limited requests cannot create a second active assignment.

State transitions:
- `created` -> `routed`
- `created` -> `non_routable`
- `created` -> `manual_review`
- `created` -> `duplicate`
- `created` -> `cancelled`
- refused pre-persistence submissions are audited as `draft_refused` events rather than transmitted.

### LeadAssignment

Single assignment from a quote request to one eligible broker.

Fields:
- `id`
- `quoteRequestId`
- `partnerTenantId`
- `status`
- `assignedAt`
- `assignmentReason`
- `routingDecisionId`
- `brokerNotificationId`
- `lastBrokerActionAt`
- `createdAt`, `updatedAt`

Validation rules:
- At most one active assignment per quote request.
- Partner must be active, authorized for country/product, within capacity/quota and covered by valid license.
- Broker notification is allowed only after assignment persistence.

State transitions:
- `assigned` -> `broker_notified`
- `broker_notified` -> `received`
- `received` -> `contacted`
- `received` or `contacted` -> `rejected`
- any active broker-handling state -> `closed`
- assigned broker may dispute according to future operational policy, without exposing other tenants.

### RoutingDecision

Durable routing decision and candidate evidence.

Fields:
- `id`
- `quoteRequestId`
- `result`
- `selectedPartnerTenantId` optional
- `candidateCount`
- `excludedCandidates` JSON with partner id and reason codes
- `reasons`
- `correlationId`
- `createdAt`

Validation rules:
- Records both successes and refusals.
- Exclusion reasons must be non-PII and auditable.

### QuoteAISummary

Optional assistance-only summary of the quote request.

Fields:
- `id`
- `quoteRequestId`
- `aiInteractionId`
- `summaryReference`
- `guardrailResult`
- `humanValidationStatus`
- `visibleToBroker`
- `createdAt`, `updatedAt`

Validation rules:
- Created only when AI flags and module config pass.
- Cannot contain official recommendation, firm price, eligibility, acceptance/refusal or broker-routing decision.

## Enum Additions

- `OfferStatus`: `draft`, `review`, `validated`, `active`, `suspended`, `expired`, `retired`.
- `OfferValidationStatus`: `pending`, `validated`, `rejected`.
- `QuoteFormStatus`: `draft`, `published`, `suspended`, `retired`.
- `QuoteRequestStatus`: `draft_refused`, `created`, `manual_review`, `routed`, `non_routable`, `duplicate`, `spam_blocked`, `cancelled`.
- `RoutingStatus`: `not_started`, `eligible`, `assigned`, `blocked`, `no_broker_available`, `manual_review_required`.
- `DuplicateStatus`: `not_checked`, `unique`, `possible_duplicate`, `blocked_duplicate`.
- `LeadAssignmentStatus`: `assigned`, `broker_notified`, `received`, `contacted`, `rejected`, `closed`, `disputed`.

## Indexes And Constraints

- `Offer(countryId, productId, status, validationStatus, validFrom, validUntil)`.
- Unique `Offer(countryId, productId, publicKey)`.
- `QuoteFormDefinition(countryId, productId, language, status, version)`.
- Unique `QuoteRequest.publicReference`.
- `QuoteRequest(countryId, productId, status, routingStatus, createdAt)`.
- `Prospect(countryId, productId, emailFingerprint, phoneFingerprint, createdAt)`.
- Unique active `LeadAssignment(quoteRequestId)` enforced by service and database partial index where supported.
- `LeadAssignment(partnerTenantId, status, assignedAt)`.
- `RoutingDecision(quoteRequestId, createdAt)`.

## Retention

Audit, consent and lead evidence default to 10 years unless `RegulatoryRegime.retentionOverrideYears` applies. Personal data deletion/anonymization must preserve minimal non-PII evidence when legally allowed.
