# Tasks: Billing Foundation Without Payments

**Impacted surfaces**: Backend API, Back-office Plateforme/Admin, shared packages.

- [x] T001 Add shared billing foundation contracts with literal `paymentsEnabled=false` and paginated responses.
- [x] T002 Add backend billing foundation service and audit actions.
- [x] T003 Wire runtime module and protected `GET /admin/billing/foundation`.
- [x] T004 Add admin API client and `/billing` page.
- [x] T005 Add backend runtime HTTP validation for scoped Finance Admin read, missing-scope refusal, no-PII audit context and broker refusal.
- [x] T006 Add admin Playwright source validation for read-only/no-payment UI.
- [x] T007 Protect `billing_enabled` with sensitive feature flag mutation policy.
- [ ] T008 Run full release validation after the current supervisor backlog settles.
