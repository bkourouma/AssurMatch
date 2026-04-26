# Quickstart: Portail Starter Courtier

## Preconditions

- Branch: `003-portail-starter-courtier`
- Feature pointer: `.specify/feature.json` points to `specs/003-portail-starter-courtier`
- Seed or test data includes:
  - two broker tenants;
  - one Starter broker user per tenant;
  - at least one LeadAssignment per tenant;
  - ConsentRecord evidence for visible leads;
  - export permission for one user and no export permission for another.

## Local Validation Flow

1. Run type and contract checks:

   ```powershell
   npm run typecheck
   npm run test:contract
   ```

2. Run targeted backend checks during development:

   ```powershell
   npm run test:unit -- backend/tests/unit/leads
   npm run test:integration -- backend/tests/integration/leads
   npm run test:guardrails
   ```

3. Validate broker portal smoke tests:

   ```powershell
   npm run test:web
   ```

4. Final validation required by the user:

   ```powershell
   npm run typecheck
   npm run lint
   npm run test
   npm run test:web
   npm run build
   npx prisma validate --schema backend/prisma/schema.prisma
   npm audit --audit-level=high
   git diff --check
   ```

## Acceptance Smoke Scenario

1. Open broker Starter dashboard.
2. Confirm counters show only the connected broker tenant's leads.
3. Open lead list and filter by status, product, country and date.
4. Open one lead detail; verify it is marked seen and audited.
5. Accept one assigned lead.
6. Reject one assigned lead with required reason.
7. Dispute one assigned lead with required reason.
8. Confirm history contains each action.
9. Try cross-tenant lead URL and verify no PII is shown.
10. Try export as an unauthorized user and verify refusal plus audit.
11. Confirm CRM Pro routes/capabilities show Starter blocked messaging.
