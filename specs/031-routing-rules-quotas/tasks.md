# Tasks: Configurable Lead Routing Rules

**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Back-office Plateforme.

- [x] T001 [US1] Add `routing-rule.contracts.ts` schemas and export them from `packages/shared/contracts/index.ts`.
- [x] T002 [US1] Add `routing_rules` and `lead_assignments:update` permissions in `packages/shared/rbac/assurmatch-role-matrix.ts`.
- [x] T003 [US1] Add Prisma models/enums, `pending_manual_assignment` routing status and migration `0008_routing_rules`; update `prisma-migrations.spec.ts`.
- [x] T004 [US1] Implement `routing-rules.repository.ts` (memory + Prisma) and `routing-rules.service.ts` with validation, history, audit and RBAC scoping.
- [x] T005 [US2] Implement pure `routing-strategy.ts` and unit tests per mode in `backend/tests/unit/routing/routing-strategy.spec.ts`.
- [x] T006 [US2] Add `routingStatsForPartners` and `monthlyCountForPartner` to `lead-assignments.repository.ts`; switch `BrokerEligibilityPolicy` quota check to monthly count.
- [x] T007 [US2] Wire rules + strategy into `QuoteRoutingService`; park `manual` quotes as `pending_manual_assignment` in `QuoteSubmissionService`.
- [x] T008 [US3] Implement `ManualRoutingService` (queue + assign via `QuoteSubmissionService.assignManually`) and `LeadReassignmentService`.
- [x] T009 [US1,US3] Expose admin HTTP controllers in `runtime-http-wiring.module.ts` and wire services in `assurmatch-runtime.ts`.
- [x] T010 [US1,US3] Admin app: `admin-api.ts` functions, `/routing` page, server actions, form components, nav entry, Playwright source test.
- [x] T011 [US1,US2,US3] Runtime HTTP integration tests: RBAC, audit, history, duplicate rule, distribution per mode, manual queue, reassignment.
- [x] T012 Run typecheck, lint and full test suite; tick tasks.

## Deferred follow-ups

- `multi_send` mode (needs a transmission consent purpose and multi-assignment model) behind `multi_broker_routing_enabled`.
- Redis lock around rule evaluation for concurrent submissions.
- Admin selectors for countries/products/partners instead of raw UUID inputs on `/routing`.
