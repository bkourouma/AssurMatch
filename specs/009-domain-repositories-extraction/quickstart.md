# Quickstart: Domain Repositories Extraction Planning

This quickstart is for future implementation of spec
009-domain-repositories-extraction. It does not generate `tasks.md` and does not
implement code.

## Preconditions

- Current branch: `009-domain-repositories-extraction`
- Current spec: `specs/009-domain-repositories-extraction/spec.md`
- Current plan: `specs/009-domain-repositories-extraction/plan.md`
- Constitution read and applied: `.specify/memory/constitution.md`
- Spec 009 has no `[NEEDS CLARIFICATION]` markers.

## No-Implementation Guard

For this planning invocation, verify only planning artifacts changed:

```powershell
git status --short
Test-Path specs\009-domain-repositories-extraction\tasks.md
```

Expected:

- `tasks.md` is `False` or absent.
- No backend runtime source file is modified during planning.

## Planning Artifacts

Expected files:

```text
specs/009-domain-repositories-extraction/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    repository-extraction-contract.md
  checklists/
    requirements.md
```

## Implementation Setup Later

When implementation begins, use the repository extraction order from
`plan.md`:

1. Common repository guard and provider tokens.
2. Audit and feature flag repository provider alignment.
3. Catalog repositories.
4. Quote/prospect/consent repositories.
5. Partner/license/routing/lead assignment repositories.
6. Starter repository-backed reads/actions.
7. CRM activity repositories.
8. Notification trace repository.
9. `AssurMatchRuntime` residual cleanup.
10. Full non-regression validation.

## Local Validation Commands

Use these commands during implementation and final validation:

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

Run Playwright only if frontend URLs are configured and the future work touches
frontend compatibility:

```powershell
npm run test:web
```

## Repository Test Focus

Future tests should cover:

- Prisma repositories for every extracted domain.
- Memory repositories in explicit `NODE_ENV=test` usage.
- Runtime-normal failure when memory repositories are bound.
- Public catalog reads from repositories.
- Quote creation of `Prospect`, `ConsentRecord` and `QuoteRequest`.
- No-consent refusal with no routing and no broker notification.
- Partner/license eligibility blockers.
- Starter lead reads from `LeadAssignmentsRepository`.
- CRM reads/activity from `LeadAssignmentsRepository` and
  `CRMActivityRepository`.
- Durable audit and persistent feature flags.
- Fresh database reconstruction and migration checks.

## Seed And Fixture Rules

- Runtime defaults stay closed for sensitive modules.
- Test fixtures may enable only the exact flags needed for the tested scenario.
- Public fixture seed should include active country, product, country-product
  link, valid public offer and published consent text.
- Routing fixture seed should include active partner, authorizations, valid
  license and capacity/quota data.
- Negative fixtures should cover disabled country/product, expired license,
  absent consent, no eligible broker and cross-tenant lead access.

## HTTP Non-Regression Smoke List

During implementation, preserve these route families:

```text
GET /countries
GET /countries/:countryCode
GET /countries/:countryCode/products
GET /countries/:countryCode/products/:productKey
GET /countries/:countryCode/products/:productKey/offers
GET /offers/:offerId
POST /quote-requests
GET /broker/starter/leads
GET /broker/starter/leads/:leadId
POST /broker/starter/leads/:leadId/accept
POST /broker/starter/leads/:leadId/reject
POST /broker/starter/leads/:leadId/dispute
GET /broker/crm/leads
GET /broker/crm/leads/:leadId
POST /broker/crm/leads/:leadId/status
POST /broker/crm/leads/:leadId/notes
GET /admin/audit-logs
GET /admin/feature-flags
```

Exact coverage should follow existing route inventory and contracts from specs
002, 003, 004 and 008.

## Stop Conditions

Stop before or during future implementation if any of these appears:

- A repository extraction would change business behavior.
- A public route needs broker/admin state.
- A broker/admin route can read cross-tenant data.
- A no-consent path would persist assignment or notify a broker.
- A migration is needed for behavior not already specified.
- A sensitive flag would default open.
- Durable audit cannot be preserved for sensitive actions.
- Tests require activating payment, e-signature, policy issuance, claims,
  insurer API or advanced AI.
