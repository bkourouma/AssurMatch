# Tasks: Broker Satisfaction Feedback

**Spec**: `specs/048-broker-satisfaction-feedback/spec.md`
**Plan**: `specs/048-broker-satisfaction-feedback/plan.md`
**Impacted surfaces**: Backend API (new `satisfaction-surveys` module; hooks into `leads`/broker-crm,
`broker-starter`, `notifications`, `consent`, `dashboards`, `feature-flags`, `compliance-alerts`),
database/Prisma migration, shared packages (contracts), Web Publique Client (one new page), Broker
Back-office (read-only dashboard addition), Back-office Plateforme (read-only dashboard + compliance
alerts addition).
**Status**: Planned, not started. Per Constitution Article XI and the spec's own status banner, T001-T027
MUST NOT run until the maintainer has explicitly approved decisions D1-D8 in `spec.md`. T005 (the D2
Starter-event-path verification) is itself a blocking prerequisite for every task after it - its outcome
determines whether T007 touches one lifecycle publisher or two.

Every task below carries its own validation criteria in addition to the full-suite run at T027. A task is
not done until its stated criteria pass; "guards" below always means `findForbiddenWording` and/or the
RBAC/tenant-scope checks the task touches, per Constitution Article IX.

## Foundation (consent + flag) - must land before anything can trigger or send

- [ ] T001 Confirm the next free migration number (plan.md notes `0018_data_retention` as the latest
  confirmed at research time - re-check before naming `NNNN_satisfaction_surveys`).
  **Validation**: `npx prisma migrate status` (or equivalent) shows no pending migration with a
  conflicting number.
- [ ] T002 Add `service_quality_survey` to `ConsentPurpose`; publish the amended public consent text
  (additive sentence disclosing the possible post-completion e-mail, no new checkbox, per D5).
  **Validation**: typecheck; unit test asserts a consent accepted under the pre-amendment text carries
  no `service_quality_survey` purpose (no retroactive reinterpretation).
- [ ] T003 Register `satisfaction_survey_enabled` in `GLOBAL_FEATURE_FLAG_DEFAULTS` (default `false`) and
  wire it into the sensitive-flag/audited-activation policy alongside `multi_broker_routing_enabled` and
  `retention_purge_enabled` (D8).
  **Validation**: unit test asserts the flag cannot be opened through a plain admin toggle, only through
  the audited compliance-policy path; unit test asserts default is `false`.
- [ ] T004 `QuoteSubmissionService` grants `service_quality_survey` alongside `lead_transmission` in the
  same submission call, as a second `ConsentRecord` row.
  **Validation**: unit test asserts both purposes are recorded at submission with `intendedRecipient`
  distinct ("AssurMatch" vs the assigned broker); lint; typecheck.

## Lifecycle event prerequisite (D2)

- [ ] T005 Verify whether the Starter accept/reject/close controller already publishes
  `events.publish("lead.status_changed", partnerTenantId, data)` on the `closed` transition. If not,
  extend it to publish through the same optional, non-blocking observer `BrokerCrmPipelineService`
  already exposes, mirroring its shape exactly (no new observer interface).
  **Validation**: unit test asserts a Starter `closed` transition publishes `lead.status_changed`
  identically in shape to a Pro/Enterprise `gagne`/`perdu` transition; unit test asserts a throwing or
  slow publish never blocks or delays the status-change response to the broker.

## Trigger + data model

- [ ] T006 `SatisfactionSurveyStatus` enum and `SatisfactionSurveyRequest` Prisma model (per plan.md's
  schema) plus migration `NNNN_satisfaction_surveys`; `EmailPurpose` gains
  `satisfaction_survey_requested`; new `SatisfactionAuditActions` const object
  (`satisfaction_survey.queued`, `.sent`, `.skipped`, `.link_invalid`, `.submitted`,
  `.concern_flagged`).
  **Validation**: `npx prisma validate`; typecheck; migration applies cleanly against a fresh database.
- [ ] T007 `SatisfactionSurveyTriggerService` subscribing to `lead.status_changed`: filters to D1's
  trigger set (Pro/Enterprise `gagne`/`perdu`, Starter `closed`), excludes `doublon`, `hors_cible`,
  `injoignable`, `rejete_conteste` and Starter's declining `rejected`, re-checks flag + consent +
  country/product activity, creates the `queued` row with `dueAt = triggeredAt + 24h` (D3), audits
  `satisfaction_survey.queued`.
  **Validation (guards)**: unit tests - each excluded status creates nothing; a Pro `gagne`/`perdu`
  transition creates exactly one row; a Starter `closed` transition creates exactly one row on the same
  delay (parity with T005); flag-closed creates nothing; missing `service_quality_survey` consent creates
  nothing; a second trigger on an assignment that already has a row creates nothing (FR-012 unique
  constraint); typecheck; lint.

## Token + public authentication (D4)

- [ ] T008 `publicReference` (`SF-` prefix, minted fresh, never the quote's own reference) + opaque
  bearer `token`, hash-only storage, mirroring `QuoteSubmissionService.authenticateVisitor`.
  **Validation (guards)**: unit tests - unknown reference, wrong token, expired link (`expiresAt` in the
  past) and an already-submitted link all resolve to the same generic "unavailable" outcome, so none is
  distinguishable from another; typecheck; lint.

## Template + sender + worker

- [ ] T009 Survey-request e-mail template (FR/EN) via `PublicFormEmailTemplateService`-style rendering:
  states the broker's name is not needed, what the message is for, that it is optional, links to
  `/avis/:publicReference?token=...` (FR) / `/en/feedback/:publicReference?token=...` (EN) in the
  request's recorded locale; `findForbiddenWording` runs over every rendering before any sender exists
  (template-before-sender ordering, per specs 044/047).
  **Validation (guards)**: unit tests - both locales render required content, `findForbiddenWording`
  refuses a wording violation for both locales, no blank paragraph, no visitor answer content leaked into
  broker-facing surfaces; lint; typecheck.
- [ ] T010 `PublicFormNotificationPort`-shaped sender for `satisfaction_survey_requested`; drain worker
  (own npm script, e.g. `satisfaction-surveys:deliver-due`) re-checks eligibility at send time (flag
  still open, country/product still active, request not anonymized by spec 046, consent not withdrawn,
  no prior send for the assignment) and marks ineligible rows `skipped` with an audited reason, following
  spec 044's `deliver-due` shape.
  **Validation (guards)**: unit tests - idempotence (two worker runs, one message sent), a
  newly-ineligible row at send time is marked `skipped` with the correct reason and audited, a refused
  rendering or throwing transport never blocks the batch, batch limit respected; typecheck; lint.

## Public submission + compliance alert

- [ ] T011 Public `GET`/`POST` endpoint on the reference+token pair; submission stores rating (1-5,
  required), optional comment (<=1000 chars, HTML-escaped on every render), optional concern flag; sets
  `status = submitted`, `submittedAt`; a resubmission on an already-submitted link returns the existing
  confirmation and stores nothing new (D8 immutability); rate-limited the same way `consent_withdrawal`
  already is (`abuseGuard.assertAllowed`).
  **Validation (guards)**: unit tests - a valid submission persists exactly once, a second submission
  attempt on the same reference+token changes nothing and returns the prior confirmation, comment is
  HTML-escaped on read, rate limiting rejects abusive request volume; typecheck; lint.
- [ ] T012 One `broker_satisfaction_concern` compliance alert per submission with rating <= 2 or a
  checked concern flag, wired into `compliance-alerts.service.ts`, carrying partner tenant, public
  reference and rating - never the free-text comment inline (D7, FR-006).
  **Validation**: unit test asserts exactly one alert per qualifying submission, no alert for a rating >=
  3 with no flag, alert payload excludes the comment; typecheck; lint.
- [ ] T013 Web Publique Client page at `/avis/:publicReference` (FR) and `/en/feedback/:publicReference`
  (EN): no session required, no back-office link, no broker identity beyond the existing courtesy line;
  renders the same neutral "unavailable" state for all four indistinguishable outcomes from T008.
  **Validation**: Playwright source marker confirms the page carries no authenticated-session dependency
  and no back-office link; both locale routes render; typecheck; lint; `npm run test:web`.

## Consent withdrawal interaction (FR-009)

- [ ] T014 Extend the existing consent-withdrawal handler: a still-`queued` survey for the same request
  is marked `skipped` (reason `consent_withdrawn`) at withdrawal time, and no new survey can be queued
  for the same assignment afterward.
  **Validation (guards)**: unit test - withdrawing consent before `dueAt` marks the row `skipped` with
  `consent_withdrawn` and audits it, no e-mail is sent; unit test - a later trigger on the same
  assignment after withdrawal still creates nothing; typecheck; lint.

## Dashboards (read-only additions)

- [ ] T015 `BrokerCrmDashboardSection` / `BrokerStarterDashboardSection` gain the broker's own aggregate
  satisfaction figures (average rating, response count, flagged count) and individual submitted
  responses, scoped exactly like every other lead-derived dashboard figure.
  **Validation (guards - RBAC)**: unit/integration test - a broker sees only its own tenant's
  satisfaction data, never another partner's (cross-tenant isolation test mirroring the existing
  dashboard test discipline); typecheck; lint.
- [ ] T016 Admin partner-performance view gains a per-partner satisfaction score alongside the existing
  SLA and dispute-rate figures; the compliance alerts feed renders the `broker_satisfaction_concern`
  alert type from T012.
  **Validation (guards - RBAC)**: unit/integration test - only compliance/support/super-admin roles can
  read the per-partner aggregate and drill into a flagged individual response, matching the existing
  compliance-alerts role split; typecheck; lint.

## Retention integration (FR-011)

- [ ] T017 Add `satisfaction_feedback` to `DEFAULT_RETENTION_POLICIES` (anchor: `submittedAt`, else
  `expiresAt`); extend spec 046's D4 broker-CRM-content anonymizer so anonymizing a quote request also
  blanks its linked survey's `comment` and stamps `anonymizedAt`, keeping rating/status/timestamps as
  minimal proof.
  **Validation**: unit test - the anonymizer run on a quote request blanks the linked survey's comment
  and sets `anonymizedAt`, while rating/status/timestamps remain; unit test - the new retention category
  resolves a correct due-date from `submittedAt` or `expiresAt`; typecheck; lint.

## End-to-end scenario coverage

- [ ] T018 Scenario tests covering spec.md's eleven user scenarios end-to-end, explicitly including
  scenario 5 (Starter `closed` produces a survey exactly like a Pro/Enterprise `gagne`, same delay, same
  worker) and scenario 4 (pre-amendment consent never surveyed, flag or no flag).
  **Validation**: all eleven scenarios pass as integration tests against the runtime HTTP layer where
  applicable (submission endpoint) and as service-level tests otherwise (trigger, worker, withdrawal,
  anonymization).

## Docs + final validation

- [ ] T019 Update `docs/prd_coverage_map.md`: move this feature from backlog to delivered, referencing
  the closed PRD section 23 gap ("message de satisfaction" / "demande d'avis").
- [ ] T020 Update `Current plan:` pointer in `AssurMatch/AGENTS.md` back to the next active spec once
  this one ships (not part of this task list's own completion - tracked here as a reminder for
  whoever closes this spec).
- [ ] T027 Full validation suite: `npm run typecheck`, `npm run lint`, `npm run test` (Vitest, whole
  suite - including every guard test listed above: RBAC isolation, consent-gate, flag-closed,
  forbidden-wording, link-security/enumeration), `npm run test:web` (Playwright source markers),
  `npx prisma validate`, `npm audit --audit-level=high`, `node scripts/ci/secret-scan.mjs`. Tick every
  task above only once its own stated criteria and this full run both pass.

## Not done (tracked here so nothing is silently assumed)

- No local Mailpit run of the survey-request e-mail until implementation exists - verify the two locales
  render correctly in an inbox, not only in unit tests, once T009/T010 land.
- No runtime Postgres smoke defined yet for the drain worker - add one mirroring spec 044's T007 pattern
  (asserts the worker sees the queued backlog; does not assert `sent` without a configured mailer) when
  T010 lands.
