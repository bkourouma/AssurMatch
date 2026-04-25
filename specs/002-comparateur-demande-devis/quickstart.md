# Quickstart: Spec 002 implementation handoff

This quickstart documents the implemented spec 002 surfaces. It does not activate the feature by itself.

## Read First

1. Read `.specify/memory/constitution.md`.
2. Read `specs/002-comparateur-demande-devis/spec.md`.
3. Read `specs/002-comparateur-demande-devis/plan.md`.
4. Use `specs/002-comparateur-demande-devis/contracts/comparator-quote-api.openapi.yaml` as the API contract baseline.

## Implementation Order Recommendation

1. Add shared Zod contracts in `packages/shared/contracts/quote.contracts.ts`.
2. Add Prisma enums/models and migration for offers, form definitions, prospects, quote requests, routing decisions, lead assignments and optional AI summaries.
3. Implement backend domain services and tests before UI work: offer publication, quote form selection, quote submission, consent, duplicates, routing and notifications.
4. Add public API endpoints and contract tests.
5. Add admin offer/form/quote/lead operations endpoints.
6. Add broker assigned lead endpoints.
7. Build public Next.js journey and Playwright smoke tests.
8. Build admin and broker UI increments only for the planned endpoints.

## Required Feature Flags For A Pilot

Global:
- `public_comparator_enabled`
- `quote_request_enabled`
- `sponsored_offers_enabled` only if sponsored display is used
- `ai_summary_enabled` only if optional summary is enabled

Country:
- `country_public_enabled`
- `country_comparison_enabled`
- `country_quote_enabled`
- `country_ai_enabled` only for optional AI

Product:
- `product_public_enabled`
- `product_comparison_enabled`
- `product_quote_enabled`
- `product_manual_review_required` according to compliance choice
- `product_ai_form_assistant_enabled` only for future form assistant, not required here

Flags that must remain inactive for this journey:
- `payments_enabled`
- `e_signature_enabled`
- `policy_issuance_enabled`
- `claims_enabled`
- `insurer_api_enabled`
- `multi_broker_routing_enabled`
- `ai_recommendation_enabled`

## Minimum Seed Data For Local Acceptance

- Integration seed helper: `backend/tests/integration/helpers/comparator-quote-seed.ts`.
- Pilot seed values: country `CI`, product `auto`, one published lead-transmission consent text, one published quote form, one active validated indicative offer and one expired validated offer.
- Broker seed: one active authorized broker with valid scoped license. Routing blocker tests add inactive, unauthorized, over-quota and expired-license brokers.

## Verification Commands After Implementation

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:guardrails
npm run test:web
npm run test
npm run build
npx prisma validate --schema backend/prisma/schema.prisma
npm audit --audit-level=high
git diff --check
```

When validating Prisma locally, export a PostgreSQL-compatible `DATABASE_URL` first if it is absent from the shell environment.

## Implementation Evidence

- `npm run typecheck`: passed during implementation.
- `npm run lint`: passed during implementation.
- `npm run test:unit`: passed during implementation.
- `npm run test:integration`: passed during implementation.
- `npm run test:contract`: passed during implementation.
- `npm run test:guardrails`: passed during implementation.
- `npm run test:web`: passed during implementation.
- Constitution v1.0.0 reread on 2026-04-25 before final validation; no intentional exception recorded.

## Manual Smoke Checklist

- Enabled country and product show public journey state and technical platform wording.
- Disabled country/product blocks comparison and quote without exposing offers.
- Offer list shows only active validated in-period offers and labels sponsorship.
- Quote form refuses missing consent, invalid email, invalid phone and malformed payload.
- Valid consent creates a quote confirmation and never waits for AI or notification delivery.
- Routing assigns only one active, authorized, licensed broker.
- Non-routable request does not notify a broker.
- Broker tenant can read only its assigned leads.
- AI disabled produces zero model calls.
- Public and notification copy avoid sale, subscription, contract-validity, attestation and official recommendation wording.
