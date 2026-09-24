# Feature Specification: Configurable Lead Routing Rules, Quotas, Manual Assignment And Reassignment

**Feature Branch**: `031-routing-rules-quotas`
**Created**: 2026-09-05
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes

## Constitutional Scope & Compliance

- **Technical platform role**: Routing only distributes consented quote requests to licensed partner brokers. No sale, subscription, premium, contract or advice is introduced.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Back-office Plateforme (admin routing page). No Web Publique Client change beyond a new internal routing status that is never exposed to visitors.
- **Affected scopes**: Countries, products, partners, admin roles (Super Admin, Admin Pays, Compliance Admin read, Support Admin read).
- **Frontend separation**: Only the admin app gains a `/routing` page. Public app unchanged.
- **Required feature flags**: `multi_broker_routing_enabled` stays `false` and is not consumed: the `multi_send` mode is deferred (see Deferred). No new global flag is needed because routing rules are admin-authored data, fail closed and default to the current `first_eligible` behaviour when no rule exists.
- **Consent and transmission**: Unchanged. `QuoteRoutingService` still refuses routing without `consentRecordId`; manual assignment and reassignment reuse the same eligibility policy.
- **Partner license controls**: Every selection strategy only ranks candidates already judged eligible by `BrokerEligibilityPolicy` (active partner, capacity, country/product authorization, valid license, quota). A rule can never route to an ineligible partner.
- **Audit and data history**: `RoutingRule` carries `createdAt/updatedAt/createdById/version`; every create/update writes a `RoutingRuleHistory` row and an AuditLog. Manual assignment and reassignment write RoutingDecision, LeadActionHistory and AuditLog entries. Refusals are audited.
- **Security and RBAC**: New permission resource `routing_rules` (`admin_pays: routing_rules:*`, `compliance_admin` and `support_admin`: `routing_rules:read`, `super_admin` implicit). Manual assignment and reassignment require `lead_assignments:update` (granted to `admin_pays`, implicit for `super_admin`). Admin Pays is scoped to their country ids. MFA required. Tenant isolation preserved: brokers never see rules or other tenants' leads.
- **Routing impact**: This is the routing feature. Quota semantics move from "active assignments" to "assignments in the current UTC month excluding rejected/disputed", matching `quotaMonthlyLeads`.
- **AI impact**: None. `ai_assisted` routing is explicitly out of scope; AI may later feed the deterministic `performance` strategy with scores but never decide eligibility.
- **UX/content restrictions**: Admin copy uses "assigner", "reassigner", "courtier partenaire". No forbidden public wording.
- **Workflow continuity**: Standard feature; proceeds plan -> tasks -> implement -> validations.

## Modes (PRD §17)

| Mode | Behaviour | Deterministic tie-break |
|---|---|---|
| `first_eligible` | Current behaviour: lowest partner id among eligible | id |
| `round_robin` | Least-recently-assigned eligible partner (never assigned first) | id |
| `priority` | Rule-defined ordered partner priorities; unlisted partners after listed ones | least-recently-assigned, then id |
| `capacity` | Eligible partner with the largest remaining monthly quota (quota 0 = unlimited) | least-recently-assigned, then id |
| `performance` | Highest 90-day acceptance rate, then fastest first action | least-recently-assigned, then id |
| `exclusive` | Only the rule's exclusive partner; if ineligible, lead is `no_broker_available` with reason `exclusive_partner_not_eligible` | n/a |
| `manual` | No automatic assignment; quote is parked as `pending_manual_assignment` for an admin | n/a |

Rule resolution: an active rule for `(countryId, productId)` wins over an active rule for `(countryId, null)`; with no rule, `first_eligible` applies. At most one active rule per `(countryId, productId)` pair.

## Deferred (not in this spec)

- `multi_send`: requires a dedicated transmission consent purpose and relaxing the one-assignment-per-quote invariant; stays behind `multi_broker_routing_enabled=false`.
- `ai_assisted`: covered by the AI specs; rules stay deterministic.
- Redis routing locks for concurrent submissions on the same rule.

## User Scenarios & Testing

### User Story 1 - Admin configures a routing rule (P0)

**Acceptance Scenarios**:
1. **Given** a Super Admin with MFA, **When** they create a `round_robin` rule for CI/auto, **Then** the rule is stored active with version 1, a history row and an AuditLog `routing_rule.created` exist.
2. **Given** an Admin Pays scoped to SN, **When** they create a rule for CI, **Then** the request is refused with 403 and audited `routing_rule.refused`.
3. **Given** an active rule for CI/auto, **When** another active rule for CI/auto is created, **Then** it is refused with `duplicate_active_rule`.
4. **Given** a rule update changing mode to `priority` with priorities, **When** applied, **Then** version increments, history stores previous and next values.
5. **Given** a broker actor, **When** they call any routing rule endpoint, **Then** 403.

### User Story 2 - Leads are distributed according to the rule (P0)

**Acceptance Scenarios**:
1. **Given** a `round_robin` rule and two eligible partners, **When** two quotes are submitted, **Then** each partner receives one lead and RoutingDecision reasons include `round_robin_selected`.
2. **Given** a `priority` rule listing partner B first, **When** a quote is routed, **Then** B is selected while eligible; **When** B's license expires, **Then** A is selected and B appears in `excludedCandidates` with `license_not_valid_for_scope`.
3. **Given** a `capacity` rule and partner A with quota 1 already consumed this month, **When** a quote is routed, **Then** A is excluded with `partner_quota_exhausted` and B is selected.
4. **Given** an `exclusive` rule for partner A and A is inactive, **When** a quote is routed, **Then** result is `no_broker_available` with reason `exclusive_partner_not_eligible` and no broker is notified.
5. **Given** a `manual` rule, **When** a quote is submitted, **Then** it is stored with `routingStatus=pending_manual_assignment`, no assignment exists, the visitor sees the generic "recue, a confirmer" message and the public status endpoint never exposes the internal routing status.
6. **Given** no consent record, **When** routing runs under any rule, **Then** routing is blocked exactly as today.

### User Story 3 - Admin assigns a parked quote or reassigns a lead (P1)

**Acceptance Scenarios**:
1. **Given** a quote in `pending_manual_assignment`, **When** an Admin Pays in scope assigns it to an eligible partner, **Then** a RoutingDecision (`admin_manual_assignment`), a LeadAssignment and a broker notification are created and the quote becomes `routed`.
2. **Given** the same quote, **When** the target partner is ineligible, **Then** the assignment is refused with the eligibility reasons and audited.
3. **Given** an existing assignment to partner A, **When** an admin reassigns it to eligible partner B with a reason, **Then** the assignment now belongs to B with a fresh `assignedAt`, broker-side timestamps are reset, a LeadActionHistory `reassigned` event and AuditLog `routing.reassigned` exist, and B is notified.
4. **Given** the reassignment target equals the current partner, **Then** it is refused with `same_partner`.

## Requirements

- `packages/shared/contracts/routing-rule.contracts.ts` exporting rule, history, manual queue, assign and reassign schemas.
- Prisma models `RoutingRule`, `RoutingRuleHistory`; enums `RoutingRuleMode`, `RoutingRuleStatus`; `RoutingStatus` gains `pending_manual_assignment`; migration `0008_routing_rules`.
- Backend `routing` module: repository (memory + Prisma), `RoutingRulesService` (CRUD, history, validation, audit), pure `selectRoutingCandidate` strategy, `ManualRoutingService` (queue, assign) and `LeadReassignmentService`.
- `QuoteRoutingService` resolves the applicable rule and applies the strategy; `BrokerEligibilityPolicy` uses the monthly quota count.
- Admin HTTP: `GET/POST /admin/routing-rules`, `PATCH /admin/routing-rules/:id`, `GET /admin/routing-rules/:id/history`, `GET /admin/routing/pending`, `POST /admin/routing/pending/:quoteRequestId/assign`, `POST /admin/lead-assignments/:id/reassign`.
- Admin app `/routing` page: rules table, create/update forms, pending queue with assign action, reassign form; nav entry; Playwright source test.
- Tests: strategy unit tests per mode; rules service unit tests; runtime HTTP integration covering RBAC, audit, history, distribution, manual queue and reassignment; migrations test updated.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run test` green.
- Admin Playwright source test for `/routing`.
