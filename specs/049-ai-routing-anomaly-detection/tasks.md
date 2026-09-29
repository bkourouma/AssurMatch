# Tasks: AI Routing Anomaly Detection

**Spec**: `specs/049-ai-routing-anomaly-detection/spec.md`
**Plan**: `specs/049-ai-routing-anomaly-detection/plan.md`
**Status**: Ready for implementation. Formally approved by maintainer.

## Tasks Breakdown

- [x] T001 Update `packages/shared/contracts/ai.contracts.ts`: Add `routing_anomaly_analysis` to `adminAssistTypes`.
- [x] T002 Update `packages/shared/contracts/dashboard.contracts.ts`: Add `routing_anomaly` to `complianceAlertCategorySchema`, define `routingAnomalyReportSchema`, `routingAnomalyItemSchema`, and extend dashboard schemas with `routingAnomaly` counts.
- [x] T003 Register `ai_routing_anomaly_detection_enabled` in `backend/src/modules/feature-flags/default-flags.ts` (default `false`) and protect in `sensitive-feature-flag-policy.ts`.
- [x] T004 Add audit actions in `backend/src/modules/routing/routing-audit-actions.ts`: `routingAnomalyDetected`, `routingAnomalyAnalysisRequested`, `routingAnomalyAlertRaised`.
- [x] T005 Implement `RoutingAnomalyDetectorService` in `backend/src/modules/routing/routing-anomaly-detector.service.ts`:
  - Detect unassigned/blocked quote requests
  - Detect SLA response delay on active lead assignments (> 30m, > 2h)
  - Detect quota saturation on active routing rules (>= 90%, 100%)
  - Raise compliance alert via `ComplianceAlertsService` for critical items.
- [x] T006 Extend `AdminAiService` in `backend/src/modules/ai/admin-ai.service.ts` to handle `routing_anomaly_analysis` with zero-PII aggregation and consultative remediation hints.
- [x] T007 Implement `AdminRoutingAnomaliesController` in `backend/src/modules/routing/admin-routing-anomalies.controller.ts` exposing:
  - `GET /admin/routing/anomalies`
  - `POST /admin/routing/anomalies/analyze`
- [x] T008 Wire `AdminRoutingAnomaliesController` and `RoutingAnomalyDetectorService` into `RoutingModule`, `AssurMatchRuntime`, and `RuntimeHttpWiringModule`.
- [x] T009 Update `AdminDashboardService` and `ComplianceAlertsService` to aggregate routing anomalies.
- [x] T010 Unit tests: `backend/tests/unit/routing/routing-anomaly-detector.spec.ts` (deterministic detection, zero PII, severity scoring, alert raising).
- [x] T011 Unit tests: `backend/tests/unit/ai/routing-anomaly-ai.spec.ts` (prompt safety, zero PII assertion, consultative disclaimer).
- [x] T012 Integration tests: `backend/tests/integration/routing/routing-anomaly-runtime-http.spec.ts` (RBAC refusal, fail-closed flag behavior, anomaly reporting over HTTP).
- [x] T013 Verify complete test suite, typecheck, and lint pass with 0 errors.
