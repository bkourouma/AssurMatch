# Implementation Plan: Comparator Criteria, Score And Comparison

**Branch**: `032-comparator-criteria-scoring` | **Date**: 2026-09-05 | **Spec**: `specs/032-comparator-criteria-scoring/spec.md`

**Continuous Workflow Eligibility**: Eligible.

## Summary

Turn the static comparator into a data-driven one: structured offer criteria, richer filters and sorts, a deterministic explainable score driven by admin-configurable weights, and a side-by-side comparison endpoint and page.

## Technical Context

**Impacted Application(s)**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme.
**Storage**: `Offer` gains criteria columns; new `ScoringRule` table; migration `0009_offer_comparison`.
**Performance**: Score is computed in memory over the already-filtered list; popularity is resolved with one pass over quote requests per list call; partner names resolved once per distinct partner.

## Constitution Check

- **Technical platform role**: Pass. Score labelled indicative, no purchase wording.
- **Regulatory and consent**: Pass. Visibility policy unchanged; sponsored disclosure kept.
- **Feature flags**: Pass. Existing comparator flags gate list, detail and compare.
- **Frontend separation**: Pass. Public pages use public endpoints only.
- **Security and RBAC**: Pass. `offers:read/update` on scoring rules with country scoping.
- **Data history**: Pass. OfferHistory for offers, audit + version for scoring rules.
- **Tests**: Pass. Scoring unit tests, catalog filter/sort/compare tests, RBAC tests, public/admin source tests.

## Design

1. **Contracts** (`quote.contracts.ts`): extend `offerListQuerySchema`, `offerSummarySchema`, `offerDetailSchema`, `adminOfferUpsertSchema`; add `offerCompareResponseSchema`; new `scoring-rule.contracts.ts`.
2. **Data**: Prisma `Offer` columns + `ScoringRule`; repositories map the new Decimal/Json fields.
3. **Scoring** (`offers/offer-scoring.ts`): pure `scoreOffers(offers, weights, preference)`.
4. **Catalog** (`public-offer-catalog.service.ts`): apply new filters, resolve popularity/partner names through context resolvers, compute scores, new sorts, `compare(ids, context)`.
5. **Scoring rules** (`offers/scoring-rules.service.ts` + repository): CRUD with weights validation, resolution and audit.
6. **HTTP**: public `GET /offers/compare` in both wiring paths; admin `/admin/scoring-rules` GET/POST/PATCH.
7. **Public app**: real offers list with filters/sort/score/compare selection; `/compare` page; detail page fetching `/offers/:id`; quote link with `offerId`.
8. **Admin app**: `/scoring` page with rules table and forms; nav entry.

## Risks

- Popularity counting scans quote requests per list call; acceptable for pilot volumes, index-backed count later.
- Relative scoring means a single-offer list scores 100 on relative criteria; the label makes the relativity explicit.
