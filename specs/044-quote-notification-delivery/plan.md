# Implementation Plan: Quote Notification Delivery

**Spec**: `specs/044-quote-notification-delivery/spec.md`
**Impacted surfaces**: Backend API (notifications), runtime (worker script), docs/runbooks.
**Blocked on**: nothing.

## Sequencing rationale

Templates and the content guardrail come before any send. The order matters: once the worker exists,
a regulated word in a template is an outbound compliance incident, and the only safe moment to make
that impossible is before the first message can leave.

Recipient resolution comes before delivery for the same reason as spec 043's consent gate: a
half-built worker that sends to whatever address it finds is worse than one that cannot send yet.

1. **Purposes and templates.** Extend `EmailPurpose` with `quote_visitor_confirmation`,
   `quote_visitor_non_routable` and `quote_broker_lead`, so the existing `email.delivery.*` audit
   labels them. `QuoteEmailTemplateService` renders text and HTML for the three, carrying the
   platform disclaimer and - per D1 - a pointer, never lead content. Unit tests assert what the
   bodies must contain **and what they must never contain**.
2. **Content guardrail.** `findForbiddenWording` over subject and body before every send; a hit
   refuses, marks `failed` and audits the match. Tested with a deliberately poisoned template.
3. **Recipient resolution.** `visitor:<publicReference>` through the quote request to the prospect;
   `partner:<tenantId>` to the partner's primary email. Unresolvable means `failed` with
   `recipient_unresolved`, never a skip - a silently skipped row is indistinguishable from a healthy
   queue.
4. **Delivery service.** `processDueNotifications({ limit })`: select queued/retryable quote
   notifications, render, guard, send, `updateDelivery`. WhatsApp status is passed through unchanged.
   Retry count on the row drives the cap; a disabled mailer leaves the row `queued` and is reported.
5. **Worker + npm script**, modelled on `scripts/partner-webhook-delivery-worker.ts`, with a bounded
   limit and a JSON summary on stdout.
6. **Runtime smoke** asserts a notification actually reaches `sent` against real Postgres, so the
   "green suite, dead journey" failure mode of spec 043 cannot repeat here.
7. **Runbook** + coverage map; then the local journey with two messages in Mailpit.

## Risks

- **Sending twice.** The whole design rests on the notification row being the state. If selection and
  status update are not paired, a crash mid-batch resends on the next run. Mitigated by moving the
  row out of `queued` as part of handling it, and by scenario 2 running the worker twice.
- **A disabled mailer draining the queue.** Marking rows `failed` when email is simply not configured
  would destroy the backlog an operator needs. The disabled path deliberately leaves rows `queued`.
- **PII leaking into a mailbox (D1).** The templates are the only place this can happen, which is why
  the tests assert absence of contact and answer values rather than only presence of the reference.
- **Retry storms.** No scheduler is added; cadence is the operator's, exactly like partner webhooks.
  The cap turns a permanently failing address into a `failed` row that surfaces, instead of an
  infinite retry.
- **Scope creep into WhatsApp.** `updateDelivery` takes both channels; passing the current WhatsApp
  status through is what keeps this spec from quietly opening a disabled channel.
