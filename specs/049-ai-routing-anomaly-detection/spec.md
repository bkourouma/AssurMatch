# Feature Specification: AI Routing Anomaly Detection

**Feature Branch**: `feat/049-ai-routing-anomaly-detection`
**Created**: 2026-09-29
**Status**: Validated and Approved by maintainer on 2026-09-28. Decisions D1-D6 formally approved under explicit roadmap mandate.
**Validation State**: Fully Validated. Continuous implementation workflow active per Constitution Article XI.
**Continuous Workflow Eligible**: Yes. Full implementation authorised.

## Why this spec exists

AssurMatch's routing engine distributes qualified quote requests to accredited broker partners based on country, product, quotas, and partner tiers. However, operational routing friction and bottlenecks can occur:
1. **Unassigned / Orphaned Leads**: When no partner has an active license, open quota, or active rule for a requested product/country, leads enter `no_broker_available` or `manual_review_required`. Visitors are left waiting without transparent operational triage.
2. **SLA Response Delays**: Accredited brokers who do not acknowledge or contact prospects within the platform's SLA threshold (> 30 min target per PRD Â§21) jeopardize lead conversion and market trust.
3. **Quota Saturation & Imbalances**: Brokers reaching 100% monthly quota abruptly stop receiving leads, concentrating sudden load on fewer partners or choking product availability.

Spec 049 introduces **AI Routing Anomaly Detection**: an automated monitoring, scoring, and consultative AI insight module that identifies routing anomalies, raises compliance alerts on the Admin Dashboard, and delivers actionable recommendations for platform operators.

## Constitutional Scope & Compliance (Principle V & VII)

- **Technical platform role (Principle I)**: Unchanged. Routing remains technical matchmaking between visitor requests and licensed independent brokers.
- **AI as Consultative Assistance Only (Principle V)**: Strict compliance with Article V. The AI **NEVER** mutates routing rules autonomously, **NEVER** reassigns leads automatically, and **NEVER** alters broker status. It generates structured explanations and recommendations for human operators. All actual lead reassignments require explicit human administrator action through existing audited endpoints (`LeadReassignmentService`).
- **Data Minimisation (Zero PII to AI)**: The anomaly detector and AI prompt builders transmit **strictly zero prospect PII** (no names, phones, emails, or free-text details). Only technical IDs, public references, status codes, country codes, product keys, and elapsed durations are evaluated.
- **Progressive Activation & Sensitive Flag (Article III)**: Protected by global sensitive flag `ai_routing_anomaly_detection_enabled` (default `false`), governed by `SensitiveFeatureFlagPolicy` with mandatory audited activation reasons.
- **Audit & Historical Evidence (Article VI)**: Every anomaly detection run, compliance alert, and AI analysis is logged with actor, target, timestamps, and metadata in `AuditLog`.
- **Security & RBAC (Article IV)**: Restricted exclusively to authorized platform administrators (`super_admin`, `admin_ops`, `ai_admin`). No broker or public exposure.

## Key Design Decisions (D1-D6)

### D1 - Deterministic Anomaly Classification
Four structured anomaly types detected via deterministic domain rules:
- `unassigned_leads`: Quote requests with `routingStatus IN ("no_broker_available", "manual_review_required", "blocked")`.
- `sla_breach_risk`: Lead assignments with status `assigned` or `pending` where `lastBrokerActionAt == null` and elapsed time exceeds threshold (warning: > 30 min, critical: > 2 hours).
- `quota_saturation`: Active routing rules where `allocatedCount >= monthlyQuota` (or `>= 90%`).
- `distribution_skew`: Significant routing concentration where one broker receives > 80% of volume for a multi-partner product.

### D2 - Consultative AI Engine Integration
A new `AdminAssistType`: `routing_anomaly_analysis` is added to `AdminAiService`. It consumes the structured anomaly telemetry, formats a neutral diagnostic summary, and suggests operational remediations (e.g. increase quota for broker B, trigger manual reassignment for lead X, verify licensing for product Y).

### D3 - Compliance Alerts & Admin Dashboard Integration
- A new alert category `routing_anomaly` is registered in `ComplianceAlertsService`.
- Critical anomalies raise compliance alerts displayed in the platform admin dashboard.
- Anomaly counts are aggregated in `AdminDashboardService`.

### D4 - Sensitive Feature Flagging
`ai_routing_anomaly_detection_enabled` is registered in `default-flags.ts` and protected in `sensitive-feature-flag-policy.ts`. When disabled, the endpoints return fail-closed responses and background scanners skip execution.

### D5 - Pure Backend & Admin Back-office Scope
No public site impact. Surfaces impacted:
- Shared contracts: `packages/shared/contracts/`
- Backend API modules: `backend/src/modules/routing/`, `backend/src/modules/ai/`, `backend/src/modules/dashboards/`
- HTTP wiring: `GET /admin/routing/anomalies`, `POST /admin/routing/anomalies/analyze`

### D6 - Immutability & Safe Remediation
Remediation remains human-driven: the existing `POST /admin/routing/leads/:id/reassign` endpoint remains the sole mechanism to execute reassignment. The AI analysis includes the reassignment URL/parameters so operators can execute with 1 click.
