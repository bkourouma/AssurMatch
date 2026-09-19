# AssurMatch PRD Coverage Map

Source: `docs/prd_plateforme_comparaison_assurances.md`
Updated: 2026-09-19

## Coverage Summary

| PRD capability | Matching specs | Current implementation status | Missing gaps | Impacted surfaces | Priority |
|---|---|---|---|---|---|
| Platform positioning, forbidden wording, indicative offers | 001, 002, 023, 025 | Implemented with constitution, content guardrails, public copy, admin/broker UX guardrails | Continue regression checks as new surfaces are added | Web Publique Client, Back-office, Backend API, shared packages | P0 |
| Country catalog, regulatory regimes, product catalog, feature flags | 001, 007, 008, 010, 013, 022 | Implemented/partial: Prisma model, admin/public APIs, cache, seeds, import tooling, public flag gating | Richer country legal copy workflow and activation readiness UI remain incremental | Backend API, Back-office Plateforme, database, runtime | P0 |
| Public country/product pages and comparator | 002, 008, 010, 021 | Implemented/partial: public app routes, offers, flag blockers, tests, local smoke | More product-specific dynamic forms and richer comparison criteria per product | Web Publique Client, Backend API, database | P0 |
| Quote request, consent, anti-spam, duplicate detection, confirmation | 002, 008, 010, 019, 021, 043, 044 | Implemented and verified end to end in a real browser on 2026-09-19: published quote form definitions (spec 043), submission with consent, anti-spam, duplicate detection, routing, lead visible in the broker CRM with the visitor's answers, and the confirmation email delivered (spec 044) | Document upload and richer public follow-up remain limited | Web Publique Client, Backend API, database, notifications | P0 |
| Responsible lead routing and license eligibility | 001, 002, 010, 022, 031, 042 | Implemented: routing decisions, blockers, partner/license eligibility, admin routing rules, and multi-broker fan-out gated by the flag plus the visitor's own consent | Multi-send ships closed: opening `multi_broker_routing_enabled` is an audited compliance action, and a consent granted for a single broker is never re-interpreted | Backend API, Back-office Plateforme, Web Publique Client, database | P0 |
| Starter broker portal without CRM | 003, 006, 008, 010, 012, 025 | Implemented/partial: broker app, auth session, Starter leads/detail/actions/dashboard, export policy, UX polish | Current dirty slice hardens Starter CRM landing/subroute behavior and protected fallback states | Broker Back-office, Backend API, shared packages | P0 |
| Pro/Enterprise broker CRM | 004, 006, 008, 010, 012, 025 | Implemented/partial: CRM APIs, pipeline/activity, notes/tasks/reminders/proposals, dashboard, export policy, UX polish | Advanced documents/quotes UX and deeper Enterprise team controls remain incremental | Broker Back-office, Backend API, database | P0 |
| Admin platform back-office | 001, 012, 014, 015, 023 | Implemented/partial: admin auth, users, catalog, partners, licenses, flags, quote review, dashboard, UX polish | Full billing admin, advanced reports and activation checklist workflow still missing | Back-office Plateforme, Backend API, database | P0 |
| Auth, RBAC, MFA, sessions, user lifecycle | 006, 014, 015, 019 | Implemented/partial: token/session flow, admin/broker middleware, MFA, password reset/change, email delivery | Production SSO and custom Enterprise roles are not in MVP | Backend API, Broker Back-office, Back-office Plateforme | P0 |
| Audit logs, consent evidence, compliance alerts | 001, 002, 012, 014, 023 | Implemented/partial: audit writer/repository/controllers, consent records/texts, dashboard alerts | Retention/anonymization operations and richer compliance work queues remain incremental | Backend API, Back-office Plateforme, database | P0 |
| Notifications email | 001, 002, 019, 044 | Implemented: auth emails, plus quote notification delivery (spec 044) - a bounded, idempotent worker draining queued visitor confirmations and broker lead notifications into the existing `EmailDeliveryService`, with a retry cap, a content guardrail and emails that carry a pointer rather than the lead | SMS/WhatsApp providers and user notification preferences remain missing/disabled; the worker's cadence is the operator's, like partner webhooks | Backend API, notifications, runtime | P1 |
| Redis, BullMQ, runtime hardening, local launcher | 007, 011, 020, 021 | Implemented/partial: Redis/cache/queues, runtime postgres smoke, Docker compose smoke, local launcher/browser smoke | Observability depth and production-grade queue dashboards remain future work | runtime / Docker / local launcher, Backend API | P0 |
| Preproduction launch readiness | 013, 022 | Implemented/partial: Dockerfiles, preprod compose, seed/import scripts, runbooks, CI/deploy scaffolding | Deployment requires explicit approval; remote inspection only without approval | runtime / Docker, Backend API, all apps | P1 |
| Billing B2B and lead billing | 012, 037 | Implemented: plan prices per country/plan, PRD billable-lead rule, monthly non-billable drafts, prepaid lead packs, dispute credits, broker consumption view (DASH-B-008), admin billing UI | Payment collection and invoice issuance stay deliberately out of scope until a separate payments spec | Backend API, Back-office Plateforme, Broker Back-office, database | P1 |
| AI visitor summary/assistant and broker/admin AI assistance | 001, 002, 034, 035, 036 | Implemented: central AI gateway (flags, quotas, PII minimization, guardrails, deterministic fallback, audit), visitor assistant/FAQ/summary, broker lead summary/score/next action/relaunch/classification/duplicates/loss analysis with human validation and partner opt-out, admin insights | Every AI flag stays disabled by default and can only be enabled through the audited compliance policy path | Backend API, Web Publique Client, Broker Back-office, Back-office Plateforme | P1 |
| Partner API, webhooks, external CRM integrations | 030, 039 | Implemented: API keys with scopes, webhook endpoints/allowlist/signing, delivery policy, and lead.assigned / lead.status_changed / notification.failed now wired into the real flows | External CRM connectors remain future work; delivery stays disabled by default | Backend API, shared packages, runtime | P2 |
| SMS/WhatsApp | 001, 038 | Implemented: provider port with a local default, dispatch gates (flag + provider + recipient opt-in), masked delivery records, in-app inbox and broker channel preferences | Real provider adapters are configuration work; both channels stay disabled by default | Backend API, notifications, Broker Back-office, runtime | P2 |
| Enterprise advanced features: multi-agency, custom roles, white label | 040, 041 | Implemented: tenant agencies and memberships, custom roles capped to the broker permission catalogue, SLA target and compliance (broker + admin), broker-portal branding, period comparison, advisor view and CSV exports | White label is deliberately limited to the broker back-office; the public comparator keeps presenting AssurMatch as the technical platform | Backend API, Back-office, Broker Back-office, shared packages, runtime | P2 |
| Regulated future modules: payments, e-signature, policy issuance, claims, insurer API | Constitution, guardrails | Intentionally disabled with guardrails | Requires explicit legal/product approval before any activation | multiple scopes | Blocked |

## Execution Backlog

The PRD backlog through spec 044 is implemented and validated. End-to-end testing on 2026-09-19 found two P0 blockers in the visitor journey (specs 043 and 044); both are now delivered. What remains is deliberately out of scope or operational:

0. Done - Spec 043 `043-quote-form-persistence` (implemented and validated 2026-09-19). Quote form definitions are persisted and administered over HTTP, the public form renders the published fields and submits them as answers, the answers travel to every lead assignment, and CORS finally allows the visitor's browser to submit. No migration was needed.
0b. Done - Spec 044 `044-quote-notification-delivery` (implemented and validated 2026-09-19). `npm run quote-notifications:deliver-due` drains the backlog; emails carry a pointer, never the lead. Operational procedure in `docs/runbooks/quote-notification-delivery.md`.
1. Blocked - Payments, e-signature, policy issuance, claims and insurer API stay disabled: each needs explicit legal and product approval before any spec is written.
2. Ops - Multi-broker routing is implemented (spec 042) but ships closed. Opening `multi_broker_routing_enabled` requires the audited compliance policy path, a published multi-recipient consent text, and - because it puts partners in competition on every lead - a review of the partner contracts and of the shared-lead price (`sharedLeadPriceMultiplier`, default 0.5, total capped at 2x the exclusive price).
3. Ops - Enabling any sensitive flag (AI, billing, SMS/WhatsApp, partner webhooks) requires the audited compliance policy path; no HTTP route can turn them on.
4. Ops - Configure real SMS/WhatsApp and AI providers per environment; the defaults are deterministic and make no outbound call.
5. P2 - External CRM connectors for Enterprise partners, on top of the existing partner API and webhooks.
6. P2 - Document extraction and manager assistant AI assists (PRD Enterprise-only rows) once the current AI surfaces have production feedback.

## Current Safe Slice

Target spec: `044-quote-notification-delivery` (completed)

Impacted surfaces:
- Backend API (notifications)
- runtime (delivery worker)
- docs / runbooks

Rationale:
- It closes the last hole in the visitor journey: the request now produces a written trace for the visitor and a notification for the broker, instead of two rows sitting at `queued` forever.
- No new flag, no new HTTP route: delivery is an operator-run worker, like partner webhooks, and the notification row is the state - so it is idempotent and restartable by construction.
- Emails carry a pointer, never the lead. Visitor contact details and consented answers stay behind the back-office's tenant check and audit, because email leaves every control the platform applies to that data.
- A disabled mailer deliberately leaves the backlog intact rather than consuming it.

Known limitation: a permanently failed partner notification is audited but does **not** reach the partner's webhook - `notification.failed` fires only when every channel failed, and WhatsApp ships disabled so its status never leaves `queued`. Widening that condition would change spec 039's semantics for every notification type and is a decision of its own.

Next safe slice: none pending. Everything that remains either needs legal approval (the five regulated modules), is a commercial decision before opening multi-broker routing, or is environment configuration (real AI and messaging providers).
