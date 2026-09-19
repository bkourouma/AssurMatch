# Feature Specification: Dashboard Reports, Period Comparison And Advisor View

**Feature Branch**: `041-dashboard-reports-comparison`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; reporting only, no new activation)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Reports describe platform activity. They contain no coverage statement, no price commitment and no prospect identity - only aggregates a partner or an administrator may already read on screen.
- **Impacted application(s)**: Backend API, shared packages, Broker Back-office (export, comparison, advisor view), Back-office Plateforme (admin export). No public surface.
- **Affected scopes**: Partner tenants (broker exports are tenant-bound), admin country/product scopes (admin export respects the existing dashboard scope resolution).
- **Frontend separation**: Broker routes under `/broker/dashboard/...`, admin under `/admin/dashboard/...`.
- **Required feature flags**: `broker_dashboard_enabled` and `broker_crm_enabled` keep gating the underlying sections; no new flag.
- **Consent and transmission**: Exports carry counts and rates only - never a prospect name, email, phone or answer. The advisor view exposes advisor identifiers already visible in the CRM to that tenant.
- **Partner license controls**: Unchanged.
- **Audit and data history**: Every export and comparison read is audited with actor, scope, window and row count. Exports are generated on the fly and never stored.
- **Security and RBAC**: MFA required. Broker exports need `broker_leads:export` or `broker_crm:export`; an assigned-scope agent only sees its own advisor row. Admin exports reuse the admin dashboard access policy.
- **Routing impact**: None.
- **AI impact**: None (the AI activity report stays in spec 036).
- **UX/content restrictions**: "Rapport d'activite indicatif". Never regulated wording.
- **Workflow continuity**: Standard.

## Requirements

- Contracts: dashboard comparison section (previous window totals and deltas), advisor performance row, export query.
- `BrokerDashboardService`: optional `compare=previous` section (received, accepted, refused, deltas), `advisors(actor, query)` per-advisor volumes/conversion/first-action delay, `exportCsv(actor, query)`.
- `AdminDashboardService`: optional comparison section and `exportCsv(actor, query)` over lead volumes by country and product.
- HTTP: `GET /broker/dashboard?compare=previous`, `GET /broker/dashboard/advisors`, `GET /broker/dashboard/export.csv`, `GET /admin/dashboard/export.csv` (comparison via the same `compare` query on the admin dashboard).
- Broker CRM page: comparison KPIs, advisor table and an export link; admin dashboard page: export link.

## User Scenarios & Testing

1. **Given** leads in the current and previous 30-day windows, **When** a broker requests `compare=previous`, **Then** the response carries both totals and the signed deltas, and the read is audited.
2. **Given** a broker without an export permission, **Then** the CSV route returns 403 and the refusal is audited; with the permission the CSV contains only aggregate columns and no prospect identity.
3. **Given** an agent restricted to assigned leads, **Then** the advisor view returns only its own row.
4. **Given** an admin export, **Then** the CSV respects the admin scope and is audited with the row count.

## Validation

- `npm run validate` green; broker and admin source tests; runtime HTTP tests for comparison, advisor view and both exports.
