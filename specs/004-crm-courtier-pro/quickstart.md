# Quickstart: CRM Courtier Pro/Enterprise

## Validation Scenarios

1. Run unit tests for CRM access and transitions:
   `npm run test -- backend/tests/unit/leads/broker-crm-access-policy.spec.ts backend/tests/unit/leads/broker-crm-pipeline.service.spec.ts`

2. Run integration tests for tenant isolation:
   `npm run test -- backend/tests/integration/leads/broker-crm-flows.spec.ts`

3. Run contract and guardrail tests:
   `npm run test -- backend/tests/contract/broker-crm-api.contract.spec.ts backend/tests/guardrails/content/broker-crm-exclusions.spec.ts`

4. Run broker UI smoke:
   `npm run test:web`

5. Run final validations requested by user:
   `npm run typecheck`
   `npm run lint`
   `npm run test`
   `npm run test:web`
   `npm run build`
   `npx prisma validate --schema backend/prisma/schema.prisma`
   `npm audit --audit-level=high`
   `git diff --check`

## Manual Smoke

- Open broker CRM dashboard at `/crm`.
- Verify Starter message remains on `/` and CRM route states Pro/Enterprise access.
- Open `/crm/leads`, use filters and search.
- Open `/crm/leads/demo-lead`, verify pipeline, internal activity and non-contractual proposal copy.
