# Feature Specification: Broker Satisfaction Feedback

**Feature Branch**: `048-broker-satisfaction-feedback`
**Created**: 2026-09-28
**Status**: Validated and Approved by maintainer on 2026-09-28. Decisions D1-D8 formally approved.
**Validation State**: Fully Validated. Approved by maintainer under explicit roadmap mandate.
**Continuous Workflow Eligible**: Yes. Full implementation authorised and completed.

## Why this spec exists

AssurMatch's PRD already names the gap: section 23 ("Notifications") lists "message de satisfaction" and
"demande d'avis" among the planned visitor notifications, and section 3 ("Objectifs business") states
the platform's first goal is "générer des demandes qualifiées" and its retention lever is service
quality. Today, once a lead leaves the CRM pipeline - won, lost, or closed - AssurMatch never asks the
one person who actually experienced the broker's service what that experience was like.

The consequence is a blind spot that costs the business on two sides:

- **Broker quality is invisible until a dispute happens.** The admin dashboard already tracks "taux de
  contestation" and SLA response time (PRD section 21), but both are proxies. A broker who responds fast
  and still handles a visitor badly leaves no trace until the visitor complains loudly enough to dispute
  a bill - which is the most expensive and latest possible signal.
- **The platform has no first-party trust signal to improve retention or to justify commercial decisions**
  (renewing a partner, moving a broker between plans, prioritising a broker in routing) other than
  response speed and lead volume, both of which a broker can game without ever satisfying a visitor.

A one-question-plus-comment satisfaction request, sent once a lead genuinely concludes, closes that gap
without turning AssurMatch into anything other than the technical platform it already is: the request
comes from AssurMatch, about the platform experience and the broker's handling of the request, never
about the insurance product, the price or a recommendation.

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Unchanged. The survey asks about service quality (responsiveness,
  clarity, professionalism), never about the offer, the price or whether the visitor should have bought
  anything. No wording implies AssurMatch rates or certifies insurance products.
- **Impacted application(s)**: Backend API (new `satisfaction-surveys` module; small hooks in
  `leads`/broker-crm, `broker-starter`, `notifications`, `consent`, `dashboards`, `feature-flags`,
  `compliance-alerts`), database (new migration), shared packages (contracts, RBAC read scopes),
  Web Publique Client (one new, unauthenticated two-field page), Broker Back-office (read-only addition
  to the existing dashboard), Back-office Plateforme (read-only addition to the existing admin dashboard
  and compliance alerts feed). No new back-office module, no new CRUD screen.
- **Affected scopes**: Every country/product where a lead can reach a terminal broker status. No
  product-specific behaviour proposed for V1 (see explicit non-goals).
- **Frontend separation**: Unchanged. The new public page requires no session and exposes only the
  rating form; it carries no back-office link, no broker identity beyond the courtesy line already used
  elsewhere ("Cette demande concerne le suivi effectué par votre courtier partenaire").
- **Required feature flags**: New global `satisfaction_survey_enabled` (default `false`). Per D8, it is
  treated as a **sensitive** flag - opened only through the audited compliance-policy path already used
  for `multi_broker_routing_enabled` and `retention_purge_enabled` - because opening it starts a new,
  automated, consent-scoped communication to visitors across every active country at once.
- **Consent and transmission**: This is the second load-bearing decision, after D2. See **D5**. A
  survey is never sent for a request whose accepted `ConsentRecord` does not carry the new
  `service_quality_survey` purpose. Historical consents are never reinterpreted (same discipline as spec
  042's D-consent-gate). Withdrawing the request's consent (the existing consent-withdrawal endpoint)
  cancels any queued, not-yet-sent survey for that request.
- **Partner license controls**: Not touched. The survey does not affect eligibility, licensing or
  routing; it is purely a post-hoc feedback loop on a lead already legitimately assigned.
- **Audit and data history**: Every lifecycle transition (queued, sent, skipped with reason, submitted,
  link invalid, concern flagged) is audited under a new dot-namespaced `satisfaction_survey.*` family,
  following the convention already used by `QuoteAuditActions` and `DashboardAuditActions`.
- **Security and RBAC**: A broker sees satisfaction data **only for its own leads** - inherited from the
  existing `LeadAssignment` tenant scoping, no new cross-tenant surface. Compliance/support/super admins
  see the aggregate and can drill into a flagged individual response, following the same role split
  already used for compliance alerts. No new permission scope beyond an existing dashboard read policy
  extension.
- **Routing impact**: None. The survey never influences routing, quota or eligibility. Constitution
  Article VII already requires routing to be decided before and independently of this feature.
- **AI impact**: None. No content is generated by a model. Comments are free text typed by the visitor.
- **UX/content restrictions**: The request and confirmation copy pass the existing forbidden-wording
  guardrail (`findForbiddenWording`) in both locales, exactly like specs 044/047. The visitor is told
  plainly that the message is optional, that it concerns the broker's handling of their request, and
  that AssurMatch remains the technical platform - never the insurer or the broker.
- **Data minimisation**: The comment field is the one piece of free text a visitor can write here; it is
  capped, HTML-escaped wherever rendered, and brought into the retention/anonymization scope defined by
  spec 046 (see plan.md task on extending `DEFAULT_RETENTION_POLICIES` and the spec 046 D4 anonymizer).
  Nothing beyond the rating, an optional concern flag and the optional comment is collected - no new
  visitor identity field, no additional contact channel.
- **Workflow continuity**: Interrupted by design until the maintainer confirms D1-D8, per the status
  banner above.

## Decisions

### D1 - What "the broker has finished handling this lead" means

The CRM pipeline (`BrokerCrmPipelineStatus`, Pro/Enterprise) and the Starter portal's simplified status
model are two different state machines on the same `LeadAssignment`. A survey trigger that only
understood one of them would silently exclude every Starter broker - the plan most in need of an
independent quality signal, since Starter deliberately ships without a CRM or a manager to catch a bad
handling from the inside.

**Trigger set**:

- Pro/Enterprise: `LeadAssignment.crmStatus` transitions to `gagne` or `perdu`.
- Starter: `LeadAssignment.status` transitions to `closed` (the status Starter's own accept-or-reject
  actions and the "traité" state reach once the broker is done - see PRD section 18).

**Explicitly excluded**, on either plan: `doublon`, `hors_cible`, `injoignable`, `rejete_conteste`
(Pro/Enterprise), and Starter's own `rejected` when it means the broker declined the lead outright.
None of these represent a completed broker-visitor interaction; asking "how was your experience with
the broker" after a lead the broker never actually engaged with would confuse the visitor and pollute
the score with noise that says nothing about service quality.

### D2 - Reuse the existing lead-lifecycle event, do not add a new coupling

`BrokerCrmPipelineService` already exposes an optional, non-blocking `events.publish("lead.status_changed",
partnerTenantId, data)` observer, built for spec 039's webhook wiring. This spec subscribes to the same
event rather than hard-wiring a call inside the CRM service, for the same reason spec 039 kept it
optional: a satisfaction-survey failure must never block or slow down a status change the broker is
actively performing.

**Verification required at implementation time** (flagged here rather than assumed): confirm whether
the Starter accept/reject/close actions publish through this same observer today. If they do not, they
must be extended to publish `lead.status_changed` on the `closed` transition before this feature can
observe Starter leads - this is a prerequisite task, not an assumption baked into the trigger design.

### D3 - A fixed delay, not an admin-configurable one

The survey is queued the moment the triggering transition fires, with `dueAt = triggeredAt + 24h`, and a
drain worker (same shape as spec 044's `quote-notifications:deliver-due`) sends what is due on operator
cadence. Twenty-four hours gives the closure time to feel real instead of arriving mid-conversation, and
a fixed platform-wide constant avoids building a per-country/per-product configuration screen for a
single duration nobody has asked to tune yet. If a real need to vary it appears, it is a small follow-up,
not a redesign - the constant lives in one place.

At drain time, eligibility is re-checked, not assumed at queue time: the flag must still be open, the
country/product must still be active, the request must not have been anonymized (spec 046) or had its
consent withdrawn, and no survey may already have been sent for that assignment. A newly-ineligible row
is marked `skipped` with its reason and audited - exactly the degrade-and-audit discipline spec 042 uses
for its own consent gate.

### D4 - Access by reference and a dedicated one-time token, never by login

The visitor has no account. Access to the survey page follows the same authentication shape the
consent-withdrawal tracking page already established: a display-friendly `publicReference` (prefixed
`SF-`, distinct from the quote's own `QR-`-style reference, minted fresh for this row) paired with a
separate, high-entropy `token` whose bare value is emailed once and never stored - only its hash is.
Both are required together; a wrong token or an unknown reference return the same generic "unavailable"
outcome, so the endpoint cannot be used to enumerate references. The link expires 30 days after
`sentAt`; an expired or already-submitted link shows a neutral message, never an error that reveals
which state it was in.

### D5 - A new consent purpose, granted alongside transmission consent, no new checkbox

Constitution Article II requires every finality to be historised. Sending a satisfaction request is not
the same finality as transmitting the request to a broker (`lead_transmission`): the recipient of the
communication is AssurMatch itself, not the broker, and the visitor did not necessarily expect it when
they ticked the transmission box.

**Decision**: add `service_quality_survey` to `ConsentPurpose`. It is granted automatically, as a second
`ConsentRecord` row, at the same moment `lead_transmission` is granted at quote submission - **not** a
second checkbox. The public consent text gains one added sentence disclosing that, once a courtier has
finished handling the request, AssurMatch may ask by e-mail how it went, and that this is optional and
can be declined by not answering. This mirrors spec 042's discipline exactly: a request consented under
today's (unamended) text is never surveyed, because its accepted text carries no such disclosure -
there is no retroactive reinterpretation, only a forward-looking amendment that takes effect once the
new consent text version is published. Withdrawing the request's consent withdraws both purposes at
once; a survey already sent is not recalled, but a still-queued one is skipped (D3).

### D6 - The question: one mandatory rating, one optional comment, one optional concern flag

- A 1-to-5 satisfaction rating (mandatory): "Comment s'est passée votre expérience avec ce courtier ?"
- A free-text comment (optional, capped at 1000 characters, HTML-escaped wherever rendered).
- An optional checkbox: "Signaler un problème avec ce courtier" - independent of the numeric rating,
  because a visitor can rate 3/5 and still want to flag something specific (or rate 5/5 as a courtesy and
  still mention friction). A checked flag raises a new compliance alert (see D7), regardless of the score.

No question asks about the product, the price, or whether the visitor would recommend AssurMatch
compare offers again with a NPS-style framing - all of that is a different measurement with a different
owner and a different spec, kept out of scope on purpose (see non-goals).

### D7 - A flagged concern reaches the existing compliance alerts feed, not a new inbox

`compliance-alerts.service.ts` already powers the admin dashboard's "alertes conformité" section
(licence expirante, offre expirée, pic de leads non routés). A flagged concern, or any rating of 1 or 2,
adds a `broker_satisfaction_concern` alert carrying the partner tenant, the public reference and the
rating - never the free-text comment inline in the alert list, which stays a drill-down. This gives
compliance and support the same one screen they already use, instead of a competing notification
surface, and matches PRD section 21's own framing of a synthesis-style admin view.

### D8 - Single immutable submission, feature flag treated as sensitive

A submission is final: resubmitting with the same link after a successful submission returns the
already-recorded confirmation and stores nothing new (a visitor who wants to add something is invited to
reply to the confirmation, the same non-goal spec 047 accepted for the waiting-list withdrawal). The
feature flag is sensitive by design (see "Required feature flags" above): unlike a same-request
transactional confirmation (spec 047), this is a new standing communication channel to every visitor
whose lead concludes, across every active country, and its content can evolve - it deserves the same
audited, deliberate activation as multi-broker routing and retention purges, not an on-by-default
rollout.

## Requirements

- **FR-001** A `SatisfactionSurveyRequest` is created, `status = queued`, when a `LeadAssignment` reaches
  a trigger state from D1, but only when `satisfaction_survey_enabled` is open, the request's accepted
  consent carries `service_quality_survey` (D5), and the country/product are active.
- **FR-002** A drain worker sends every row with `status = queued` and `dueAt <= now`, re-checking
  eligibility (D3) and marking ineligible rows `skipped` with an audited reason instead of sending.
- **FR-003** The survey e-mail states the broker's name is not needed to answer (the link already
  identifies the lead), what the message is for, that it is optional, and links to
  `/avis/:publicReference?token=...` (FR) / `/en/feedback/:publicReference?token=...` (EN), matching the
  locale recorded on the original quote request.
- **FR-004** The public survey page requires no login; it authenticates by reference + token (D4) and
  renders the same neutral "unavailable" outcome for an unknown reference, a wrong token, an expired
  link and an already-submitted link, so none of the four are distinguishable from outside.
- **FR-005** A submission stores the rating (1-5, required), the optional comment (<=1000 chars,
  escaped) and the optional concern flag, sets `status = submitted` and `submittedAt`, and is immutable
  afterward (D8).
- **FR-006** A rating of 1-2, or a checked concern flag, raises one `broker_satisfaction_concern`
  compliance alert per submission (D7).
- **FR-007** A broker sees its own aggregate satisfaction score (average rating, response count, flagged
  count) and its own individual submitted responses on the existing broker dashboard, scoped exactly
  like every other lead-derived figure - never another partner's data.
- **FR-008** The admin dashboard's partner-performance view gains a per-partner satisfaction score
  alongside the existing SLA and dispute-rate figures; the compliance alerts feed gains the new alert
  type from FR-006.
- **FR-009** Withdrawing the request's consent (existing endpoint) cancels a still-`queued` survey for
  that request (`status = skipped`, reason `consent_withdrawn`) and prevents a new one from being queued
  for the same assignment.
- **FR-010** Every rendered e-mail and page copy, in both locales, passes `findForbiddenWording`.
- **FR-011** The comment field is brought into spec 046's retention scope: a new `satisfaction_feedback`
  category is added to `DEFAULT_RETENTION_POLICIES`, and spec 046's D4 anonymizer is extended so that
  anonymizing a quote request's broker CRM content also blanks any linked survey's comment (rating,
  timestamps and status are kept, per spec 046 D5's "minimal proof" logic - they are not identifying).
- **FR-012** At most one `SatisfactionSurveyRequest` per `LeadAssignment` (unique constraint); a
  multi-broker request (spec 042, ships closed) can therefore produce one survey per broker who
  independently reaches a trigger state - no consolidation into a single visitor-facing message (see
  non-goals).

## User Scenarios & Testing

1. **Given** a Pro broker moves a lead's CRM status to `gagne`, **and** the request's consent carries
   `service_quality_survey`, **and** the flag is open, **When** 24 hours pass, **Then** exactly one
   survey e-mail is sent, in the request's locale, and the audit trail shows `satisfaction_survey.queued`
   then `satisfaction_survey.sent`.
2. **Given** the same transition, **but** the flag is closed, **Then** no row is ever created, and
   nothing changes if the flag opens later (the transition already happened - no retroactive survey).
3. **Given** a queued survey, **When** the visitor withdraws consent before `dueAt`, **Then** the row is
   marked `skipped` with reason `consent_withdrawn` and no e-mail is sent.
4. **Given** a request consented under the pre-amendment text (no `service_quality_survey` purpose),
   **When** its lead reaches `gagne`, **Then** no survey is ever queued for it, flag or no flag.
5. **Given** a Starter broker marks a lead `closed`, **Then** a survey is queued and sent exactly like a
   Pro/Enterprise `gagne`/`perdu` lead, on the same delay and through the same worker.
6. **Given** a lead reaches `doublon` or `hors_cible`, **Then** no survey is ever queued.
7. **Given** a visitor opens the link twice, **When** they submit a rating the first time and revisit the
   same link, **Then** the second visit shows the existing confirmation and stores nothing new.
8. **Given** an expired link, a wrong token and an unknown reference, **Then** the page renders the same
   neutral outcome for all three, and none is distinguishable from the others.
9. **Given** a visitor rates 2/5 with no concern flag, **Then** exactly one `broker_satisfaction_concern`
   compliance alert appears in the admin feed, carrying the reference and the rating but not the comment
   inline.
10. **Given** a broker viewing its dashboard, **Then** it sees only its own satisfaction figures and
    individual responses, never another partner's - covered by the same cross-tenant isolation test
    discipline as every other lead-derived dashboard figure.
11. **Given** a quote request anonymized by spec 046, **Then** its linked survey's comment is blanked in
    the same batch, while its rating and status remain for aggregate reporting.

## Validation

`npm run typecheck`, `npm run lint`, `npm run test` (Vitest, whole suite), `npm run test:web`
(Playwright source markers), `npx prisma validate`, `node scripts/ci/secret-scan.mjs`,
`npm audit --audit-level=high`.

## Explicit non-goals

- **No public display of ratings or comments.** No storefront review page, no broker badge, no
  aggregate score shown to visitors. Constitution Article VIII (no ranking that implies an official
  recommendation) and the reputational/moderation questions a public review surface would raise put
  that firmly in a future, separately-scoped feature.
- **No NPS-style "would you recommend AssurMatch" question.** This spec measures the broker's handling
  of one request, not the platform's brand; conflating the two would blur what a low score means and who
  owns fixing it.
- **No broker opt-out of being surveyed.** Service-quality measurement is already an operational signal
  the platform tracks without partner opt-out (SLA, dispute rate); this is one more, and no new privacy
  exposure is created among brokers - each still sees only its own data.
- **No admin-configurable survey delay, question set or scale in V1.** The 24-hour delay (D3) and the
  question (D6) are fixed constants; making them configurable is a follow-up if a real need appears.
- **No consolidation of multiple brokers' surveys into one visitor-facing message** for a multi-broker
  (spec 042) request - out of scope while that flag ships closed (FR-012).
- **No AI involvement** - no AI-generated summary of comments, no AI-driven follow-up, no sentiment
  scoring. A later spec can propose that against the existing `ai` module's guardrails if the raw
  feedback volume ever justifies it.
- **No edit-after-submission.** A visitor who wants to add something is invited, in the confirmation, to
  reply to the e-mail; the platform does not correlate an inbound reply automatically.
- **No SMS/WhatsApp channel for the survey in V1** - e-mail only, following the same channel restraint
  spec 047 used for the other public-form confirmations.
