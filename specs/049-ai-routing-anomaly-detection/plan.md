# Implementation Plan: AI Routing Anomaly Detection

**Spec**: `specs/049-ai-routing-anomaly-detection/spec.md`
**Impacted surfaces**: Shared contracts, backend routing module, AI assistance module, admin dashboard and compliance alerts, HTTP wiring.
**Blocked on**: None. Formally validated and approved by maintainer.

## Constitution Check

- **Article I (Technical Platform)**: Satisfied. Routing and operational alerts remain strictly platform-internal tooling.
- **Article II (Consent)**: Satisfied. No prospect communication involved. PII strictly excluded from AI prompts.
- **Article III (Progressive Activation)**: Satisfied via sensitive flag `ai_routing_anomaly_detection_enabled` (default `false`).
- **Article IV (Security & RBAC)**: Strict administrative RBAC (`super_admin`, `admin_ops`, `ai_admin`). No broker tenant crossover.
- **Article V (AI Governance)**: Strict adherence. AI is purely consultative; zero autonomous routing or reassignment.
- **Article VI (Audit & Traceability)**: Full audit trail with `routing_anomaly.*` actions.
- **Article VII (Responsible Routing)**: Deterministic business rules drive anomaly classification.
- **Article IX (Test Discipline)**: 100% test coverage including fail-closed flags, RBAC enforcement, zero PII leak tests, and deterministic detection tests.

## Phase Breakdown

1. **Contracts & Flag Setup**:
   - Add `routing_anomaly_analysis` to `adminAssistTypes` in `ai.contracts.ts`.
   - Add `routing_anomaly` to compliance alert categories and define anomaly reporting DTOs in `dashboard.contracts.ts` / `routing-rule.contracts.ts`.
   - Register `ai_routing_anomaly_detection_enabled` in `default-flags.ts` and `sensitive-feature-flag-policy.ts`.
   - Define audit actions in `routing-audit-actions.ts`.

2. **Core Domain Detector Service**:
   - Create `RoutingAnomalyDetectorService` in `backend/src/modules/routing/routing-anomaly-detector.service.ts`.
   - Implements detection logic: unassigned leads, SLA response delays (> 30m / > 2h), quota saturation (>= 90% and 100%).
   - Produces structured `RoutingAnomalyReport`.
   - Automatically raises alerts through `ComplianceAlertsService` for high/critical anomalies.

3. **AI Consultation Service**:
   - Extend `AdminAiService` to handle `assistType: "routing_anomaly_analysis"`.
   - Build zero-PII structured prompt aggregating anomaly report metrics.
   - Generates actionable, neutral recommendations with human validation requirement.

4. **HTTP Wiring & Admin Endpoints**:
   - Wire `GET /admin/routing/anomalies` to list current detected anomalies.
   - Wire `POST /admin/routing/anomalies/analyze` to trigger on-demand AI analysis.
   - Wire into `RuntimeHttpWiringModule` with proper RBAC guards.

5. **Validation & Verification**:
   - Unit tests for detector, flag policy, zero-PII prompt building, and AI recommendation format.
   - Integration tests over HTTP verifying 401/403 RBAC, fail-closed flag behavior, and report structure.
   - Full suite regression test (`typecheck`, `lint`, `vitest`).
