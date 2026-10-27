# Feature Specification: Channels and CRM connector admin screens + dead-letter alert

**Feature Branch**: `orch/2026-10-21-ecarts-prd-lot-12`, intégrée dans main (PR #44, commit 50c0c84) (lot 12 of the PRD gap closure)
**Status**: Implemented, flags unchanged (closed by default)
**Impacted surfaces**: Backend API (admin alert type + dead-letter hook wiring), Back-office Plateforme/Admin (two screens, one menu entry each), shared packages (admin alert contract only). No public web change, no Broker Back-office change, no database migration (`AdminAlert.type` is a free string column), no runtime/Docker change.

## Context

Spec 076 (lot 10) shipped the SMS/WhatsApp retry queue (`ChannelOutbox`) and the generic CRM connector as admin REST routes only, and left two gaps: no screen, and the dispatcher `onDeadLetter` callback was wired to nothing. This spec closes both. Constitution rules apply: public and authenticated journeys stay separated, sensitive flags (`sms_enabled`, `whatsapp_enabled`, `crm_connector_enabled`) never move over HTTP, no personal data in alerts, audit, console, URL.

## Requirements

- **FR-001 Channels screen** (`/channels`): read-only view of the retry queue from `GET /admin/messaging/outbox` (audit readers: `audit_logs:read` + MFA). Columns: channel, status (`retryable`, `sent`, `failed`, `dead_letter`, `cancelled`), template, partner reference, attempts, next attempt, last error class, creation date. Counters per status. No recipient and no body (the API never returns them). The masked recipient is shown only in the second table "Dernieres diffusions", fed by the existing `GET /admin/messaging/deliveries` (`recipientMasked`). Channel state (flag, provider configured) comes from the existing `GET /admin/messaging/providers`, read-only. Other roles: a clean refusal message (no crash, no data).
- **FR-002 CRM connectors screen** (`/connecteurs-crm`): list (`GET /admin/crm-connectors`), creation (`POST`: partner, name, https URL, events `lead.assigned` / `lead.status_changed`, optional auth header name+value, audited reason), activation / suspension / disabling (`PATCH` status with reason), secret rotation (`rotateSecret`), delivery history (`GET /admin/crm-connectors/deliveries`, optional connector filter). Access: MFA + `partners:update` (the API decides; the screen shows a clean refusal for other roles).
- **FR-003 One-time secret**: the signing secret (`crmsec_...`) returned at creation or rotation is shown once through the same mechanism as the partner integrations screen (`SecretReveal`: held only in the server-action state of the client component; never in URL, cookie, storage, console, audit, revalidation payload or error message). The auth header value is write-only: never displayed, never echoed.
- **FR-004 Flag stays outside HTTP**: the screen shows the state of `crm_connector_enabled` (read-only, best effort through `GET /admin/feature-flags`) and the operations command `npm run ops:apply-flag-policy -- --flag crm_connector_enabled --value true --reference ... --approved-by ... --reason ...`, plus the worker variable `ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED`. No button opens a flag.
- **FR-005 Dead-letter alert**: when an outbox message reaches `dead_letter`, the dispatcher `onDeadLetter` hook raises an admin alert of the new type `channel_dead_letter` (severity `critical`, label "Message SMS/WhatsApp en echec definitif"). Condition key `channel_dead_letter:{channel}:{partnerTenantId|global}` (one open alert per channel and partner, daily dedupe, occurrences counted by the existing `raise` rules). `details` carry only `channel`, `template`, `attempts`, `errorClass`, never a number, a body or a key. The compliance pointer e-mail of the alerts center applies as for the other types. A failing alert never blocks the outbox (already swallowed by the dispatcher; the async raise is also caught).
- **FR-006 Navigation**: `Canaux` and `Connecteurs CRM` entries in the "Partenaires" group of the admin menu, reachable from the menu and from each other.
- **FR-007 Tests**: backend unit + HTTP integration for the alert; Playwright "sources" specs for both screens (read the source files, same style as `ai-scope-flags.spec.ts`).

## Out of scope

Retry/cancel of a single outbox row from the UI; editing the CRM URL / auth header from the UI (API supports it; screen offers creation, status change and rotation only); two-way CRM sync.

## Business hypotheses (to validate)

H12-1 the dead-letter alert is `critical` because a business message was definitively lost; H12-2 one open alert per channel and partner is enough (not one per message), the count of dead letters is read on the Channels screen; H12-3 the masked recipient lives on the deliveries table, not on the outbox rows (the outbox keeps the recipient encrypted and wipes it when terminal, the API deliberately never decrypts it); H12-4 the French UI wording follows the existing back-office (no accents in source strings, like the neighbouring screens).
