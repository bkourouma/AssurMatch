# Runbook — Deliver quote notifications

Quote notifications are written as `Notification` rows at `emailStatus = "queued"` when a request is
submitted and routed. A worker drains them into the configured mailer. Nothing is sent by the API
process itself, so if the worker never runs, nothing ever leaves.

## Run

On preproduction and production the worker is run by the operator or a scheduler:

```bash
npm run quote-notifications:deliver-due
```

**Locally the launcher already does this for you.** `launch-local.bat` starts a fifth process,
`worker-notifications`, which runs the same worker every 10 seconds with the local environment
(`APP_ENV=local`, `EMAIL_SERVICE_TYPE=mailpit`, SMTP on `127.0.0.1:1025`). A demo submission lands
in Mailpit within seconds; no manual command is needed. See
[Local App Quickstart](../local-app-quickstart.md#queued-email-delivery). The loop refuses to start
when `APP_ENV` is `production` or `preproduction`: those environments schedule the command above.

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

With the local stack running, submit a quote and open Mailpit at `http://localhost:8025`. A routed
submission produces two messages within ~10 seconds: the visitor confirmation and the broker lead
notification. The delivery loop logs one counter line per run in
`.local/logs/worker-notifications.out.log`:

```
[worker-notifications] 2026-09-19T18:20:31.004Z quote-notifications due=2 processed=2 sent=2 retryable=0 failed=0 notConfigured=0 ms=1620
```

If nothing arrives, read that log first.

- **No new line for more than a minute** — the loop is not running. `npm run local:health` reports
  it as `warn notification worker log is ...s old`. Relaunch the stack, or fall back to
  `npm run quote-notifications:deliver-due` with the local environment.
- **`notConfigured` > 0** — the mailer env did not reach the loop (Mailpit down, or
  `EMAIL_SERVICE_TYPE` missing). Rows stay `queued`, nothing is lost.
- **`status=error`** — the worker itself failed; the last stderr line is on the same log line and
  the full output is in `.local/logs/worker-notifications.err.log`.

The loop only schedules the existing worker. It runs it sequentially (never two runs at once), logs
counters only — never recipients, notification ids or lead content — and is idempotent for the same
reason the worker is.

Partner webhook deliveries are **not** polled by default: with `partner_webhooks_enabled` off, that
worker writes a refusal audit entry on every run, which would flood the local audit log. Set
`ASSURMATCH_LOCAL_WORKER_PARTNER_WEBHOOKS=true` to include it when testing webhooks locally.
