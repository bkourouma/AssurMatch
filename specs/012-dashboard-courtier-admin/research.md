# Phase 0 Research: Dashboards courtier et admin

## Existing surfaces reused

- `BrokerStarterLeadsService.dashboard()` returns basic counts; we keep it for backward compat and build a richer plan-adaptive endpoint in a new `dashboards` module.
- `BrokerCrmController.dashboard()` likewise remains untouched.
- `LeadAssignmentService.list()` returns the full set; for V1 the new service filters in memory by tenant + window, identical to the existing pattern, then upgrades to Prisma `groupBy` once measurements demand it.
- `CrmActivityRepository`, `RoutingDecisionsRepository`, `PartnerLicensesService`, `Offers` services, `Countries` and `Products` services, `AuditLogWriter.all()`, `FeatureFlagsService.list()/isEnabled()` are all available.

## Decisions

1. **Read-only module**: `dashboards` module owns aggregation; no cross-module mutation.
2. **Plan-adaptive broker endpoint**: a single `GET /broker/dashboard` adapts to the actor's `partnerPlan` and the `broker_crm_enabled` flag.
3. **Aggregation strategy**: V1 reuses `service.list()` and computes counts in-process. A future spec may upgrade to Prisma `groupBy`/`count` once the data volumes justify it. Tests assert the absence of N+1 by verifying the repository was called once per category, not once per row.
4. **Admin dashboard scope**: derived from `actor.roles`, `actor.countryScopes`, `actor.productScopes`. Out-of-scope query params produce explicit `403` with audit (Arbitration 6).
5. **Compliance alerts paginated separately**: keeps the high-level summary fast; the alerts list is governed by `page`/`pageSize`.
6. **Audit policy**: admin endpoints audit success and refusal; broker endpoints audit only refusals (Arbitration 1).
7. **Time window**: default 30 days, max 365, min 1 day. Future dates rejected. Validated via `dashboardTimeWindowSchema` shared across endpoints.
8. **Feature flag**: `broker_dashboard_enabled` already exists fail-closed in `default-flags.ts`. Read at request time via `FeatureFlagsService.isEnabled`. No new cache.
9. **Performance target**: p95 < 500 ms on local seed-scale data (non-blocking goal).
10. **No new tables, no new migration, no new index**: Phase 0 confirms the existing `LeadAssignment`, `CrmActivity`, `RoutingDecision`, `PartnerLicense`, `Offer`, `AuditLog`, `FeatureFlag` tables expose enough columns and indexes for these aggregates within the documented window bounds.
