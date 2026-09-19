# Feature Specification: Partner Webhook Event Wiring

**Feature Branch**: `039-partner-webhook-event-wiring`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; `partner_api_enabled` and `partner_webhooks_enabled` stay disabled by default)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Webhooks tell a partner's own system that a lead was assigned or changed status. They carry no prospect contact data, no price and no coverage statement, and they never replace the platform's own records.
- **Impacted application(s)**: Backend API only (lead assignment, CRM status changes, notification failures). No UI change beyond the existing `/partner-integrations` delivery table.
- **Affected scopes**: Partner tenants (their own endpoints only), countries and products through the lead's metadata.
- **Frontend separation**: No public or broker surface change.
- **Required feature flags**: `partner_webhooks_enabled` (global, default false, sensitive). With the flag off, every event still records a `skipped` delivery with reason `feature_disabled` so the trail exists without any outbound call.
- **Consent and transmission**: The payload minimizer already restricts the body to `leadAssignmentId`, `publicReference`, `countryCode`, `productKey`, `status`, `previousStatus`, `notificationId`, `notificationType`, `failureClass`. This spec only feeds it those keys - never contact, answers, documents or amounts.
- **Partner license controls**: An event is only prepared for the tenant the lead is assigned to; no cross-tenant fan-out.
- **Audit and data history**: Each event produces delivery rows and the existing prepared/skipped audit entries. Wiring failures never break the lead flow: a webhook error is caught, audited and swallowed.
- **Security and RBAC**: No new route. The dispatch runs inside existing authorised flows (routing, CRM mutation, notification failure).
- **Routing impact**: None - webhooks observe routing outcomes, they never influence eligibility, ranking or assignment.
- **AI impact**: None.
- **UX/content restrictions**: N/A (machine-to-machine payload with no marketing wording).
- **Workflow continuity**: Standard.

## Requirements

- `PartnerWebhookEventPublisher`: a thin wrapper around `prepareWebhookDelivery` that never throws into the caller and audits its own failures.
- `lead.assigned` is published when a lead assignment is created by routing, manual routing or reassignment (for the receiving tenant).
- `lead.status_changed` is published when a broker CRM status change is recorded (with `previousStatus` and `status`).
- `notification.failed` is published when a broker notification delivery fails.
- The publisher is wired in the runtime and injected into the lead and CRM services; when partner integrations are unavailable the call is a no-op.

## User Scenarios & Testing

1. **Given** `partner_webhooks_enabled` off, **When** a lead is assigned, **Then** a `skipped` delivery with reason `feature_disabled` exists for that tenant, no outbound call is attempted, and the assignment still succeeds.
2. **Given** the flag on and an active endpoint subscribed to `lead.assigned`, **When** a lead is assigned, **Then** a pending delivery exists for that endpoint, its recorded payload keys contain no contact data, and the tenant of the delivery is the assigned tenant only.
3. **Given** a CRM status change, **Then** a `lead.status_changed` event carries `previousStatus` and `status` and nothing else beyond the allowed keys.
4. **Given** the webhook preparation throws, **Then** the lead operation still succeeds and the failure is audited.

## Validation

- `npm run validate` green; runtime HTTP tests covering assignment, status change and the disabled-flag path.
