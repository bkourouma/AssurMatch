# Implementation Plan: Broker CRM AI Assistance

**Spec**: `specs/035-broker-ai-assistance/spec.md`
**Impacted surfaces**: Backend API, shared packages, Broker Back-office.

1. Contracts (`packages/shared/contracts/ai.contracts.ts`): broker assist types, request, validation decision, classification schema, opt-out.
2. Gateway: validate `lead_classification` JSON output.
3. `backend/src/modules/ai/broker-ai.service.ts`: CRM-bound AI requests, duplicate detection input, loss analysis aggregation, reads, validation, opt-out.
4. Runtime + HTTP wiring (`BrokerCrmController`).
5. Broker app: API client, server actions, lead detail page with AI panel, CRM home opt-out preference; source tests.
6. Integration tests; `npm run validate`.
