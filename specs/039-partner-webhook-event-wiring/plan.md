# Implementation Plan: Partner Webhook Event Wiring

**Spec**: `specs/039-partner-webhook-event-wiring/spec.md`
**Impacted surfaces**: Backend API.

1. `PartnerWebhookEventPublisher` (fail-safe wrapper + audit) in `backend/src/modules/partner-integrations`.
2. Inject an optional publisher into `LeadAssignmentService` (assignment created) and `BrokerCrmPipelineService` (status changed).
3. Publish `notification.failed` from the quote notification failure path.
4. Runtime wiring.
5. Runtime HTTP tests; `npm run validate`.
