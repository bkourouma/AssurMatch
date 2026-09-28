# Implementation Plan: Broker Satisfaction Feedback

**Spec**: `specs/048-broker-satisfaction-feedback/spec.md`
**Impacted surfaces**: Backend API (new `satisfaction-surveys` module; hooks into `leads`/broker-crm,
`broker-starter`, `notifications`, `consent`, `dashboards`, `feature-flags`, `compliance-alerts`),
database / Prisma / migrations, shared packages (contracts), Web Publique Client (one new page), Broker
Back-office (read-only dashboard addition), Back-office Plateforme (read-only dashboard + compliance
alerts addition).
**Blocked on**: maintainer approval of D1-D8 in `spec.md`, and the D2 verification step (does the
Starter accept/reject/close path already publish `lead.status_changed`?). Steps 2 and 6 below cannot be
finalised before that verification.

## Constitution Check

- **Article II (consent)**: satisfied by D5 - a new, explicitly historised purpose, granted forward-only,
  never reinterpreted retroactively. Re-checked before Phase 1 and again after, per governance rules.
- **Article III (progressive activation)**: satisfied by the new sensitive global flag
  (`satisfaction_survey_enabled`, default `false`) - see D8.
- **Article IV (security/RBAC)**: satisfied - no new cross-tenant surface; broker visibility inherits the
  existing `LeadAssignment` tenant scope; admin visibility follows the existing compliance-alerts role
  split.
- **Article VI (critical data/audit)**: satisfied - `createdAt`/`updatedAt` on the new model, a full
  `satisfaction_survey.*` audit trail, and an explicit retention category (FR-011) rather than an
  unscoped new personal-data table.
- **Article VII (routing)**: not applicable - no routing decision is touched.
- **Article IX (tests)**: RBAC isolation, consent-gate, flag-closed, forbidden-wording and link-security
  (D4) tests are mandatory before this is considered done - see "Risks" and tasks.md.

## Data model / Prisma

New enum:

```prisma
enum SatisfactionSurveyStatus {
  queued
  sent
  submitted
  skipped
  expired
}
```

New model:

```prisma
model SatisfactionSurveyRequest {
  id                String                    @id @default(cuid())
  publicReference   String                    @unique // "SF-" prefixed, minted fresh - never the quote's own reference
  tokenHash         String                    // bearer secret hash; bare token is emailed once, never stored
  leadAssignmentId  String                    @unique // one survey per assignment (spec FR-012)
  leadAssignment    LeadAssignment            @relation(fields: [leadAssignmentId], references: [id])
  quoteRequestId    String                    // denormalised for query/reporting convenience
  partnerTenantId   String                    // denormalised for RBAC-scoped reads, mirrors LeadAssignment
  consentRecordId   String                    // the service_quality_survey ConsentRecord checked at queue+send time
  triggerStatus     String                    // "gagne" | "perdu" | "closed" - the status that fired D1
  status            SatisfactionSurveyStatus  @default(queued)
  skippedReason     String?                   // audited alongside status = skipped
  dueAt             DateTime                  // triggeredAt + 24h (D3)
  sentAt            DateTime?
  expiresAt         DateTime?                 // sentAt + 30 days
  rating            Int?                      // 1-5, set only at submission
  comment           String?                   // <=1000 chars, HTML-escaped on render; anonymized by spec 046 D4 extension
  flaggedConcern    Boolean                   @default(false)
  submittedAt       DateTime?
  retentionUntil    DateTime                  // FR-011, satisfaction_feedback category
  anonymizedAt      DateTime?                 // set by the spec 046 D4 anonymizer extension
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt

  @@index([status, dueAt])
  @@index([partnerTenantId])
}
```

`ConsentPurpose` gains `service_quality_survey`. `ConsentRecord.intendedRecipient` for this purpose is
"AssurMatch" - distinct from `lead_transmission`, whose recipient is the assigned broker (Article II:
finality and intended recipient must be historised distinctly).

`EmailPurpose` (TS union in `email-delivery.service.ts`) gains `satisfaction_survey_requested`.

`DashboardAuditActions`-style new const object `SatisfactionAuditActions`:
`satisfaction_survey.queued`, `satisfaction_survey.sent`, `satisfaction_survey.skipped`,
`satisfaction_survey.link_invalid`, `satisfaction_survey.submitted`, `satisfaction_survey.concern_flagged`.

Migration: `NNNN_satisfaction_surveys` (next number after the latest applied migration at implementation
time - `0018_data_retention` is the latest confirmed by this research; verify before naming).

## Sequencing rationale

The consent purpose and the flag come before anything that can send, for the same reason spec 042 built
its consent gate first: if the trigger and worker shipped before the gate existed, a flag flip alone
would be enough to survey requests that never disclosed the possibility. The Starter-path verification
(D2) comes early too, because it determines whether step 3 touches one lead-lifecycle publisher or two.

1. **Consent + flag foundation.** `service_quality_survey` added to `ConsentPurpose`; consent text
   amendment (new version, additive sentence, no new checkbox per D5); `satisfaction_survey_enabled`
   registered in `GLOBAL_FEATURE_FLAG_DEFAULTS` (default `false`) and wired into the sensitive-flag
   policy alongside `multi_broker_routing_enabled`/`retention_purge_enabled`. `QuoteSubmissionService`
   grants both consent purposes together at submission.
2. **Verify the Starter event path (D2).** Confirm whether Starter's accept/reject/close controller
   already calls the `events.publish("lead.status_changed", ...)` observer used by
   `BrokerCrmPipelineService`. If not, add the same optional, non-blocking publish call on the `closed`
   transition, mirroring the existing shape exactly (no new observer interface).
3. **Trigger + model.** `SatisfactionSurveyRequest` Prisma model and migration; a
   `SatisfactionSurveyTriggerService` subscribing to `lead.status_changed`, filtering to D1's trigger set,
   re-checking flag + consent + country/product activity, and creating the `queued` row with `dueAt`.
   Unit tests: each excluded status (`doublon`, `hors_cible`, `injoignable`, `rejete_conteste`, Starter's
   declining `rejected`) creates nothing; a `gagne`/`perdu`/`closed` transition creates exactly one row;
   flag-closed and consent-missing both create nothing.
4. **Token + public authentication.** `publicReference` (`SF-` prefix) + opaque token, hash-only storage,
   mirroring `QuoteSubmissionService.authenticateVisitor`. Unit tests for the generic-error-on-mismatch
   behaviour from D4 (unknown reference, wrong token, expired link, already-submitted link all indistinguishable).
5. **Template + guardrail.** Survey-request e-mail template (FR/EN), `findForbiddenWording` over every
   rendering, following spec 044/047's template-before-sender ordering so a regulated phrase can never
   reach a live send path.
6. **Sender + worker.** `PublicFormNotificationPort`-shaped sender for `satisfaction_survey_requested`;
   drain worker re-checking eligibility at send time (D3) and marking ineligible rows `skipped` with an
   audited reason, following spec 044's `deliver-due` shape (own npm script, e.g.
   `satisfaction-surveys:deliver-due`).
7. **Public submission endpoint + page.** `GET`/`POST` on the reference+token pair; immutable submission
   (D8); one `broker_satisfaction_concern` compliance alert on a low rating or a flagged concern (D7,
   wired into the existing `compliance-alerts.service.ts`). Web Publique Client page at
   `/avis/:publicReference` (FR) and `/en/feedback/:publicReference` (EN).
8. **Consent-withdrawal interaction.** Extend the existing withdrawal handler so a still-`queued` survey
   for the same request is marked `skipped` (`consent_withdrawn`) at withdrawal time (FR-009).
9. **Dashboards.** `BrokerCrmDashboardSection`/`BrokerStarterDashboardSection` gain the broker's own
   aggregate satisfaction figures; the admin partner-performance view and the compliance alerts feed gain
   the corresponding read-only additions. RBAC/cross-tenant isolation tests mirror the existing dashboard
   test discipline.
10. **Retention integration (FR-011).** `satisfaction_feedback` added to `DEFAULT_RETENTION_POLICIES`
    (anchor: `submittedAt`, else `expiresAt`); spec 046's D4 broker-CRM-content anonymizer extended to
    blank a linked survey's `comment` and stamp `anonymizedAt`, keeping rating/status/timestamps as
    minimal proof.
11. **Validation.** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`,
    `npx prisma validate`, `npm audit --audit-level=high`, `node scripts/ci/secret-scan.mjs`; tick
    `tasks.md`; update `docs/prd_coverage_map.md`.

## Risks

- **Starter leads silently excluded (D1/D2).** If the Starter status-change path is not extended to
  publish the lifecycle event, Starter brokers - the plan with the least internal oversight - would be
  the ones never measured. Mitigated by making step 2 an explicit, checked prerequisite rather than an
  assumption, and by a scenario test asserting a Starter `closed` transition produces a survey exactly
  like a Pro `gagne`.
- **Retroactive survey on old consent (D5).** Mitigated the same way spec 042 mitigated it: the gate
  checks the accepted `ConsentRecord`'s purposes at both queue time and send time, never the flag alone;
  scenario 4 in spec.md covers it directly.
- **Reference/token enumeration (D4).** Mitigated by returning one generic outcome for unknown reference,
  wrong token, expired link and already-submitted link, and by rate-limiting the public endpoint the same
  way `consent_withdrawal` already is (`abuseGuard.assertAllowed`).
- **Free-text comment becoming an unbounded PII surface.** Mitigated by the 1000-character cap, mandatory
  HTML-escaping on every render surface (broker dashboard, admin drill-down), and inclusion in spec 046's
  retention/anonymization scope from day one (FR-011) rather than as a later gap like spec 045 left for
  spec 047 to close.
- **A failing survey send blocking a status change.** The whole reason D2 reuses the existing optional,
  non-blocking observer instead of a direct call inside `BrokerCrmPipelineService` or the Starter
  controller - a broker changing a lead's status must never see that action fail or slow down because of
  this feature.
- **Compliance-alert noise.** A blanket "any 1-2 rating" alert could flood the feed for a broker with
  genuinely low but stable satisfaction. Accepted for V1 as the simplest signal; if volume becomes a
  problem, a threshold/debounce is a small follow-up against the same alert type, not a redesign.
- **Flag opened without country-by-country readiness.** Mitigated by treating the flag as sensitive
  (D8): the audited compliance-policy path already requires a deliberate, documented decision, the same
  gate multi-broker routing and retention purges use, rather than a plain admin toggle.
