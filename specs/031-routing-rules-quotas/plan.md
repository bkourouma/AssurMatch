# Implementation Plan: Configurable Lead Routing Rules

**Branch**: `031-routing-rules-quotas` | **Date**: 2026-09-05 | **Spec**: `specs/031-routing-rules-quotas/spec.md`

**Continuous Workflow Eligibility**: Eligible. Spec explicitly approved, no `[NEEDS CLARIFICATION]`.

## Summary

Replace the hard-coded "first eligible partner by id" selection with admin-authored, audited routing rules per country/product, keep every strategy strictly downstream of the existing eligibility policy, add a manual assignment queue and admin reassignment, and align quota enforcement with the monthly semantics of `quotaMonthlyLeads`.

## Technical Context

**Language/Version**: TypeScript strict, NestJS-style modular backend, Next.js admin app, Prisma/PostgreSQL.
**Impacted Application(s)**: Backend API, database / Prisma / migrations, shared packages, Back-office Plateforme.
**Storage**: New tables `RoutingRule`, `RoutingRuleHistory`. Routing statistics are computed from `LeadAssignment` (no new counters).
**Testing**: Vitest unit + runtime HTTP integration; Playwright source test for the admin page.
**Performance**: Strategy stats are fetched once per routing call for the eligible candidates only.

## Constitution Check

- **Technical platform role**: Pass. Distribution only.
- **Regulatory and consent**: Pass. Consent guard unchanged; eligibility policy is the single gate before any strategy.
- **Feature flags and activation**: Pass. No new activation; `multi_send` deferred and not selectable.
- **Frontend application separation**: Pass. Admin-only page.
- **Security and RBAC**: Pass. New `routing_rules` resource and `lead_assignments:update` grants; Admin Pays country scoping via `RbacGuard`.
- **Routing**: Pass. Rules configurable and historised (Principle VII).
- **AI**: N/A.
- **Data history**: Pass. `RoutingRuleHistory`, `LeadActionHistory` events, AuditLog.
- **Tests**: Pass. Rule tests per mode, RBAC, quota, ineligible partner, manual and reassignment.

## Design

1. **Contracts** (`packages/shared/contracts/routing-rule.contracts.ts`): zod schemas for rule create/update/response, history, manual queue, assign and reassign.
2. **Data**: `RoutingRule(id, countryId, productId?, mode, status, priorities Json, exclusivePartnerTenantId?, description?, version, createdAt, updatedAt, createdById?)`, `RoutingRuleHistory(id, routingRuleId, changeType, previousValue Json?, nextValue Json?, reason, changedById?, changedAt)`.
3. **Strategy** (`routing-strategy.ts`): pure function `selectRoutingCandidate(mode, candidates, rule)` over `{ partner, stats }` where stats = `{ monthlyCount, lastAssignedAt, received90d, accepted90d, averageFirstActionMinutes }`.
4. **Stats**: `LeadAssignmentsRepository.routingStatsForPartners(ids, now)` (memory + Prisma) and `monthlyCountForPartner`.
5. **Engine**: `QuoteRoutingService` gets optional `rules` and `stats` collaborators; resolves rule, applies strategy, records decision reasons (`<mode>_selected`, `manual_assignment_required`, `exclusive_partner_not_eligible`).
6. **Manual queue**: `ManualRoutingService` lists quotes with `pending_manual_assignment`, evaluates candidates, and delegates assignment to `QuoteSubmissionService.assignManually` which reuses the routed/notified finalisation.
7. **Reassignment**: `LeadReassignmentService` in `leads` verifies eligibility, rewrites the assignment, appends history, records decision, audits, and re-notifies via `QuoteNotificationService`.
8. **HTTP**: `AdminRoutingRulesController` and `AdminRoutingOperationsController` in the wiring module; `RbacGuard` for permissions and country scope.
9. **Admin app**: `readRoutingRules`, `readRoutingPending`, `createRoutingRule`, `updateRoutingRule`, `assignPendingQuote`, `reassignLead` in `admin-api.ts`; `/routing` page with server actions; nav item.

## Risks

- Concurrent submissions may pick the same partner under `round_robin` before stats refresh; acceptable for pilot volumes, Redis lock deferred.
- Quota semantic change: partners previously blocked by long-lived open assignments are now measured per month. Documented in spec.
