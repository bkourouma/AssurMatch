# AssurMatch PRD Coverage Map

Source: `docs/prd_plateforme_comparaison_assurances.md`
Updated: 2026-05-03

## Coverage Summary

| PRD capability | Matching specs | Current implementation status | Missing gaps | Impacted surfaces | Priority |
|---|---|---|---|---|---|
| Platform positioning, forbidden wording, indicative offers | 001, 002, 023, 025 | Implemented with constitution, content guardrails, public copy, admin/broker UX guardrails | Continue regression checks as new surfaces are added | Web Publique Client, Back-office, Backend API, shared packages | P0 |
| Country catalog, regulatory regimes, product catalog, feature flags | 001, 007, 008, 010, 013, 022 | Implemented/partial: Prisma model, admin/public APIs, cache, seeds, import tooling, public flag gating | Richer country legal copy workflow and activation readiness UI remain incremental | Backend API, Back-office Plateforme, database, runtime | P0 |
| Public country/product pages and comparator | 002, 008, 010, 021 | Implemented/partial: public app routes, offers, flag blockers, tests, local smoke | More product-specific dynamic forms and richer comparison criteria per product | Web Publique Client, Backend API, database | P0 |
| Quote request, consent, anti-spam, duplicate detection, confirmation | 002, 008, 010, 019, 021 | Implemented/partial: quote submission, ConsentRecord blockers, rate limit/anti-spam, duplicate detection, confirmation/status, email runtime | Document upload and richer public follow-up remain limited | Web Publique Client, Backend API, database, notifications | P0 |
| Responsible lead routing and license eligibility | 001, 002, 010, 022 | Implemented/partial: routing decisions, blockers, partner/license eligibility, audit tests, import tooling | More configurable routing admin UI, quotas/capacity tuning, multi-broker routing disabled by default | Backend API, Back-office Plateforme, database | P0 |
| Starter broker portal without CRM | 003, 006, 008, 010, 012, 025 | Implemented/partial: broker app, auth session, Starter leads/detail/actions/dashboard, export policy, UX polish | Current dirty slice hardens Starter CRM landing/subroute behavior and protected fallback states | Broker Back-office, Backend API, shared packages | P0 |
| Pro/Enterprise broker CRM | 004, 006, 008, 010, 012, 025 | Implemented/partial: CRM APIs, pipeline/activity, notes/tasks/reminders/proposals, dashboard, export policy, UX polish | Advanced documents/quotes UX and deeper Enterprise team controls remain incremental | Broker Back-office, Backend API, database | P0 |
| Admin platform back-office | 001, 012, 014, 015, 023 | Implemented/partial: admin auth, users, catalog, partners, licenses, flags, quote review, dashboard, UX polish | Full billing admin, advanced reports and activation checklist workflow still missing | Back-office Plateforme, Backend API, database | P0 |
| Auth, RBAC, MFA, sessions, user lifecycle | 006, 014, 015, 019 | Implemented/partial: token/session flow, admin/broker middleware, MFA, password reset/change, email delivery | Production SSO and custom Enterprise roles are not in MVP | Backend API, Broker Back-office, Back-office Plateforme | P0 |
| Audit logs, consent evidence, compliance alerts | 001, 002, 012, 014, 023 | Implemented/partial: audit writer/repository/controllers, consent records/texts, dashboard alerts | Retention/anonymization operations and richer compliance work queues remain incremental | Backend API, Back-office Plateforme, database | P0 |
| Notifications email | 001, 002, 019 | Implemented/partial: email config/templates/delivery, Mailpit/local runtime, auth/quote notifications | SMS/WhatsApp providers and user notification preferences remain missing/disabled | Backend API, notifications, runtime | P1 |
| Redis, BullMQ, runtime hardening, local launcher | 007, 011, 020, 021 | Implemented/partial: Redis/cache/queues, runtime postgres smoke, Docker compose smoke, local launcher/browser smoke | Observability depth and production-grade queue dashboards remain future work | runtime / Docker / local launcher, Backend API | P0 |
| Preproduction launch readiness | 013, 022 | Implemented/partial: Dockerfiles, preprod compose, seed/import scripts, runbooks, CI/deploy scaffolding | Deployment requires explicit approval; remote inspection only without approval | runtime / Docker, Backend API, all apps | P1 |
| Billing B2B and lead billing | 012, PRD only | Mostly missing: flags and RBAC references exist; no full billing domain or UI | BillingPlan, Invoice, quotas, lead billing disputes, finance workflows | Backend API, Back-office Plateforme, database | P1 |
| AI visitor summary/assistant and broker/admin AI assistance | 001, 002 | Partial: centralized quote summary service and disabled-AI guardrails exist | Broker lead summary, next action, follow-up message, admin insights, prompt audit, human validation workflows | Backend API, Web Publique Client, Broker Back-office, Back-office Plateforme | P1 |
| Partner API, webhooks, external CRM integrations | PRD only | Missing/disabled | API keys, partner webhooks, outbound integration jobs, audit and quotas | Backend API, shared packages, runtime | P2 |
| SMS/WhatsApp | 001, PRD only | Missing/disabled except config placeholder and flags | Provider abstraction, templates, consent/channel rules, delivery audit | Backend API, notifications, runtime | P2 |
| Enterprise advanced features: multi-agency, custom roles, white label | PRD only | Mostly missing | Enterprise tenancy model, custom roles, domain/brand isolation, consolidated reporting | Backend API, Back-office, shared packages, runtime | P2 |
| Regulated future modules: payments, e-signature, policy issuance, claims, insurer API | Constitution, guardrails | Intentionally disabled with guardrails | Requires explicit legal/product approval before any activation | multiple scopes | Blocked |

## Execution Backlog

1. P0 - Finish and validate current Broker Back-office hardening slice for spec 025: Starter CRM landing can show the Pro availability message, CRM subroutes stay blocked, and forbidden/error states do not render protected fallback data.
2. P0 - Strengthen broker CRM/Starter route tests around plan/MFA/flag combinations if any validation gap remains after the current slice.
3. P0 - Add a durable activation checklist surface for admin country/product launch readiness using existing flags, licenses, consent texts and offer status data.
4. P1 - Implement billing foundation spec: BillingPlan, lead billing event, invoice draft/read model, finance RBAC, audit and disabled-by-default UI.
5. P1 - Implement broker AI assistance spec with central AI module only: lead summary and next-action draft, disabled-by-default flags, PII minimization, audit, human validation.
6. P1 - Add SMS/WhatsApp notification provider abstraction and keep providers disabled unless configured.
7. P2 - Define partner API/webhook spec with API-key auth, scopes, rate limits, audit and no insurer/payment activation.
8. P2 - Define Enterprise tenancy/custom roles/white-label spec after billing and partner API are stable.

## Current Safe Slice

Target spec: `025-broker-backoffice-ux-polish`

Impacted surfaces:
- Broker Back-office
- Broker app tests

Rationale:
- It is already the active/current spec from `AGENTS.md`.
- It is explicitly approved and has no `[NEEDS CLARIFICATION]`.
- The working tree already contains a focused patch in this area.
- The slice improves constitutional acceptance criteria for Starter without touching Backend API, database, public app, admin app or regulated activation.
