# Tasks: Public Form Confirmation E-mails

**Impacted surfaces**: Backend API (notifications, waitlist, contact-messages, partner-applications), shared packages (public-site and partner-application contracts), Web Publique Client (three form components), docs.
**Status**: implemented and validated on 2026-09-28. No migration required.

- [x] T001 `publicLocaleSchema` (`fr` | `en`), `PUBLIC_DEFAULT_LOCALE` and the `PublicLocale` type in `packages/shared/contracts/public-site.contracts.ts`; `locale` added as optional to `waitlistSubscribeSchema`, `contactMessageCreateSchema` and `partnerApplicationCreateSchema`. Narrower than `languageCodeSchema` on purpose: an unsupported value has no template to render.
- [x] T002 Three new `EmailPurpose` values - `public_waitlist_confirmation`, `public_contact_confirmation`, `public_partner_application_confirmation` - so `email.delivery.*` tells the three flows apart.
- [x] T003 `PublicFormEmailTemplateService`: text + HTML for the three messages in both locales, platform disclaimer, localised privacy link (`/confidentialite` vs `/en/privacy`), HTML escaping of submitter-controlled text, `findForbiddenWording` over every rendering, French fallback for an absent or unsupported locale. Per D1 the bodies carry the reference and never the submitted content.
- [x] T004 `PublicFormNotificationService` + `PublicFormNotificationPort` over `AuthEmailDeliveryPort`: a refused rendering or a throwing transport becomes `failed`, never an exception (D3).
- [x] T005 Intake wiring: `notifications` as an optional dependency of the three services, sending after the row is stored and audited, including on both duplicate paths (D4), each call guarded against an unexpected throw.
- [x] T006 Runtime: one `PublicFormNotificationService` on the existing `emailDelivery`, injected into the waitlist, partner-applications and contact-messages modules.
- [x] T007 Front-end: the three public forms send `toLocale(useLocale())`, read from the `[locale]` layout's `NextIntlClientProvider` and never from the browser (D5).
- [x] T008 Unit tests - templates: both locales, the privacy path per locale, the French fallback (absent and unsupported), HTML escaping, no blank paragraph, wording refusal. Sender: `not_configured` with no sender, the three purposes in order, `failed` on a throwing transport, `failed` on a refused rendering with nothing sent, and the masked-recipient audit under `email.delivery.previewed`.
- [x] T009 Unit tests - services: confirmation of an accepted submission with the normalised address and the submitted locale, the locale omitted when none was sent, the duplicate confirmed identically (waitlist) and with the reference on file (application), absence of the subject/body/licence number/free-text message from what the port receives, nothing sent when the country refuses, 400 on an unsupported locale, and a submission still accepted when the port throws.
- [x] T010 Integration test over the runtime HTTP layer: an accepted `POST /waitlist` carrying `locale` audits `email.delivery.not_configured` for `public_waitlist_confirmation` with a masked recipient - proof the runtime wired a sender - and an unsupported locale is refused with 400 before anything is written. **Not covered, and it cannot be here**: an actually delivered message. The suite has no SMTP; asserting `sent` would be a fake green. Real delivery is observed on the local stack through Mailpit.
- [x] T011 Guardrails: rendered-message wording check over both locales, with the English equivalents spelled out (D3); Playwright source marker over the three forms asserting the page locale is sent and `navigator.language` is not read.
- [x] T012 `docs/prd_coverage_map.md`: backlog item 7 closed, the public-site intake row updated.
- [x] T013 Validation: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, `npx prisma validate`, `npm audit --audit-level=high`, `node scripts/ci/secret-scan.mjs`.

## Not done

- No local Mailpit run of the three forms: the local stack was not started for this change, so the
  six rendered messages are verified by unit and guardrail tests, not observed in an inbox. Run
  `cmd /c launch-local.bat`, submit the three forms on `http://localhost:3601` in both locales and
  read them on `http://localhost:8025` to close that gap.
- No runtime Postgres smoke: this change stores nothing new, so there is no schema behaviour to
  smoke.
