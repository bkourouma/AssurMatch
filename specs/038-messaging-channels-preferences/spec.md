# Feature Specification: Messaging Channels, In-App Notifications And Preferences

**Feature Branch**: `038-messaging-channels-preferences`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; SMS and WhatsApp stay disabled by default behind sensitive flags)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Notifications are operational messages about a lead or an account. They never contain a price commitment, a coverage confirmation or a marketing claim, and they never replace the broker partner's own communication.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Broker Back-office (inbox + preferences), Back-office Plateforme (`/operations` messaging status).
- **Affected scopes**: Partner tenants (per-tenant preferences and inbox), admin users (platform inbox), countries via the existing notification payloads.
- **Frontend separation**: Broker routes under `/broker/notifications/...`; admin messaging status stays under `/admin/messaging/...`. No public surface.
- **Required feature flags**: `sms_enabled`, `whatsapp_enabled` (global, default false, sensitive - compliance policy path only). Email and in-app stay always available as the operational baseline. A channel is only dispatched when its flag is on, a provider is configured, and the recipient has opted in.
- **Consent and transmission**: A prospect is never messaged by this module; recipients are platform users (brokers, admins). Recipient identifiers are masked in audit logs and never echoed in API responses beyond the masked form.
- **Partner license controls**: Preferences are tenant-scoped; a broker only reads and writes its own tenant preferences and inbox.
- **Audit and data history**: Every dispatch attempt records a `MessagingDelivery` row (channel, status, template, masked recipient, provider, failure reason) and an audit entry; preference changes are audited with before/after values. In-app notifications are persisted per recipient (migration `0013_messaging_channels`).
- **Security and RBAC**: MFA required on back-office routes. Brokers need a broker role and their tenant; the admin test dispatch needs `super_admin`. No provider secret is ever returned; the status endpoint keeps exposing `secretConfigured` booleans only.
- **Routing impact**: None.
- **AI impact**: None (relaunch drafts stay in spec 035 and are never auto-sent).
- **UX/content restrictions**: "Notification operationnelle", "aucun engagement contractuel". Never "Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", and no promotional wording.
- **Workflow continuity**: Standard.

## Requirements

- Contracts: messaging channel, delivery record, notification preferences (per channel opt-in + digest), in-app notification DTO, test dispatch request.
- Prisma models `MessagingDelivery`, `NotificationPreference`, `InAppNotification` + migration `0013_messaging_channels` + repositories (memory/Prisma).
- `MessagingProviderPort` with a `LoggingMessagingProvider` default (records, never leaves the process); `MessagingDispatchService.dispatch(...)` refuses with an explicit reason when the channel flag is off, the provider is unconfigured or the recipient opted out, and records every attempt.
- `NotificationPreferencesService`: read/update per tenant (broker) and per admin actor; email and in-app cannot be disabled (operational baseline), sms/whatsapp default off.
- `InAppNotificationsService`: publish (used by lead assignment and admin alerts), list for the recipient, mark read; strictly recipient-scoped.
- The existing `/admin/messaging/providers` status reports the real capability (`sendCapable` true only when flag + provider + secret are all present); `POST /admin/messaging/test` performs a dispatch through the port for a Super Admin and never reveals secrets.
- HTTP: `GET /broker/notifications/inbox`, `POST /broker/notifications/inbox/:id/read`, `GET|PUT /broker/notifications/preferences`, `POST /admin/messaging/test`.
- Broker UI: inbox panel and preferences form; admin operations page shows provider capability and delivery outcomes.

## User Scenarios & Testing

1. **Given** `sms_enabled` off, **When** a dispatch to SMS is attempted, **Then** it is refused with `channel_disabled`, no provider call, and the attempt is recorded and audited.
2. **Given** `whatsapp_enabled` on through the compliance policy path and a configured provider, **When** a broker opted in, **Then** the dispatch is `sent` through the port, the recipient is masked in the audit entry, and the delivery row is listed for the admin.
3. **Given** a broker who opted out of WhatsApp, **Then** the dispatch is refused with `recipient_opted_out` while email and in-app still deliver.
4. **Given** a lead assigned to a tenant, **Then** an in-app notification appears in that tenant's inbox only, can be marked read, and is never visible to another tenant.
5. **Given** a broker attempting to disable email or in-app, **Then** the request is refused (operational baseline).
6. **Given** a non-super-admin, **Then** `POST /admin/messaging/test` returns 403 and the refusal is audited.

## Validation

- `npm run validate` green; broker and admin source tests; runtime HTTP tests for dispatch, inbox, preferences and the admin test route; migration list test updated.
