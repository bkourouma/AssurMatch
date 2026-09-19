# Feature Specification: Comparator Criteria, Filters, Explainable Score And Side-By-Side Comparison

**Feature Branch**: `032-comparator-criteria-scoring`
**Created**: 2026-09-05
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes

## Constitutional Scope & Compliance

- **Technical platform role**: Offers stay indicative. The score is labelled "score indicatif selon vos criteres", is explainable line by line, never ranks an offer as "la meilleure", and never triggers a purchase or subscription. CTA stays "Demander un devis".
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client (offers list, detail and compare pages), Back-office Plateforme (scoring rules and richer offer fields). Multiple scopes; public and back-office journeys stay separated.
- **Affected scopes**: Countries, products, offers, partners (responsible partner display), admin roles with `offers:*`.
- **Frontend separation**: Public pages call only public endpoints without auth; admin scoring page lives in the admin app.
- **Required feature flags**: Existing `public_comparator_enabled`, `country_comparison_enabled`, `product_comparison_enabled` gate every public list/compare read. No new flag.
- **Consent and transmission**: N/A (read-only comparison). Offer preselection only carries `selectedOfferId` into the existing consented quote flow.
- **Partner license controls**: Unchanged; partner eligibility still hides offers of ineligible partners. The responsible partner (trade or legal name) is now displayed (OFFER-009, COMP-008).
- **Audit and data history**: Offer field changes keep `OfferHistory`; scoring rules carry `version`, `createdAt/updatedAt/createdById` and AuditLog on create/update/refusal. Public list/detail/compare reads keep the existing audit entries.
- **Security and RBAC**: Scoring rules require `offers:update` (Super Admin, Admin Pays scoped by country, Content Admin) with MFA; reads `offers:read`. Public endpoints stay rate-limited by the existing public middleware and validate every query parameter.
- **Routing impact**: None.
- **AI impact**: None. "IA pour expliquer les differences" (COMP-010) belongs to the AI specs; the deterministic breakdown is the explainability baseline.
- **UX/content restrictions**: "Comparer les offres", "Demander un devis", "offre indicative", "prix indicatif", "a confirmer par le courtier partenaire", "Sponsorise" visible. No "meilleure", "acheter", "souscrire".
- **Workflow continuity**: Standard feature; proceeds plan -> tasks -> implement -> validations.

## Requirements

### Structured offer criteria (PRD §13, PROD-006)
Offer gains: `insurerName`, `guaranteeLevel` (1-5), `deductibleAmount`, `coverageCeiling`, `processingDelayDays`, `paymentFlexibility` (`annual|semiannual|quarterly|monthly`), `guarantees[]` (`{ key, label, included, detail? }`), `exclusionsSummary`, `requiredDocuments[]`, `sourceOfInformation`. All optional; existing offers keep working. Public wording checks apply to the new free-text fields.

### Filters and sorts (COMP-002, COMP-003)
List query adds `minGuaranteeLevel`, `maxDeductible`, `maxProcessingDays`, `insurer`, `guarantee` (guarantee key that must be included), `paymentFlexibility`, `priority` (visitor preference: `price|guarantees|speed|deductible|flexibility`). Sorts add `coverage_desc`, `speed_asc`, `score_desc`, `popularity_desc` (number of quote requests that selected the offer). Existing sorts and sponsored disclosure are preserved.

### Explainable configurable score (PRD §15, COMP-004)
`ScoringRule` per `(countryId?, productId?)` holds integer weights summing to 100 for `guaranteeLevel`, `price`, `deductible`, `processingSpeed`, `paymentFlexibility`, `informationQuality`, `userPreferences`; defaults are 30/25/15/10/10/5/5. Resolution: (country, product) > (country, all) > (all, product) > (all, all) > defaults. Each listed offer returns `score: { total (0-100), label, breakdown: [{ criterion, weight, score, points, explanation }] }`, computed relative to the offers in the same list. Missing data scores 0 for that criterion and says so.

### Side-by-side comparison (COMP-005)
`GET /offers/compare?ids=a,b[,c,d]` (2 to 4 ids, same country and product, all publicly visible) returns aligned criteria rows and per-offer details with score. Public page `/compare?ids=` renders the table; the list page lets visitors tick 2-4 offers.

### Responsible partner, update date and preselection (OFFER-004, OFFER-009, COMP-008, COMP-009)
Summaries expose `partnerName` and `updatedAt`; the list links "Demander un devis" with `offerId` preselected into the existing quote flow.

## User Scenarios & Testing

### User Story 1 - Visitor filters, sorts and understands the score (P0)
1. **Given** validated offers with mixed criteria, **When** the visitor filters `minGuaranteeLevel=3&maxDeductible=50000`, **Then** only matching offers are returned, each with a score breakdown whose points sum to the total.
2. **Given** `sort=score_desc&priority=price`, **Then** offers are ordered by score and the `userPreferences` line explains it favours price.
3. **Given** `country_comparison_enabled=false`, **Then** the list is empty exactly as today.
4. **Given** an expired or unvalidated offer, **Then** it never appears in lists, details or comparisons.

### User Story 2 - Visitor compares 2 to 4 offers (P1)
1. **Given** three visible offers of CI/auto, **When** `/offers/compare?ids=` lists them, **Then** the response carries one row per criterion with each offer's value and the differences.
2. **Given** ids spanning two products, or 1 id, or 5 ids, **Then** 400.
3. **Given** an id of a hidden offer, **Then** 404-class refusal and audit `offer.public_refused`.

### User Story 3 - Admin configures scoring weights (P1)
1. **Given** a Content Admin with MFA, **When** they create a rule with weights summing to 100, **Then** it is stored active with version 1 and audited.
2. **Given** weights summing to 90, **Then** 400 `weights_must_total_100`.
3. **Given** a broker, **Then** 403.
4. **Given** an Admin Pays scoped to SN creating a CI rule, **Then** 403 `out_of_scope_country`.

## Validation

- `npm run validate` green; public and admin Playwright source tests updated.
