# Quickstart: Prisma Domain Persistence Planning

This quickstart is for future implementation of spec
010-prisma-domain-persistence. It does not generate `tasks.md` and does not
implement code.

## Preconditions

- Current branch: `010-prisma-domain-persistence`
- Current spec: `specs/010-prisma-domain-persistence/spec.md`
- Current plan: `specs/010-prisma-domain-persistence/plan.md`
- Constitution read and applied: `.specify/memory/constitution.md`
- Spec 010 is treated as validated by the user request.
- No clarification markers remain.

## No-Implementation Guard

For this planning invocation, verify only planning artifacts changed:

```powershell
git status --short
Test-Path specs\010-prisma-domain-persistence\tasks.md
```

Expected:

- `tasks.md` is `False` or absent.
- No backend runtime source file is modified during planning.

## Planning Artifacts

Expected files:

```text
specs/010-prisma-domain-persistence/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    prisma-domain-persistence-contract.md
  checklists/
    requirements.md
```

## Future Implementation Setup

Recommended implementation order from `plan.md`:

1. Inventory ports, service consumers, route consumers and current memory
   bindings.
2. Harden repository metadata, async contracts and guardrails.
3. Align existing audit and feature flag repositories with common guardrails.
4. Convert catalog repositories and public catalog services/controllers.
5. Convert consent, prospects and quote requests with transactional quote
   submission.
6. Convert partners, partner licenses, routing decisions and lead assignments.
7. Rewire Starter lead reads/actions/history to Prisma-backed repositories.
8. Convert CRM activity/state/history repositories and CRM services.
9. Convert notification trace repository and queue job trace persistence.
10. Remove extracted domains from runtime memory/facade ownership and document
    residuals.
11. Run full validation.

## Local Validation Commands

Use during implementation and final validation:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:guardrails
npm run build
npm run validate
```

Run web smoke tests when frontend contract compatibility or route integration
requires it:

```powershell
npm run test:web
```

Prisma validation:

```powershell
npx prisma validate --schema backend/prisma/schema.prisma
```

## Repository Test Focus

Future tests must cover:

- Prisma repositories for all priority domains.
- Memory repositories in explicit test-only usage.
- Runtime-normal failure when memory repositories are bound.
- No transition/TODO/non-implemented throws in priority Prisma repositories.
- Public catalog reads from PostgreSQL.
- Consented quote creation of `Prospect`, `ConsentRecord`, `QuoteRequest` and
  eligible `LeadAssignment`.
- No-consent refusal with no assignment and no broker notification.
- Partner/license eligibility blockers.
- Starter lead reads/actions from `LeadAssignmentsRepository`.
- CRM reads/activity from `LeadAssignmentsRepository` and
  `CRMActivityRepository`.
- Durable notifications, audit and feature flags.
- Fresh database reconstruction and migration checks.

## Seed And Fixture Rules

- Runtime defaults stay closed for sensitive modules.
- Test fixtures may enable only the flags needed by the scenario.
- Public fixture seed should include active country, product, country-product
  link, valid public offer and published consent text.
- Routing fixture seed should include active partner, authorizations, valid
  license and capacity/quota data.
- CRM fixture seed should include Pro/Enterprise broker scope and
  `broker_crm_enabled` only when testing CRM access.
- Negative fixtures should cover disabled country/product, expired license,
  absent consent, no eligible broker and cross-tenant lead access.

## HTTP Non-Regression Smoke List

Preserve existing route families:

```text
GET /countries
GET /countries/:countryCode/products
GET /countries/:countryCode/products/:productKey/offers
POST /quote-requests
GET /broker/starter/leads
GET /broker/starter/leads/:leadId
GET /broker/crm/leads
GET /broker/crm/leads/:leadId
POST /broker/crm/leads/:leadId/status
POST /broker/crm/leads/:leadId/notes
GET /admin/audit-logs
GET /admin/feature-flags
```

Exact coverage should follow existing route inventory and contracts from specs
002, 003, 004, 008 and 009.

## Rollback Checks

- Revert a failing vertical slice before converting the next slice.
- Do not use memory fallback as rollback in runtime-normal modules.
- Revert or fix failing migrations before shipping.
- Restore DTO mappers if Prisma model mapping changes an API shape.
- Stop if durable audit cannot be preserved for a sensitive path.

## Stop Conditions

Stop before or during future implementation if any appears:

- A repository conversion changes business behavior.
- A public route needs broker/admin state.
- A broker/admin route can read cross-tenant data.
- A no-consent path persists assignment or notifies a broker.
- A migration is needed for behavior not already specified.
- A sensitive flag would default open.
- Durable audit cannot be preserved for sensitive actions.
- Tests require activating payment, e-signature, policy issuance, claims,
  insurer API or advanced AI.
