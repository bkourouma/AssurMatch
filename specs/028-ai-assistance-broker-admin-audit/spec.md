# Feature Specification: Broker/Admin AI Assistance With Explicit Flags And Audit

**Feature Branch**: `028-ai-assistance-broker-admin-audit`
**Created**: 2026-05-03
**Status**: Implemented

## Scope

- **Impacted surfaces**: Backend API, Back-office Plateforme/Admin, Broker Back-office, shared packages.
- **Role**: Expose AI assistance readiness/status metadata with explicit flags, audit and guardrails.
- **Forbidden behavior**: No model call, no prompt submission, no PII transfer, no automated decision, no recommendation that binds coverage/routing/pricing.
- **Flags**: `ai_broker_assistant_enabled`, `ai_summary_enabled`, and `ai_recommendation_enabled` are reported explicitly and remain non-activating in this surface.
- **Audit**: Reads emit `ai_assistance.status.read`; refusals emit `ai_assistance.status.refused`, always with `modelCall=false`.

## Requirements

- Add `GET /admin/ai/assistance` for AI Admin/Super Admin/Compliance Admin.
- Add `GET /broker/crm/ai-assistance` for CRM-authorized broker users.
- Return `enabled=false`, `modelCall=false`, `humanValidationRequired=true`, `auditPolicy=metadata_only`.
- Add admin and broker UI surfaces that render the disabled metadata without mutation controls.

## Validation

- Backend runtime HTTP tests cover admin status, broker status and forbidden admin role.
- Playwright source tests verify admin/broker pages and no mutation controls.
