# Quickstart: Prisma Domain Persistence

This quickstart records the implemented Prisma-domain persistence posture for
spec 010-prisma-domain-persistence.

## Preconditions

- Current branch: `010-prisma-domain-persistence`
- Current spec: `specs/010-prisma-domain-persistence/spec.md`
- Current plan: `specs/010-prisma-domain-persistence/plan.md`
- Constitution read and applied: `.specify/memory/constitution.md`
- Spec 010 is treated as validated by the user request.
- No clarification markers remain.

## Implementation Status

The following priority domains are Prisma-runtime outside `NODE_ENV=test` and
remain memory-backed only in explicit tests:

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

Audit logs and feature flags remain Prisma-runtime as established by spec 007.
Runtime bindings are centralized in `AssurMatchRuntime`; memory repositories are
guarded by `assertRuntimeRepository` and fail outside test.

No new business feature, frontend screen, payment, subscription, policy
issuance, attestation, e-signature or claims flow is activated by this spec.

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

## Implementation Order Used

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

Tests cover:

- Complete Prisma-runtime classes for all priority domains through guardrails
  and runtime binding checks.
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

## Schema, Migration And Seed

- No Prisma migration was added for 010: existing migrations 0001-0004 already
  cover the priority persistence entities required by the repositories.
- `backend/prisma/seed.ts` remains the minimal development seed source.
- Test fixtures now create catalog, consent, quote, partner, license, lead,
  routing and CRM data through async services/repositories.
- Fresh-base readiness is validated by Prisma schema validation, migration
  inventory tests and an empty-schema Prisma diff.

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
