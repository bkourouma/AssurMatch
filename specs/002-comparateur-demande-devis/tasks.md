# Tasks: Comparateur public et demande de devis AssurMatch

**Input**: Design documents from `/specs/002-comparateur-demande-devis/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/comparator-quote-api.openapi.yaml`, `quickstart.md`, `.specify/memory/constitution.md`

**Tests**: Required. Spec 002 covers public endpoints, consent, routing, RBAC, Redis, BullMQ, AI and constitutional guardrails.

**Organization**: Tasks are grouped by phase and user story. Each user story must be independently testable behind feature flags.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase when owners avoid shared files.
- **[Story]**: `US1` to `US7`, matching user stories in `spec.md`.
- Every task includes exact paths to change or test.
- Do not implement payments, subscription, e-signature, policy issuance, attestation, claims, insurer API, advanced multi-broker routing or binding AI recommendation.

## Phase 1: Setup and Traceability

**Purpose**: Prepare implementation surfaces without adding behavior yet.

- [X] T001 Read and confirm constitutional exclusions in `.specify/memory/constitution.md` before editing any implementation file.
- [X] T002 [P] Create implementation directories `backend/src/modules/offers/`, `backend/src/modules/quote-forms/`, `backend/src/modules/quote-requests/`, `backend/src/modules/prospects/`, and `backend/src/modules/leads/`.
- [X] T003 [P] Create test directories `backend/tests/unit/offers/`, `backend/tests/unit/quote-forms/`, `backend/tests/unit/quote-requests/`, `backend/tests/unit/leads/`, and `backend/tests/unit/ai/quote-summary/`.
- [X] T004 [P] Create integration test directories `backend/tests/integration/public-quotes/`, `backend/tests/integration/offers/`, `backend/tests/integration/leads/`, and `backend/tests/integration/quote-operations/`.
- [X] T005 [P] Create Playwright test directories `apps/public/tests/`, `apps/admin/tests/quotes/`, and `apps/broker/tests/leads/`.
- [X] T006 [P] Add spec 002 contract test fixture reference for `specs/002-comparateur-demande-devis/contracts/comparator-quote-api.openapi.yaml` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T007 [P] Add shared quote contract export placeholder in `packages/shared/contracts/index.ts` for future `packages/shared/contracts/quote.contracts.ts`.
- [X] T008 Document implementation handoff notes for spec 002 in `specs/002-comparateur-demande-devis/quickstart.md` only if paths or commands change during implementation.

**Phase 1 validation criteria**:
- Only planned directories, tests, contracts or documentation surfaces are introduced.
- No public behavior is activated.
- Constitution and plan remain the source of truth for scope.

## Phase 2: Foundational Data, Contracts and Constitutional Controls

**Purpose**: Build the shared data model and blocking controls required before any user story behavior.

- [X] T009 [P] Add `OfferStatus`, `OfferValidationStatus`, `QuoteFormStatus`, `QuoteRequestStatus`, `RoutingStatus`, `DuplicateStatus`, and `LeadAssignmentStatus` enums in `backend/prisma/schema.prisma`.
- [X] T010 [P] Extend `NotificationType` and `QueueJobType` for quote visitor, broker lead, AI summary and manual review jobs in `backend/prisma/schema.prisma`.
- [X] T011 Add Prisma models `Offer`, `OfferHistory`, `QuoteFormDefinition`, `Prospect`, `QuoteRequest`, `LeadAssignment`, `RoutingDecision`, and `QuoteAISummary` in `backend/prisma/schema.prisma`.
- [X] T012 Add Prisma indexes and uniqueness constraints for offer visibility, quote public reference, prospect fingerprints, active lead assignment and routing decisions in `backend/prisma/schema.prisma`.
- [X] T013 Create migration folder `backend/prisma/migrations/0002_comparator_quote/` generated from the schema changes in `backend/prisma/schema.prisma`.
- [X] T014 [P] Add acceptance seed helpers for pilot country, disabled country, products, consent text, offers and brokers in `backend/tests/integration/helpers/comparator-quote-seed.ts`.
- [X] T015 [P] Add Prisma model regression tests for offer, quote, prospect, lead and routing constraints in `backend/tests/integration/public-quotes/prisma-models.spec.ts`.
- [X] T016 [P] Add shared Zod schemas and DTO types for public country/product pages, offers, quote forms, quote submission, confirmations, status, admin offers, broker leads and admin quote operations in `packages/shared/contracts/quote.contracts.ts`.
- [X] T017 [P] Add DTO validation tests for country code, product key, offer query, form fields, consent object, contact data and broker lead status in `backend/tests/unit/quote-requests/quote-contracts.spec.ts`.
- [X] T018 Add feature flag defaults and scope documentation for `public_comparator_enabled`, `quote_request_enabled`, `sponsored_offers_enabled`, `ai_summary_enabled`, and `ai_duplicate_detection_enabled` in `backend/src/modules/feature-flags/default-flags.ts`.
- [X] T019 Add public journey flag resolution policy for global, country and product fail-closed checks in `backend/src/modules/feature-flags/public-journey-flag-policy.ts`.
- [X] T020 Add RBAC permission entries for `offers`, `quote_form_definitions`, `quote_requests`, `prospects`, `lead_assignments`, and `broker_leads` in `packages/shared/rbac/assurmatch-role-matrix.ts`.
- [X] T021 Add audit action constants for offer, quote, consent, routing, notification, duplicate, rate-limit, spam, broker lead and AI events in `backend/src/modules/audit-logs/quote-audit-actions.ts`.
- [X] T022 [P] Add Redis key helper tests proving no raw PII in quote keys in `backend/tests/unit/common/quote-redis-keys.spec.ts`.
- [X] T023 Add Redis key helper for catalog cache, rate limits, anti-spam, duplicate fingerprints, routing locks and queue idempotency in `backend/src/modules/common/redis/quote-redis-keys.ts`.
- [X] T024 [P] Add queue name constants for `visitor-quote-notifications`, `broker-lead-notifications`, `ai-quote-summary`, and `quote-operations-review` in `backend/src/modules/common/queues/quote-queue-names.ts`.
- [X] T025 Add module wiring placeholders for offers, quote forms, quote requests, prospects and leads in `backend/src/app.module.ts`.
- [X] T026 [P] Add constitutional guardrail tests for forbidden payment, subscription, issuance, attestation, claims and recommendation scope in `backend/tests/guardrails/content/comparator-scope-exclusions.spec.ts`.

**Phase 2 validation criteria**:
- Prisma schema covers all entities from `data-model.md`.
- Shared DTOs map to `comparator-quote-api.openapi.yaml`.
- Broader-scope feature flags fail closed by design.
- RBAC, audit, Redis and queue primitives are ready before story implementation.

## Phase 3: User Story 1 - Selectionner un pays et un produit public (Priority: P1)

**Goal**: A visitor can select only active public countries and products, with AssurMatch technical platform wording visible.

**Independent Test**: Enable one pilot country and two products, leave one country and one product disabled, then verify only allowed public entries appear.

### Tests for User Story 1

- [X] T027 [P] [US1] Add contract tests for `GET /countries`, `GET /countries/{countryCode}`, `GET /countries/{countryCode}/products`, and `GET /countries/{countryCode}/products/{productKey}` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T028 [P] [US1] Add unit tests for public journey flag policy with global, country and product disabled states in `backend/tests/unit/feature-flags/public-journey-flag-policy.spec.ts`.
- [X] T029 [P] [US1] Add integration tests for public country and product visibility, waitlist-only state and deep URL blocking in `backend/tests/integration/public-quotes/public-country-product.spec.ts`.
- [X] T030 [P] [US1] Add guardrail tests for required technical platform wording and forbidden public phrases on country/product responses in `backend/tests/guardrails/content/public-journey-wording.spec.ts`.
- [X] T031 [P] [US1] Add Playwright smoke for public country-to-product navigation on desktop and mobile in `apps/public/tests/public-country-product.spec.ts`.

### Implementation for User Story 1

- [X] T032 [P] [US1] Extend public country response DTOs and journey state mapping in `packages/shared/contracts/quote.contracts.ts`.
- [X] T033 [P] [US1] Extend `CountriesService` public detail behavior with global and country flag checks in `backend/src/modules/countries/countries.module.ts`.
- [X] T034 [P] [US1] Extend `ProductsService` public country/product filtering with product and country-product flags in `backend/src/modules/products/products.module.ts`.
- [X] T035 [US1] Add `GET /countries/:countryCode` controller behavior with audit for exposed and blocked public country access in `backend/src/modules/countries/public-countries.controller.ts`.
- [X] T036 [US1] Add `GET /countries/:countryCode/products` and `GET /countries/:countryCode/products/:productKey` behavior with fail-closed product checks in `backend/src/modules/products/public-products.controller.ts`.
- [X] T037 [US1] Add public catalog cache reads and invalidation hooks for countries and products in `backend/src/modules/countries/catalog-cache.service.ts`.
- [X] T038 [US1] Add non-sensitive public error responses for disabled country/product/flag states in `backend/src/modules/common/filters/error-response.filter.ts`.
- [X] T039 [US1] Build public country route page with technical platform wording in `apps/public/app/countries/[countryCode]/page.tsx`.
- [X] T040 [US1] Build public product route page with comparison and quote availability states in `apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx`.
- [X] T041 [US1] Add reusable public journey components for country/product state, legal notice and allowed CTAs in `apps/public/app/components/public-journey.tsx`.

**Phase 3 validation criteria**:
- Disabled countries/products do not expose offers or quote paths.
- Public pages use allowed wording only.
- US1 passes contract, integration, guardrail and Playwright tests independently.

## Phase 4: User Story 2 - Comparer des offres indicatives actives (Priority: P1)

**Goal**: A visitor can compare only active, validated, in-period indicative offers with safe filters, sorting and sponsorship labels.

**Independent Test**: Publish active, expired, non-validated and sponsored offers, then verify only valid offers are public and all required wording appears.

### Tests for User Story 2

- [X] T042 [P] [US2] Add contract tests for `GET /countries/{countryCode}/products/{productKey}/offers` and `GET /offers/{offerId}` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T043 [P] [US2] Add unit tests for `OfferPublicationPolicy` covering active, expired, suspended, draft, non-validated and out-of-scope offers in `backend/tests/unit/offers/offer-publication-policy.spec.ts`.
- [X] T044 [P] [US2] Add unit tests for offer filters and sorts never producing recommendation semantics in `backend/tests/unit/offers/public-offer-catalog.service.spec.ts`.
- [X] T045 [P] [US2] Add integration tests for public offer list/detail visibility, sponsor labels and cache invalidation in `backend/tests/integration/offers/public-offers.spec.ts`.
- [X] T046 [P] [US2] Add guardrail tests for indicative wording and forbidden recommendation phrases in `backend/tests/guardrails/content/offer-wording.spec.ts`.
- [X] T047 [P] [US2] Add admin offer contract tests for `/admin/offers` and `/admin/offers/{offerId}/validate` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T048 [P] [US2] Add Playwright smoke for offer list, filters, sort, sponsor label and offer detail in `apps/public/tests/public-offers.spec.ts`.

### Implementation for User Story 2

- [X] T049 [P] [US2] Implement offer DTOs and Zod validation for public and admin offer payloads in `packages/shared/contracts/quote.contracts.ts`.
- [X] T050 [P] [US2] Implement `OfferPublicationPolicy` with fail-closed status, validation, scope, flag and validity checks in `backend/src/modules/offers/offer-publication-policy.ts`.
- [X] T051 [P] [US2] Implement `OfferAdminService` for create, update, validate, suspend and retire with `OfferHistory` audit context in `backend/src/modules/offers/offer-admin.service.ts`.
- [X] T052 [P] [US2] Implement `PublicOfferCatalogService` for list/detail, filters, sorts, sponsor labels and no recommendation wording in `backend/src/modules/offers/public-offer-catalog.service.ts`.
- [X] T053 [US2] Add public offer controllers for list and detail in `backend/src/modules/offers/public-offers.controller.ts`.
- [X] T054 [US2] Add admin offer controllers for search/create/update/validate in `backend/src/modules/offers/admin-offers.controller.ts`.
- [X] T055 [US2] Add offer cache keys, TTL bounded by validity window and invalidation on offer/flag/status changes in `backend/src/modules/offers/offer-cache.service.ts`.
- [X] T056 [US2] Register `OffersModule` providers and controllers in `backend/src/modules/offers/offers.module.ts`.
- [X] T057 [US2] Build offer list UI with filters, sorts, sponsor badges and indicative wording in `apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx`.
- [X] T058 [US2] Build offer detail UI with validity, limits summary, sponsor label and broker responsibility wording in `apps/public/app/offers/[offerId]/page.tsx`.
- [X] T059 [US2] Build admin offer management UI for list, edit, validation and suspension in `apps/admin/app/offers/page.tsx`.

**Phase 4 validation criteria**:
- Expired, draft, suspended, non-validated and out-of-scope offers are never public.
- Sponsor labels are visible and never override eligibility or become a recommendation.
- US2 passes contract, unit, integration, guardrail and Playwright tests independently.

## Phase 5: User Story 3 - Demander un devis avec formulaire dynamique et consentement explicite (Priority: P1)

**Goal**: A visitor can load a dynamic country/product form, submit validated contact data, give explicit consent, and create Prospect plus QuoteRequest.

**Independent Test**: Configure a form with required fields, submit valid consented data, then submit without consent, invalid email, invalid phone and quote-disabled product variants.

### Tests for User Story 3

- [X] T060 [P] [US3] Add contract tests for `GET /countries/{countryCode}/products/{productKey}/quote-form` and `POST /quote-requests` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T061 [P] [US3] Add unit tests for quote form selection, published status, consent text reference and product sensitivity rules in `backend/tests/unit/quote-forms/quote-form-definition.service.spec.ts`.
- [X] T062 [P] [US3] Add unit tests for country-aware email/phone validation, normalized contact values and non-reversible fingerprints in `backend/tests/unit/prospects/prospect-identity.service.spec.ts`.
- [X] T063 [P] [US3] Add unit tests for `LeadTransmissionConsentPolicy` blocking missing, unchecked, retired, withdrawn, expired and out-of-scope consent in `backend/tests/unit/quote-requests/lead-transmission-consent-policy.spec.ts`.
- [X] T064 [P] [US3] Add integration tests for quote form exposure, quote flag blocking, successful consent record creation and refused no-consent submissions in `backend/tests/integration/public-quotes/quote-form-consent.spec.ts`.
- [X] T065 [P] [US3] Add integration tests proving invalid email/phone/malformed payload creates no Prospect, QuoteRequest, LeadAssignment or broker notification in `backend/tests/integration/public-quotes/quote-validation.spec.ts`.
- [X] T066 [P] [US3] Add audit tests for consent granted/refused, QuoteRequest created/refused and Prospect created/linked in `backend/tests/integration/public-quotes/quote-audit.spec.ts`.
- [X] T067 [P] [US3] Add Playwright smoke for quote form labels, field errors, consent checkbox and quote-disabled product state in `apps/public/tests/public-quote-form.spec.ts`.

### Implementation for User Story 3

- [X] T068 [P] [US3] Implement quote form DTOs, field schemas and public form response types in `packages/shared/contracts/quote.contracts.ts`.
- [X] T069 [P] [US3] Implement `QuoteFormDefinitionService` for published form lookup, versioning, language fallback and consent text binding in `backend/src/modules/quote-forms/quote-form-definition.service.ts`.
- [X] T070 [P] [US3] Implement admin quote form definition controller for create/search/update/publish/retire in `backend/src/modules/quote-forms/admin-quote-form-definitions.controller.ts`.
- [X] T071 [US3] Implement public quote form controller with quote flags, product sensitivity and non-sensitive errors in `backend/src/modules/quote-forms/public-quote-forms.controller.ts`.
- [X] T072 [P] [US3] Implement `ProspectIdentityService` for contact normalization, fingerprint generation, retention and PII-safe logs in `backend/src/modules/prospects/prospect-identity.service.ts`.
- [X] T073 [P] [US3] Implement `ProspectsService` for create/link/search with strict PII boundaries in `backend/src/modules/prospects/prospects.service.ts`.
- [X] T074 [P] [US3] Implement `LeadTransmissionConsentPolicy` wrapping existing consent guard behavior in `backend/src/modules/quote-requests/lead-transmission-consent-policy.ts`.
- [X] T075 [US3] Implement `QuoteSubmissionService` flow through validation, consent record creation, Prospect creation/linking and QuoteRequest creation before routing handoff in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T076 [US3] Implement public quote request controller for `POST /quote-requests` without synchronous heavy work in `backend/src/modules/quote-requests/public-quote-requests.controller.ts`.
- [X] T077 [US3] Implement admin quote request and prospect search endpoints with RBAC, MFA where needed, country/product scope and pagination in `backend/src/modules/quote-requests/admin-quote-requests.controller.ts`.
- [X] T078 [US3] Register `QuoteFormsModule`, `ProspectsModule`, and `QuoteRequestsModule` in `backend/src/app.module.ts`.
- [X] T079 [US3] Build public quote form page with dynamic fields, explicit consent, legal wording and non-sensitive error states in `apps/public/app/countries/[countryCode]/products/[productKey]/quote/page.tsx`.
- [X] T080 [US3] Build reusable public form components for field rendering, validation errors, consent block and legal notices in `apps/public/app/components/quote-form.tsx`.
- [X] T081 [US3] Build admin quote form definition UI for form versioning and publication in `apps/admin/app/quote-form-definitions/page.tsx`.

**Phase 5 validation criteria**:
- No consent means no routable QuoteRequest, no Prospect, no LeadAssignment and no broker notification.
- Valid consent is recorded before any routing handoff.
- Public form validation never logs raw PII in audit, queues, metrics or errors.

## Phase 6: User Story 4 - Router simplement vers un courtier eligible (Priority: P1)

**Goal**: After valid consent, route to at most one active, authorized, licensed broker, or keep the request non-routable.

**Independent Test**: Configure eligible, inactive, unauthorized and expired-license brokers, then verify only the eligible broker can receive a LeadAssignment.

### Tests for User Story 4

- [X] T082 [P] [US4] Add unit tests for broker eligibility covering active status, country authorization, product authorization, capacity, quota and valid license in `backend/tests/unit/leads/broker-eligibility-policy.spec.ts`.
- [X] T083 [P] [US4] Add unit tests for routing ordering, one-broker selection and sponsored-offer non-influence in `backend/tests/unit/leads/quote-routing.service.spec.ts`.
- [X] T084 [P] [US4] Add integration tests for successful LeadAssignment creation after valid consent in `backend/tests/integration/leads/routing-success.spec.ts`.
- [X] T085 [P] [US4] Add integration tests excluding inactive, unauthorized, over-quota and expired/suspended/invalid/revoked license brokers with audit reasons in `backend/tests/integration/leads/routing-blockers.spec.ts`.
- [X] T086 [P] [US4] Add integration tests for no eligible broker producing non-routable QuoteRequest and no broker notification in `backend/tests/integration/leads/no-broker-available.spec.ts`.
- [X] T087 [P] [US4] Add Redis routing lock and duplicate active assignment tests in `backend/tests/integration/leads/routing-lock.spec.ts`.
- [X] T088 [P] [US4] Add broker RBAC tests for assigned lead access and cross-tenant refusal audit in `backend/tests/integration/leads/broker-lead-rbac.spec.ts`.
- [X] T089 [P] [US4] Add contract tests for `/broker/leads`, `/broker/leads/{leadAssignmentId}`, `/broker/leads/{leadAssignmentId}/status`, and `/admin/lead-assignments` in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.

### Implementation for User Story 4

- [X] T090 [P] [US4] Implement `BrokerEligibilityPolicy` with partner status, authorizations, capacity, quota and license checks in `backend/src/modules/leads/broker-eligibility-policy.ts`.
- [X] T091 [P] [US4] Extend partner authorization lookup for routing candidates in `backend/src/modules/partners/partner-eligibility.service.ts`.
- [X] T092 [P] [US4] Extend license validity lookup for country/product scope and expiration blocking in `backend/src/modules/partner-licenses/license-expiration.service.ts`.
- [X] T093 [US4] Implement `QuoteRoutingService` with consent precondition, flag precondition, deterministic candidate ordering, routing lock and no-broker state in `backend/src/modules/leads/quote-routing.service.ts`.
- [X] T094 [US4] Implement `RoutingDecisionService` to persist selected broker, exclusions, refusal reasons and correlationId in `backend/src/modules/leads/routing-decision.service.ts`.
- [X] T095 [US4] Implement `LeadAssignmentService` to create one active assignment, link QuoteRequest, update routing status and audit assignment in `backend/src/modules/leads/lead-assignment.service.ts`.
- [X] T096 [US4] Extend `QuoteSubmissionService` to call routing after consented QuoteRequest creation and preserve non-routable/manual-review states in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T097 [US4] Implement broker lead controllers with tenant guard and paginated list/detail/status update in `backend/src/modules/leads/broker-leads.controller.ts`.
- [X] T098 [US4] Implement admin lead assignment controllers for scoped search/detail in `backend/src/modules/leads/admin-lead-assignments.controller.ts`.
- [X] T099 [US4] Implement `LeadAccessPolicy` for broker tenant isolation and admin country/product scope checks in `backend/src/modules/leads/lead-access-policy.ts`.
- [X] T100 [US4] Register `LeadsModule` and routing providers in `backend/src/modules/leads/leads.module.ts`.
- [X] T101 [US4] Build broker assigned lead list/detail/status UI without Starter CRM features in `apps/broker/app/leads/page.tsx`.
- [X] T102 [US4] Build admin lead assignment and routing outcome UI in `apps/admin/app/lead-assignments/page.tsx`.

**Phase 6 validation criteria**:
- No lead is routed without valid consent.
- No lead is routed to inactive, unauthorized, over-quota or invalid-license brokers.
- No eligible broker produces non-routable state and no broker notification.
- Broker cross-tenant reads are refused and audited.

## Phase 7: User Story 5 - Confirmer et notifier minimalement (Priority: P2)

**Goal**: Notify the visitor and assigned broker minimally and expose visitor-safe status without promises or excess PII.

**Independent Test**: Submit routed and non-routable requests, then verify visitor messages, assigned broker notification, absence of notification for ineligible brokers and delivery status.

### Tests for User Story 5

- [X] T103 [P] [US5] Add contract tests for `GET /quote-requests/{publicReference}` status response in `backend/tests/contract/comparator-quote-api.contract.spec.ts`.
- [X] T104 [P] [US5] Add unit tests for quote notification idempotency keys and minimized payloads in `backend/tests/unit/notifications/quote-notification.service.spec.ts`.
- [X] T105 [P] [US5] Add integration tests for visitor routed, non-routable, manual-review and duplicate confirmation jobs in `backend/tests/integration/public-quotes/visitor-notifications.spec.ts`.
- [X] T106 [P] [US5] Add integration tests for broker notification queued only after LeadAssignment and only for assigned broker in `backend/tests/integration/leads/broker-notifications.spec.ts`.
- [X] T107 [P] [US5] Add integration tests for notification failure, retryable status and no duplicate LeadAssignment in `backend/tests/integration/notifications/quote-notification-failures.spec.ts`.
- [X] T108 [P] [US5] Add guardrail tests for visitor and broker notification wording excluding firm price, acceptance, contract, attestation, subscription and guaranteed callback claims in `backend/tests/guardrails/content/quote-notification-wording.spec.ts`.
- [X] T109 [P] [US5] Add Playwright smoke for visitor confirmation and status page in `apps/public/tests/public-quote-confirmation.spec.ts`.

### Implementation for User Story 5

- [X] T110 [P] [US5] Implement confirmation and status DTOs in `packages/shared/contracts/quote.contracts.ts`.
- [X] T111 [P] [US5] Implement `QuoteNotificationService` for visitor and broker job enqueueing with idempotency and minimized payloads in `backend/src/modules/notifications/quote-notification.service.ts`.
- [X] T112 [P] [US5] Extend notification processor for visitor quote and broker lead notifications in `backend/src/jobs/notifications/notification.processor.ts`.
- [X] T113 [US5] Extend `QuoteSubmissionService` to enqueue visitor confirmation for routed, non-routable, manual-review and duplicate outcomes in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T114 [US5] Extend `LeadAssignmentService` to enqueue broker notification only after successful assignment persistence in `backend/src/modules/leads/lead-assignment.service.ts`.
- [X] T115 [US5] Implement public quote status controller with token verification and visitor-safe response in `backend/src/modules/quote-requests/public-quote-status.controller.ts`.
- [X] T116 [US5] Extend admin notifications view filtering for quote visitor and broker lead notification statuses in `backend/src/modules/notifications/admin-notifications.controller.ts`.
- [X] T117 [US5] Build public confirmation page with assigned broker or non-routable state and indicative wording in `apps/public/app/quote-requests/[publicReference]/page.tsx`.
- [X] T118 [US5] Build admin quote operations page for quote request, routing, consent and notification state in `apps/admin/app/quote-requests/page.tsx`.

**Phase 7 validation criteria**:
- Public endpoint returns before delivery completion.
- Broker notification is never sent to unassigned or ineligible brokers.
- Visitor wording never promises price, acceptance, policy, attestation, subscription or callback when unavailable.

## Phase 8: User Story 6 - Bloquer spam, doublons et entrees non conformes (Priority: P2)

**Goal**: Protect quote submission against rate abuse, spam, duplicates and malformed payloads before expensive work.

**Independent Test**: Simulate rapid submissions, duplicate contact fingerprints, malformed payloads and IP/session over-limit attempts.

### Tests for User Story 6

- [X] T119 [P] [US6] Add unit tests for public quote rate limit counters and TTL behavior in `backend/tests/unit/quote-requests/public-quote-rate-limit.service.spec.ts`.
- [X] T120 [P] [US6] Add unit tests for anti-spam honeypot, burst and suspicious fingerprint checks without raw PII in `backend/tests/unit/quote-requests/public-anti-spam.service.spec.ts`.
- [X] T121 [P] [US6] Add unit tests for duplicate contact fingerprint generation and 30-day policy in `backend/tests/unit/quote-requests/quote-duplicate-detection.service.spec.ts`.
- [X] T122 [P] [US6] Add integration tests for rate-limited submissions producing no broker notification and PII-minimized audit in `backend/tests/integration/public-quotes/rate-limit.spec.ts`.
- [X] T123 [P] [US6] Add integration tests for duplicate request blocked or marked duplicate without second active LeadAssignment in `backend/tests/integration/public-quotes/duplicate-detection.spec.ts`.
- [X] T124 [P] [US6] Add integration tests for malformed/spammy payload refusal before routing, notifications or AI work in `backend/tests/integration/public-quotes/anti-spam.spec.ts`.
- [X] T125 [P] [US6] Add Redis key scan guardrail test to reject raw email, phone, names and free-text answers in `backend/tests/guardrails/content/redis-pii-keys.spec.ts`.

### Implementation for User Story 6

- [X] T126 [P] [US6] Implement `PublicQuoteRateLimitService` using Redis counters by IP/session/country/product in `backend/src/modules/quote-requests/public-quote-rate-limit.service.ts`.
- [X] T127 [P] [US6] Implement `PublicAntiSpamService` for honeypot, challenge, burst and suspicious payload checks in `backend/src/modules/quote-requests/public-anti-spam.service.ts`.
- [X] T128 [P] [US6] Implement `QuoteDuplicateDetectionService` with Redis-first salted fingerprints and durable duplicate status in `backend/src/modules/quote-requests/quote-duplicate-detection.service.ts`.
- [X] T129 [US6] Integrate rate limit, anti-spam and duplicate checks before consent, routing, notification or AI work in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T130 [US6] Add PII-minimized audit for rate-limit, spam and duplicate outcomes in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T131 [US6] Add visitor-facing non-sensitive error states for rate limit, duplicate and malformed payloads in `apps/public/app/components/quote-form.tsx`.
- [X] T132 [US6] Add admin duplicate and non-routable review actions without bypassing blockers in `backend/src/modules/quote-requests/admin-quote-requests.controller.ts`.

**Phase 8 validation criteria**:
- Abuse checks run before expensive validation, routing, notifications or AI.
- Duplicate requests do not create multiple active assignments.
- Redis keys and audit contexts contain no raw PII.

## Phase 9: User Story 7 - Generer un resume IA optionnel de la demande (Priority: P3)

**Goal**: Optionally generate an assistance-only quote summary when all AI flags and guardrails pass.

**Independent Test**: Enable and disable global/country/product AI flags and verify model calls, audit, assistance marking and recommendation guardrails.

### Tests for User Story 7

- [X] T133 [P] [US7] Add unit tests for AI summary flag policy across global, country, product, partner/plan and AIModuleConfig states in `backend/tests/unit/ai/quote-summary/ai-summary-flag-policy.spec.ts`.
- [X] T134 [P] [US7] Add unit tests for AI summary PII minimization and prompt input references in `backend/tests/unit/ai/quote-summary/quote-ai-summary.service.spec.ts`.
- [X] T135 [P] [US7] Add guardrail tests rejecting official recommendation, firm price, eligibility, acceptance/refusal, routing decision, PII leakage and discriminatory output in `backend/tests/guardrails/ai/quote-summary-guardrails.spec.ts`.
- [X] T136 [P] [US7] Add integration tests proving disabled AI flags produce zero model calls and skipped audit state in `backend/tests/integration/public-quotes/ai-summary-disabled.spec.ts`.
- [X] T137 [P] [US7] Add integration tests for enabled AI summary job, AIInteraction evidence and assistance visibility to authorized scopes in `backend/tests/integration/public-quotes/ai-summary-enabled.spec.ts`.

### Implementation for User Story 7

- [X] T138 [P] [US7] Implement `AISummaryFlagPolicy` in `backend/src/modules/ai/quote-summary/ai-summary-flag-policy.ts`.
- [X] T139 [P] [US7] Implement `QuoteAISummaryService` for minimized input references, async job enqueueing, AIInteraction linkage and non-blocking failure behavior in `backend/src/modules/ai/quote-summary/quote-ai-summary.service.ts`.
- [X] T140 [P] [US7] Implement AI summary guardrail evaluator in `backend/src/modules/ai/quote-summary/quote-ai-summary-guardrails.ts`.
- [X] T141 [US7] Integrate optional AI summary enqueueing after compliant QuoteRequest creation and routing state persistence in `backend/src/modules/quote-requests/quote-submission.service.ts`.
- [X] T142 [US7] Extend notification/queue processing for `ai-quote-summary` jobs and retry/failure state in `backend/src/jobs/notifications/notification.processor.ts`.
- [X] T143 [US7] Add broker/internal display of assistance-only AI summary behind scope checks in `backend/src/modules/leads/broker-leads.controller.ts`.
- [X] T144 [US7] Add broker UI assistance label for optional AI summary without recommendation language in `apps/broker/app/leads/[leadAssignmentId]/page.tsx`.

**Phase 9 validation criteria**:
- Any disabled AI flag produces zero model calls.
- AI summary never selects offer, broker, price, eligibility, acceptance or refusal.
- AI output is marked as assistance and audited.

## Phase 10: Admin, Broker and Operational Surfaces

**Purpose**: Complete operational visibility required by the plan without expanding regulated scope.

- [X] T145 [P] Add admin quote request detail UI with consent, routing, duplicate, audit and notification state in `apps/admin/app/quote-requests/[quoteRequestId]/page.tsx`.
- [X] T146 [P] Add admin prospect search UI with PII scope indicators and pagination in `apps/admin/app/prospects/page.tsx`.
- [X] T147 [P] Add admin non-routable/manual-review queue UI without transmission bypass controls in `apps/admin/app/operations/quote-review/page.tsx`.
- [X] T148 [P] Add broker lead detail UI with only assigned lead data and no Starter CRM/Kanban/team assignment features in `apps/broker/app/leads/[leadAssignmentId]/page.tsx`.
- [X] T149 [P] Add admin RBAC integration tests for offer, form, quote, prospect and lead assignment scopes in `backend/tests/integration/auth/comparator-admin-rbac.spec.ts`.
- [X] T150 [P] Add broker portal Playwright smoke for assigned lead list/detail/status and cross-tenant absence in `apps/broker/tests/leads/broker-leads.spec.ts`.
- [X] T151 [P] Add admin Playwright smoke for offers, quote requests, non-routable review and notification status in `apps/admin/tests/quotes/admin-quote-operations.spec.ts`.

**Phase 10 validation criteria**:
- Admin views are paginated and scoped by RBAC/country/product.
- Broker views show only assigned leads.
- Operational review cannot bypass consent, authorization, license, flags or routing blockers.

## Phase 11: Cross-Cutting Validation and Polish

**Purpose**: Prove the complete feature is constitutionally safe and ready for `/speckit.implement` completion criteria.

- [X] T152 [P] Add end-to-end Playwright smoke from country selection to product, offers, quote form, consent and confirmation in `apps/public/tests/public-comparator-quote-happy-path.spec.ts`.
- [X] T153 [P] Add Playwright smoke for disabled country, disabled product, no-consent submission and no-broker state in `apps/public/tests/public-comparator-quote-blockers.spec.ts`.
- [X] T154 [P] Add integration performance acceptance tests for public country/product/offer reads under 2 seconds in `backend/tests/integration/performance/comparator-public-slo.spec.ts`.
- [X] T155 [P] Add integration performance acceptance tests for valid quote submission confirmation under 5 seconds excluding async jobs in `backend/tests/integration/performance/quote-submission-slo.spec.ts`.
- [X] T156 [P] Add constitutional regression tests for no payment, no subscription, no e-signature, no issuance, no attestation, no claims and no insurer API activation in `backend/tests/guardrails/content/regulatory-feature-exclusions.spec.ts`.
- [X] T157 [P] Add full audit coverage integration test for offer exposure/refusal, consent, quote, prospect, duplicate, routing, notification and AI actions in `backend/tests/integration/audit-logs/comparator-audit-coverage.spec.ts`.
- [X] T158 [P] Add contract schema drift test comparing implemented routes with `specs/002-comparateur-demande-devis/contracts/comparator-quote-api.openapi.yaml` in `backend/tests/contract/comparator-openapi-drift.spec.ts`.
- [X] T159 [P] Add localization fallback tests for legal wording and safe CTAs in `backend/tests/guardrails/content/public-localized-wording.spec.ts`.
- [X] T160 Review and update `specs/002-comparateur-demande-devis/quickstart.md` with final seed names, commands and smoke paths after implementation.
- [X] T161 Run `npm run typecheck` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T162 Run `npm run lint` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T163 Run `npm run test:unit` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T164 Run `npm run test:integration` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T165 Run `npm run test:contract` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T166 Run `npm run test:guardrails` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T167 Run `npm run test:web` and record any spec 002 follow-up in `specs/002-comparateur-demande-devis/quickstart.md`.
- [X] T168 Re-run constitution evidence checklist for spec 002 in `specs/002-comparateur-demande-devis/quickstart.md`.

**Phase 11 validation criteria**:
- All required verification commands pass or documented blockers remain.
- No constitutional exclusion is violated.
- Public, admin and broker flows are smoke-tested.
- The feature remains flag-gated and inactive until explicit activation.

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies.
- **Phase 2**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2 and uses US1 country/product context for full public navigation.
- **Phase 5 (US3)**: Depends on Phase 2 and uses US1 country/product context.
- **Phase 6 (US4)**: Depends on US3 because routing requires a valid consented `QuoteRequest`.
- **Phase 7 (US5)**: Depends on US3 and US4 for routed/non-routable notification outcomes.
- **Phase 8 (US6)**: Depends on Phase 2 and integrates into US3 submission path before expensive work.
- **Phase 9 (US7)**: Depends on US3 and runs after compliant request creation.
- **Phase 10**: Depends on the relevant backend endpoints from US2, US3, US4 and US5.
- **Phase 11**: Depends on all selected story phases.

### User Story Dependencies

- **US1**: Foundation-only dependency; MVP public country/product selection.
- **US2**: Can start after Phase 2, but full public UX benefits from US1 routes.
- **US3**: Can start after Phase 2, but full public UX benefits from US1 routes.
- **US4**: Requires US3 data path for `QuoteRequest`, `Prospect` and `ConsentRecord`.
- **US5**: Requires US4 for assigned broker notifications and US3 for visitor confirmation.
- **US6**: Can be built in parallel with US3 after Phase 2, then integrated before submission.
- **US7**: Can be built in parallel after Phase 2, then integrated after US3 request creation.

### Parallel Opportunities

- Phase 1 directory/test setup tasks marked `[P]` can run in parallel.
- Phase 2 schema, DTO, RBAC, Redis, queue and guardrail tasks marked `[P]` can run in parallel with careful ownership of shared files.
- US1 tests can run in parallel with frontend page work after DTOs are stable.
- US2 offer admin, publication policy, public catalog and UI can be split by file ownership.
- US3 form, prospect, consent and quote submission services can be split while coordinating `QuoteSubmissionService`.
- US4 eligibility, routing decision, lead assignment and broker/admin controllers can be split after the routing service interface is agreed.
- US5 notification service, processor, status endpoint and UI can be split.
- US6 Redis protections can be built in parallel with US3 before integration.
- US7 AI policy, service, guardrails and UI display can be split.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 to expose safe public country/product selection.
3. Complete US2 to expose safe indicative offers.
4. Complete US3 to create consented QuoteRequest and Prospect without relying on notifications or AI.
5. Stop and validate: no disabled country/product exposure, no expired/non-validated offers, no consent means no transmission.

### Compliance-Critical Routing Increment

1. Complete US4 immediately after US3.
2. Validate inactive, unauthorized, over-quota and expired-license broker blockers.
3. Confirm no-broker state creates no LeadAssignment and no broker notification.

### Full Public Journey Increment

1. Complete US5 notification and status flow.
2. Complete US6 public protections.
3. Add US7 optional AI summary only after all guardrails pass and flags remain disabled by default.
4. Complete Phase 10 and Phase 11 before considering activation.

## Final Checklist Before `/speckit.implement` Completion

- Every public offer is indicative and public only when active, validated and in validity period.
- Consent is collected before any broker transmission.
- No inactive, unauthorized or invalid-license broker receives a lead.
- Sensitive decisions are audited with PII-minimized context.
- Redis keys contain no raw PII.
- BullMQ jobs are idempotent and observable.
- AI summary is optional, assistance-only and never a recommendation.
- Payment, subscription, e-signature, policy issuance, attestation, claims and insurer API remain inactive.
