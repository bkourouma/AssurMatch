# Implementation Plan: Public Form Confirmation E-mails

**Spec**: `specs/047-public-form-confirmation-emails/spec.md`
**Impacted surfaces**: Backend API (notifications, waitlist, contact-messages, partner-applications), shared packages (public-site and partner-application contracts), Web Publique Client (three form components), docs.
**Blocked on**: nothing. No migration, no new route, no new flag.

## Sequencing rationale

The contract comes first, because the locale is the only new input and every later step reads it. The
templates and their guardrail come next, before any send is wired: once a service can send, a
regulated phrase in a template is an outbound compliance incident, and the only safe moment to make
that impossible is before the first message can leave. This is the ordering spec 044 used, for the
same reason.

Wiring the three intake services comes before the runtime, so each one can be tested against a
recording port with no transport at all. The runtime is wired last, and the front-end after it: a form
sending a `locale` the API does not yet accept would be refused with 400, so the field is accepted
server-side before it is ever sent.

1. **Contracts.** `publicLocaleSchema` (`fr` | `en`) plus `PUBLIC_DEFAULT_LOCALE` in
   `public-site.contracts.ts`; `locale` added as optional to `waitlistSubscribeSchema`,
   `contactMessageCreateSchema` and `partnerApplicationCreateSchema`. Optional, so an older client
   still submits and is answered in French.
2. **Purposes.** Three new `EmailPurpose` values, so the existing `email.delivery.*` audit labels the
   three flows apart instead of lumping them together.
3. **Templates.** `PublicFormEmailTemplateService` renders text and HTML for the three messages in
   both locales, carries the platform disclaimer and the localised privacy link, and runs
   `findForbiddenWording` over every rendering. Per D1 the bodies carry the reference and never the
   submitted content; the unit tests assert what must be present **and** what must never be.
4. **Sender.** `PublicFormNotificationService` implements a narrow `PublicFormNotificationPort` over
   `AuthEmailDeliveryPort`, turning a refused rendering or a throwing transport into a `failed`
   status rather than an exception (D3). The port is what the intake services depend on, so their
   tests need no SMTP.
5. **Intake wiring.** The three services take the port as an optional dependency and send after the
   row is stored and audited - including on the duplicate paths (D4). Each call is additionally
   wrapped, so an unexpected throw cannot undo a recorded submission.
6. **Runtime.** One `PublicFormNotificationService` built on the existing `emailDelivery`, injected
   into the three modules.
7. **Front-end.** The three forms send `toLocale(useLocale())`. Read from the layout's
   `NextIntlClientProvider`, never from the browser (D5).
8. **Guardrails and docs.** A wording guardrail over the rendered messages in both locales, a source
   marker test over the three forms, then the coverage map.

## Risks

- **PII reaching a mailbox (D1).** The templates are the only place this can happen, which is why the
  service tests assert the absence of the subject, the body, the licence number and the free-text
  message from what the port receives - not only the presence of the reference.
- **A duplicate becoming observable (D4).** Confirming only first submissions would leak, to the owner
  of the address, exactly what the identical response is designed to hide. Both duplicate paths send,
  and both are covered by a test comparing the two confirmations.
- **English copy escaping the French guardrail (D3).** The shared list cannot catch "valid contract".
  Mitigated by a guardrail test that spells out the English equivalents and renders both locales.
  Accepted limitation: it is a fixed list, not a semantic check.
- **A submission failing because of the e-mail.** The whole point of D3. Covered by a test where the
  port throws and the submission still resolves `accepted`.
- **Latency on a public endpoint.** The send is synchronous, bounded by `EMAIL_SEND_TIMEOUT_MS`
  (5 s default), exactly like the auth e-mails. A slow SMTP host slows the form response; it does not
  break it. If that ever becomes a real cost, the fix is a queue, which is D2 revisited - not a
  silent fire-and-forget, which would make failures unobservable.
- **Scope creep into an unsubscribe flow.** The waiting-list message asks the submitter to reply. A
  token-bound withdrawal endpoint is a separate spec, with its own audit and rate limiting.
