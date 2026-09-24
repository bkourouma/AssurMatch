# Tasks: Quote Notification Delivery

**Impacted surfaces**: Backend API (notifications), runtime (worker script), docs/runbooks.
**Status**: implemented and validated on 2026-09-19. No migration required.

- [x] T001 Extend `EmailPurpose` with the three quote purposes; `QuoteEmailTemplateService` renders text + HTML for `visitor_quote_confirmation`, `visitor_quote_non_routable` and `broker_lead_assigned`. Tests assert required content **and** the absence of visitor contact and answer values in the broker template (D1).
- [x] T002 Content guardrail: `findForbiddenWording` over subject and body before every send; a hit refuses, marks the notification `failed` and audits the matched wording.
- [x] T003 Recipient resolution: `visitor:<publicReference>` through the quote request to its prospect, `partner:<tenantId>` to the partner primary email; unresolvable is `failed` with `recipient_unresolved`, never skipped.
- [x] T004 `QuoteNotificationDeliveryService.processDueNotifications({ limit })`: select queued/retryable quote notifications, render, guard, send through `RuntimeEmailDeliveryService`, update delivery. WhatsApp status passed through unchanged. Retry cap on the row; a disabled mailer leaves rows `queued` and is reported.
- [x] T005 Worker `scripts/quote-notification-delivery-worker.ts` + `quote-notifications:deliver-due` npm script, bounded by `ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT` (1-100, default 25), JSON summary on stdout.
- [x] T006 Tests: idempotence (two runs, one message), retry then cap, disabled mailer leaving the backlog intact, recipient unresolved, quote scope unresolved, forbidden wording refusal, batch limit, WhatsApp untouched, audit of every outcome. **Not covered, and it cannot be**: `notification.failed` on the partner webhook - see the corrected claim in the spec.
- [x] T007 Runtime Postgres smoke asserts the worker sees the queued backlog in PostgreSQL and, with no mailer configured, leaves it intact. It deliberately does not assert `sent`: the smoke runtime has no SMTP, and asserting a delivery that cannot happen there would be a fake green. Real delivery is verified on the local stack (Mailpit) in T009.
- [x] T008 Runbook for the worker (what to check when notifications accumulate at `queued`); update `docs/prd_coverage_map.md`.
- [x] T009 `npm run validate`, `npx playwright test`, `npm run test:runtime:postgres:docker`; then the local journey with a real submission and two messages visible in Mailpit.
