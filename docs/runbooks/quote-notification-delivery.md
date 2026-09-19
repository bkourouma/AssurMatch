# Runbook — Deliver quote notifications

Quote notifications are written as `Notification` rows at `emailStatus = "queued"` when a request is
submitted and routed. A worker drains them into the configured mailer. Nothing is sent by the API
process itself, so if the worker never runs, nothing ever leaves.

## Run

```bash
npm run quote-notifications:deliver-due
```

Bound the batch with `ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT` (1-100, default 25). The worker
prints a JSON summary and exits:

```
{"due":4,"processed":4,"sent":3,"retryable":0,"failed":1,"notConfigured":0,"outcomes":[...]}
```

It is idempotent: a row leaves `queued` as part of being handled, so running it twice never sends
twice. Schedule it at whatever cadence the operation needs, as with `partner-webhooks:deliver-due`.

## When notifications accumulate at `queued`

Read the counters before touching anything.

- **`notConfigured` > 0** — the mailer is off (`EMAIL_SERVICE_TYPE=disabled`) or misconfigured. Rows
  are deliberately left `queued` so the backlog survives; fix the configuration and re-run. Nothing
  was lost.
- **`due` > 0 and the worker is not scheduled** — the common case. The rows are fine; the job is not
  running.
- **`retryable` > 0** — the transport failed (SMTP unreachable, auth rejected, timeout). Check the
  `email.delivery.failed` audit entries for the error class. Rows retry on the next runs until the
  cap (3), then become `failed`.
- **`failed` with reason `recipient_unresolved`** — a partner with no primary email, or a quote whose
  prospect is gone. Fix the record; the notification will not retry on its own.
- **`failed` with reason `forbidden_public_wording`** — a rendered message contained regulated
  wording. This is a compliance incident, not a formatting bug: the send was refused before leaving.
  Read the audited `wording` and fix the source (usually a partner legal name or a product key).

A partner-scoped notification that fails on every channel publishes `notification.failed` to that
partner's webhook when partner webhooks are enabled (spec 039).

## What the emails contain

By design (spec 044 D1), the broker email carries a **pointer**, never the lead: public reference,
country, product and a link to the back-office. Visitor contact details and consented answers are
never in an email — email leaves every access control the platform applies to that data. If someone
asks for the lead to be included, that is a data-protection decision, not a template change.

## Verify locally

```bash
npm run quote-notifications:deliver-due
```

Then open Mailpit at `http://localhost:8025`. A routed submission produces two messages: the visitor
confirmation and the broker lead notification.
