# Feature Specification: Channels and Integrations (SMS, WhatsApp, generic CRM connector)

**Feature Branch**: `076-channels-integrations` (lot 10 of the PRD gap closure)
**Status**: Implemented, flags closed by default
**Impacted surfaces**: Backend API, notification worker, shared packages (contracts), database / Prisma (migration `0040_channels_integrations`), runtime / env examples. No public web change, no broker back-office change. Platform back-office: REST routes only (no UI in this lot). Public visitor journeys and authenticated journeys stay separated.

## Context

Specs 029/038/061 built the SMS and WhatsApp abstraction (flags, status, consent, dispatcher, logging provider) but nothing could really send, and a failed send was never retried. Specs 030/039 built partner webhooks (events without personal data). This spec adds the real adapters, durable retries and a generic outbound CRM connector, all closed by default.

## Requirements

- **FR-001 Real SMS adapter**: generic HTTP provider (`http`: JSON + Bearer, `twilio`: form + Basic), built only when the environment is complete (hypothesis H8).
- **FR-002 Real WhatsApp adapter**: WhatsApp Cloud API (`whatsapp_cloud`), approved template with the operational pointer as the single body parameter.
- **FR-003 Closed by default**: a channel sends only if (a) `sms_enabled` / `whatsapp_enabled` is open, (b) the provider is fully configured, (c) the recipient scope opted in. The flags are sensitive: no HTTP route can open them, only `npm run ops:apply-flag-policy` (audited). An unrecognised provider name keeps the local logging provider (no network).
- **FR-004 Consent per channel**: checked when the message is first dispatched AND again at every retry; consent withdrawn or flag closed in between cancels the pending message.
- **FR-005 Audited failures and retries**: a transient failure (timeout, network, 408, 429, 5xx) schedules a retry (4 attempts in total, delays 1 min, 5 min, 30 min); a permanent failure (other 4xx, invalid recipient) does not. Every attempt writes a masked delivery row and an audit entry; exhaustion is a `dead_letter`.
- **FR-006 Data minimisation**: the pending message keeps the recipient and the body encrypted (AES-GCM) and both are wiped as soon as the row is terminal. Audit and API never carry the number, the body or a key.
- **FR-007 Generic CRM connector**: one outbound REST connector per partner, created `disabled`, signed (`X-AssurMatch-Signature`, same scheme as partner webhooks), optional auth header of the CRM (stored encrypted, never returned), URL https + public DNS + partner origin allow-list (the webhook allow-list). Events: `lead.assigned`, `lead.status_changed`. Payload minimised by allow-list (`leadAssignmentId`, `publicReference`, `countryCode`, `productKey`, `status`, `previousStatus`): never name, e-mail, phone or free text.
- **FR-008 CRM closed by default**: delivery needs the sensitive flag `crm_connector_enabled` (compliance policy only) AND the worker variable `ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED=true`. With the flag closed nothing is prepared and nothing is sent.
- **FR-009 Administration**: `GET /admin/messaging/outbox` (audit readers), `GET|POST /admin/crm-connectors`, `PATCH /admin/crm-connectors/:id`, `GET /admin/crm-connectors/deliveries` (MFA + `partners:update`). Secrets are shown once at creation or rotation.
- **FR-010 No real send in tests**: providers and CRM calls are simulated through an injected `fetch`.

## Environment (H8, to validate)

SMS: `ASSURMATCH_SMS_PROVIDER` (`http`|`twilio`), `ASSURMATCH_SMS_API_KEY`, `ASSURMATCH_SMS_API_URL`, `ASSURMATCH_SMS_SENDER`, `ASSURMATCH_SMS_ACCOUNT_ID` (twilio). WhatsApp: `ASSURMATCH_WHATSAPP_PROVIDER=whatsapp_cloud`, `ASSURMATCH_WHATSAPP_API_KEY`, `ASSURMATCH_WHATSAPP_PHONE_NUMBER_ID`, `ASSURMATCH_WHATSAPP_API_BASE_URL`, `ASSURMATCH_WHATSAPP_TEMPLATE_NAME`, `ASSURMATCH_WHATSAPP_TEMPLATE_LANGUAGE`. Common: `ASSURMATCH_CHANNEL_HTTP_TIMEOUT_MS`. Worker: `ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED`, `ASSURMATCH_CRM_CONNECTOR_DELIVERY_LIMIT`, `ASSURMATCH_CHANNEL_OUTBOX_LIMIT`. Examples only in `.env.production.*.example`; no secret in the repository.

## Out of scope / follow-ups

Platform back-office screen for the connector and the retry queue; admin alert on dead letters; two-way CRM sync (inbound); per-country WhatsApp template catalogue.

## Business hypotheses (to validate)

H8 env variable names and provider list; WhatsApp business-initiated messages use one pre-approved template; operational pointer text only (no marketing); 4 attempts with 1-5-30 min delays; the CRM payload excludes all contact data (the CRM fetches details through the partner API or the back-office).
