# AssurMatch PRD Coverage Map

Source: `docs/prd_plateforme_comparaison_assurances.md`
Updated: 2026-09-28

## Coverage Summary

| PRD capability | Matching specs | Current implementation status | Missing gaps | Impacted surfaces | Priority |
|---|---|---|---|---|---|
| Platform positioning, forbidden wording, indicative offers | 001, 002, 023, 025 | Implemented with constitution, content guardrails, public copy, admin/broker UX guardrails | Continue regression checks as new surfaces are added | Web Publique Client, Back-office, Backend API, shared packages | P0 |
| Country catalog, regulatory regimes, product catalog, feature flags | 001, 007, 008, 010, 013, 022 | Implemented/partial: Prisma model, admin/public APIs, cache, seeds, import tooling, public flag gating | Richer country legal copy workflow and activation readiness UI remain incremental | Backend API, Back-office Plateforme, database, runtime | P0 |
| Public country/product pages and comparator | 002, 008, 010, 021, 045 | Implemented and re-verified 2026-09-19 after the bilingual restructuring (spec 045): every page moved under `app/[locale]/`, French unprefixed (`/pays/...`) and English under `/en` (`i18n/routing.ts`), with legacy URLs 301-redirecting (`next.config.ts`); routes confirmed registered end to end (`GET /countries/directory`, `/countries/:code/products`, `/countries/:code/products/:key`, `/countries/:code/products/:key/offers`, `/offers/compare`) | More product-specific dynamic forms and richer comparison criteria per product | Web Publique Client, Backend API, database | P0 |
| Quote request, consent, anti-spam, duplicate detection, confirmation, consent withdrawal | 002, 008, 010, 019, 021, 043, 044, 045 | Implemented and verified end to end in a real browser on 2026-09-19: published quote form definitions (spec 043), submission with consent, anti-spam, duplicate detection, routing, lead visible in the broker CRM with the visitor's answers, the confirmation email delivered (spec 044), and consent withdrawal (spec 045: `ConsentWithdrawal` on the tracking page, `POST /quote-requests/:publicReference/consent-withdrawal`, registered in `runtime-http-wiring.module.ts`, migration `0017_public_site_forms`) | Document upload works but stays optional; richer public follow-up remains limited | Web Publique Client, Backend API, database, notifications | P0 |
| Broker acquisition (public marketing, pricing, application, login) | 045, 047 | Implemented: `/courtiers` landing (plan comparison, example lead, portal mock), `/courtiers/tarifs` (seven billable-lead criteria, live prices from `GET /partners/plans`), `/courtiers/candidature` (`POST /partners/applications`, honeypot, unticked consent, no file input by design), `/courtiers/connexion` (portal URL built from `NEXT_PUBLIC_ASSURMATCH_BROKER_URL`, never a hard-coded back-office route); both public routes confirmed registered in `runtime-http-wiring.module.ts` | An application is evidence of intent only: it never creates a `PartnerTenant` and a licence copy is requested by e-mail; the applicant now receives a bilingual acknowledgement carrying the `PA-` reference and stating that the message is neither an acceptance nor a refusal (spec 047), sent once and never retried | Web Publique Client, Backend API, database | P1 |
| Public institutional & content pages (how it works, regulatory status, legal, guides, FAQ, glossary, contact) | 045, 047 | Implemented: `/comment-ca-marche` states what AssurMatch does not do; `/statut-reglementaire` covers remuneration, ranking and sponsored offers under stable anchors (`#remuneration`, `#classement`, `#offres-sponsorisees`, `#prix-indicatif`); the four legal pages and their per-country overrides (`getLegalPage`, `content/legal/countries/CI.ts`) render through one content seam; guides/FAQ/glossary/contact live, `POST /contact` registered, and a contact message is acknowledged by e-mail with its `CM-` reference (spec 047) | The legal and institutional copy is static TypeScript, not an editable CMS; a country legal override exists only for CI today | Web Publique Client, Backend API | P2 |
| Responsible lead routing and license eligibility | 001, 002, 010, 022, 031, 042 | Implemented: routing decisions, blockers, partner/license eligibility, admin routing rules, and multi-broker fan-out gated by the flag plus the visitor's own consent | Multi-send ships closed: opening `multi_broker_routing_enabled` is an audited compliance action, and a consent granted for a single broker is never re-interpreted | Backend API, Back-office Plateforme, Web Publique Client, database | P0 |
| Starter broker portal without CRM | 003, 006, 008, 010, 012, 025 | Implemented/partial: broker app, auth session, Starter leads/detail/actions/dashboard, export policy, UX polish | Current dirty slice hardens Starter CRM landing/subroute behavior and protected fallback states | Broker Back-office, Backend API, shared packages | P0 |
| Pro/Enterprise broker CRM | 004, 006, 008, 010, 012, 025 | Implemented/partial: CRM APIs, pipeline/activity, notes/tasks/reminders/proposals, dashboard, export policy, UX polish | Advanced documents/quotes UX and deeper Enterprise team controls remain incremental | Broker Back-office, Backend API, database | P0 |
| Admin platform back-office | 001, 012, 014, 015, 023 | Implemented/partial: admin auth, users, catalog, partners, licenses, flags, quote review, dashboard, UX polish | Full billing admin, advanced reports and activation checklist workflow still missing | Back-office Plateforme, Backend API, database | P0 |
| Auth, RBAC, MFA, sessions, user lifecycle | 006, 014, 015, 019 | Implemented/partial: token/session flow, admin/broker middleware, MFA, password reset/change, email delivery | Production SSO and custom Enterprise roles are not in MVP | Backend API, Broker Back-office, Back-office Plateforme | P0 |
| Audit logs, consent evidence, compliance alerts, retention | 001, 002, 012, 014, 023, 046 | Implemented/partial: audit writer/repository/controllers, consent records/texts, dashboard alerts; retention policies per country and category, audited two-step anonymization batches and admin-side erasure on request (spec 046, `/compliance/retention`, purge gated by the protected `retention_purge_enabled` flag, off by default) | No public erasure form, no scheduled purge (manual by design); richer compliance work queues remain incremental; retention durations await legal validation per country | Backend API, Back-office Plateforme, database | P0 |
| Notifications email | 001, 002, 019, 044, 047 | Implemented: auth emails, quote notification delivery (spec 044) - a bounded, idempotent worker draining queued visitor confirmations and broker lead notifications into the existing `EmailDeliveryService`, with a retry cap, a content guardrail and emails that carry a pointer rather than the lead - and the three public-form confirmations (spec 047: waiting list, contact, broker application), bilingual FR/EN, sent straight through the audited delivery path with no `Notification` row and no migration | SMS/WhatsApp providers and user notification preferences remain missing/disabled; the quote worker's cadence is the operator's, like partner webhooks; a public-form confirmation is deliberately attempted once and never retried (spec 047 D2), so a failure is read in the `email.delivery.failed` audit rather than recovered | Backend API, notifications, runtime | P1 |
| Redis, BullMQ, runtime hardening, local launcher | 007, 011, 020, 021 | Implemented/partial: Redis/cache/queues, runtime postgres smoke, Docker compose smoke, local launcher/browser smoke | Observability depth and production-grade queue dashboards remain future work | runtime / Docker / local launcher, Backend API | P0 |
| Preproduction launch readiness | 013, 022 | Implemented/partial: Dockerfiles, preprod compose, seed/import scripts, runbooks, CI/deploy scaffolding | Deployment requires explicit approval; remote inspection only without approval | runtime / Docker, Backend API, all apps | P1 |
| Billing B2B and lead billing | 012, 037 | Implemented: plan prices per country/plan, PRD billable-lead rule, monthly non-billable drafts, prepaid lead packs, dispute credits, broker consumption view (DASH-B-008), admin billing UI | Payment collection and invoice issuance stay deliberately out of scope until a separate payments spec | Backend API, Back-office Plateforme, Broker Back-office, database | P1 |
| AI visitor summary/assistant and broker/admin AI assistance | 001, 002, 034, 035, 036 | Implemented: central AI gateway (flags, quotas, PII minimization, guardrails, deterministic fallback, audit), visitor assistant/FAQ/summary, broker lead summary/score/next action/relaunch/classification/duplicates/loss analysis with human validation and partner opt-out, admin insights | Every AI flag stays disabled by default and can only be enabled through the audited compliance policy path | Backend API, Web Publique Client, Broker Back-office, Back-office Plateforme | P1 |
| Partner API, webhooks, external CRM integrations | 030, 039 | Implemented: API keys with scopes, webhook endpoints/allowlist/signing, delivery policy, and lead.assigned / lead.status_changed / notification.failed now wired into the real flows | External CRM connectors remain future work; delivery stays disabled by default | Backend API, shared packages, runtime | P2 |
| SMS/WhatsApp | 001, 038 | Implemented: provider port with a local default, dispatch gates (flag + provider + recipient opt-in), masked delivery records, in-app inbox and broker channel preferences | Real provider adapters are configuration work; both channels stay disabled by default | Backend API, notifications, Broker Back-office, runtime | P2 |
| Enterprise advanced features: multi-agency, custom roles, white label | 040, 041 | Implemented: tenant agencies and memberships, custom roles capped to the broker permission catalogue, SLA target and compliance (broker + admin), broker-portal branding, period comparison, advisor view and CSV exports | White label is deliberately limited to the broker back-office; the public comparator keeps presenting AssurMatch as the technical platform | Backend API, Back-office, Broker Back-office, shared packages, runtime | P2 |
| Regulated future modules: payments, e-signature, policy issuance, claims, insurer API | Constitution, guardrails | Intentionally disabled with guardrails | Requires explicit legal/product approval before any activation | multiple scopes | Blocked |

## Execution Backlog

The PRD backlog through spec 047 is implemented and validated. End-to-end testing on 2026-09-19 found two P0 blockers in the visitor journey (specs 043 and 044); both are now delivered, the public site's bilingual/institutional rebuild (spec 045) followed the same day, and retention/anonymization (spec 046) closed the last P0 compliance gap on 2026-09-24. Spec 047 closed backlog item 7 on 2026-09-28: the three public forms spec 045 left silent now confirm their own submission. Every `tasks.md` under `specs/` is complete, no issue and no pull request is open. What remains is deliberately out of scope or operational:

0. Done - Spec 043 `043-quote-form-persistence` (implemented and validated 2026-09-19). Quote form definitions are persisted and administered over HTTP, the public form renders the published fields and submits them as answers, the answers travel to every lead assignment, and CORS finally allows the visitor's browser to submit. No migration was needed.
0b. Done - Spec 044 `044-quote-notification-delivery` (implemented and validated 2026-09-19). `npm run quote-notifications:deliver-due` drains the backlog; emails carry a pointer, never the lead. Operational procedure in `docs/runbooks/quote-notification-delivery.md`.
0c. Done - Spec 045 `045-public-site-bilingual-institutional` (implemented 2026-09-19; test suite repaired and re-verified against a live local stack the same day). French/English bilingual site under `app/[locale]/`, consent withdrawal, broker acquisition pages, and the institutional/legal/guides/FAQ/glossary/contact content, all against migration `0017_public_site_forms`. Deliberately out of scope: a content management system (the legal and institutional copy is static TypeScript, not editable without a deploy), licence upload on the broker application (a copy is requested by e-mail instead), and outbound e-mail for the new forms (waitlist, contact and partner application submit successfully but send no confirmation e-mail to the visitor or applicant).
0d. Done - Spec 046 `046-data-retention-anonymization` (implemented and validated 2026-09-24, merged through PR #12). Retention policies per country and data category, audited two-step anonymization batches, admin-side erasure on request, and the `/compliance/retention` back-office page, against migration `0018_data_retention`. Execution stays gated by the protected `retention_purge_enabled` flag, off by default. Deliberately out of scope: no public erasure form and no scheduled purge - a batch is always started by a compliance officer. The default durations still await legal validation per country.
1. Blocked - Payments, e-signature, policy issuance, claims and insurer API stay disabled: each needs explicit legal and product approval before any spec is written.
2. Ops - Multi-broker routing is implemented (spec 042) but ships closed. Opening `multi_broker_routing_enabled` requires the audited compliance policy path, a published multi-recipient consent text, and - because it puts partners in competition on every lead - a review of the partner contracts and of the shared-lead price (`sharedLeadPriceMultiplier`, default 0.5, total capped at 2x the exclusive price).
3. Ops - Enabling any sensitive flag (AI, billing, SMS/WhatsApp, partner webhooks) requires the audited compliance policy path; no HTTP route can turn them on.
4. Ops - Configure real SMS/WhatsApp and AI providers per environment; the defaults are deterministic and make no outbound call.
5. P2 - External CRM connectors for Enterprise partners, on top of the existing partner API and webhooks.
6. P2 - Document extraction and manager assistant AI assists (PRD Enterprise-only rows) once the current AI surfaces have production feedback.
7. Done - Spec 047 `047-public-form-confirmation-emails` (implemented and validated 2026-09-28). The waiting-list, contact and broker-application forms now confirm their own submission, in French or English depending on the page the submitter was reading (optional `locale` on the three create contracts, read from the `[locale]` layout and never from `Accept-Language`). Each message carries its public reference and never the submitted content (D1, the same reasoning spec 044 applied to broker lead e-mails), goes out through `RuntimeEmailDeliveryService` under its own `EmailPurpose` rather than through a `Notification` row - so no `NotificationType` value and no migration were needed (D2) - and is attempted once, best effort: a refused rendering, a dead SMTP host or a throwing port becomes an audited `email.delivery.failed`, never a failed submission (D3). Duplicates are confirmed exactly like first submissions, because staying silent would hand back the fact the identical response hides (D4). Deliberately out of scope: no retry or backlog, no stored locale, no unsubscribe token (the waiting-list message asks the submitter to reply), and no widening of the French-only shared forbidden-wording list - the English copy is covered by a guardrail test that spells out the equivalents.
8. Ops - Preproduction still runs the 2026-09-24 build. Deploying it is now blocked on the runner alone, no longer on CI. The queueing half was fixed on 2026-09-28 by PR #14: `deploy-preproduction` no longer runs on a plain push to `main`, so a merge stops waiting for GitHub's 24 h maximum and ending `cancelled` (before, run `36066431554`: `deploy-preproduction` cancelled after 24 h 07 while `verify`, `secret-scan` and `build-images` all passed; after, runs `36428092047` and `36430285640`: both green in about 8 min with the deploy job `skipped`). What remains is the runner itself: on 2026-09-28 `GET /repos/bkourouma/AssurMatch/actions/runners` returns `total_count: 0`, so `assurmatch-preprod` is not merely offline, it is no longer registered on the repository and has to be reinstalled on the VPS - a human operation. Once it is back, a deploy is opted into explicitly, either by running the workflow manually with `deploy_preproduction` ticked, or by setting the repository variable `PREPROD_AUTO_DEPLOY` to `true` while the runner stays up. The GHCR images keep being published on every merge to `main` under `sha-<commit>`, so a past commit can still be deployed once the runner returns; a deployment still requires explicit approval.

## Current Safe Slice

Target spec: `047-public-form-confirmation-emails` (completed 2026-09-28)

Impacted surfaces:
- Backend API (`notifications` templates and sender, `waitlist`, `contact-messages`, `partner-applications`)
- shared packages (`public-site.contracts.ts`, `partner-application.contracts.ts`: an optional `locale` on the three create schemas)
- Web Publique Client (the three form components send the page locale)
- No database change: no migration, no new column, nothing stored.

Rationale:
- Backlog item 7 was the last gap that needed neither legal approval nor a commercial decision: spec 045 accepted three submissions and answered only on screen.
- The audited `RuntimeEmailDeliveryService` path already existed and needed no `NotificationType` value, so closing the gap cost no migration (D2).
- Every rendered message carries its public reference and no submitted content, because an e-mail outlives the access controls and the retention policy applied to the row (D1).
- Delivery is best effort and cannot change a submission's outcome: a refused rendering, a dead SMTP host or a throwing port lands in the `email.delivery.*` audit, not on the visitor's screen (D3).

Known limitations carried forward:
- A permanently failed partner notification is audited but does **not** reach the partner's webhook - `notification.failed` fires only when every channel failed, and WhatsApp ships disabled so its status never leaves `queued`. Widening that condition would change spec 039's semantics for every notification type and is a decision of its own.
- The default retention durations are engineering placeholders until legal validates them per country.
- A public-form confirmation is attempted once and never retried (spec 047 D2).
- The shared forbidden-wording list is French-only. The English confirmation copy is covered by a guardrail test that spells out the equivalents, not by the shared list.
- The six rendered messages were verified by unit and guardrail tests, not observed in a Mailpit inbox: the local stack was not started for that change.

Next safe slice: none pending on the product backlog. Everything that remains either needs legal approval (the five regulated modules), is a commercial decision before opening multi-broker routing, or is environment/operational configuration (real AI and messaging providers, and the stalled preproduction deployment in backlog item 8).

## Verified Baseline

Full local validation run on 2026-09-28 from `main` at `06c4baa`, on Node 24, with a placeholder
`DATABASE_URL` and `NODE_ENV=test`, mirroring the CI `verify` job:

| Check | Command | Result |
|---|---|---|
| Prisma client | `npx prisma generate --schema backend/prisma/schema.prisma` | Generated (v7.8.0) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Unit/integration tests | `npm run test` | 252 files, 645 tests, all pass |
| Prisma schema | `npx prisma validate --schema backend/prisma/schema.prisma` | Valid |
| Audit | `npm audit --audit-level=high` | Pass (3 moderate, none high) |
| Secret scan | `node scripts/ci/secret-scan.mjs` | Pass |
| Web source markers | `npm run test:web` | 136 passed, 11 skipped (the skipped ones need a live stack) |

Two environment prerequisites, learned the hard way and not obvious from the scripts:

- `npm ci` must not run under `NODE_ENV=production`, or npm silently omits the dev dependencies and
  `npm run typecheck` then fails with hundreds of `Cannot find module 'vitest'` errors that have
  nothing to do with the code. Use `NODE_ENV=development npm ci --include=dev` on any host that
  exports `NODE_ENV=production`.
- `npm run test` inherits the ambient `NODE_ENV`. Under `production`, 398 tests fail on
  `memory repository is test-only` (`backend/src/modules/common/repositories/runtime-repository.ts`),
  which is the guard doing its job, not a regression. Run the suite with `NODE_ENV=test`.

Since that run `main` has advanced to `8ad2edb`, through PR #14 (CI workflow), PR #13 and PR #15
(this document). None touched application code, and the CI `verify` job passed on all three merge
commits, so the baseline above still describes `main`.

Spec 047 was validated on 2026-09-28 from branch `047-public-form-confirmation-emails`, on the same
Node 24 and `NODE_ENV=test` setup, with the same commands: typecheck pass, lint pass,
`npm run test` 255 files / 675 tests all pass (+3 files and +30 tests over the baseline, all added by
this spec), `npm run test:web` 137 passed / 11 skipped (+1 test, the form locale marker),
`npx prisma validate` valid,
`npm audit --audit-level=high` pass (3 moderate, none high), secret scan pass. `npx prisma validate`
needs `DATABASE_URL` set to reach the schema at all - `prisma.config.ts` resolves it before the
schema is read - so a placeholder value is enough and the failure it otherwise throws
(`PrismaConfigEnvError`) says nothing about the schema.
