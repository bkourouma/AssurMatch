# Product

<!-- impeccable:product-schema 1 -->

Scope: the two authenticated back-offices (`apps/admin`, `apps/broker`) and their shared design system
`packages/ui` (`@assurmatch/ui`). The public site keeps its own record in `apps/public/PRODUCT.md` and is
not covered here.

## Platform

web

## Users

- **Platform operators (admin back-office, port 3602).** AssurMatch staff signed in with a role:
  super admin, country admin, compliance, support, finance, content, AI admin. They work at a desk,
  on a laptop or large screen, for hours at a time. Jobs: follow the quote-request pipeline and its
  assignments, review compliance alerts and audit trails, administer the catalogue (countries,
  products, regimes, consent texts, quote forms), scoring and routing rules, onboard and suspend
  partner brokers, supervise billing and integrations, flip feature flags.
- **Partner brokers (broker back-office, port 3603).** Staff of an authorised broker firm (owner,
  managers, agents), on a Starter, Pro or Enterprise plan. They work between calls, often on a laptop
  and sometimes on a phone. Jobs: receive and work the leads routed to them, keep their offers and
  licences current, manage the team, follow the CRM pipeline (Pro and above), read invoices and
  notifications.

Role and plan decide what each person sees: screens and actions a role or plan cannot use stay hidden
or visibly disabled with the reason, never silently absent.

## Product Purpose

AssurMatch is a technical B2B2C platform that compares indicative insurance offers country by country
and routes a visitor's consented quote request to an authorised partner broker. The back-offices are
where that promise is operated: the admin keeps the catalogue, rules and compliance honest; the broker
space is where a lead becomes a conversation. Success is an operator who finds what needs attention in
seconds, acts without second-guessing what a button does, and can always see who did what and why.

## Positioning

The platform is not a broker, an insurer or an agent. Its back-offices therefore never present a
price, a guarantee or a contract as confirmed by AssurMatch, and never imply the platform carries the
professional responsibility. A broker is a partner, not a customer-facing seller of AssurMatch.

## Operating Context

- French UI (admin and broker), amounts in FCFA (`45 000 FCFA`), dates written `24 septembre 2026`.
- Two separate Next.js apps that share one design system. Routes, access policies and wording stay in
  each app; the shared package carries only look and generic components (constitution guard-rail).
- Admin navigation groups: Pilotage (dashboard, operations, compliance), Catalogue (catalogue, quote
  forms, scoring, routing), Partenaires (partners and applications, integrations, billing,
  messaging), Plateforme (users, feature flags, activation checklist, AI assistance).
- Broker navigation groups: Activité (dashboard, leads, offers), CRM (pipeline, table, Kanban; Pro
  plan), Organisation (company, licences, team, enterprise), Compte (notifications, billing, account).
- Authentication screens (login, MFA, activation, password) render outside the app shell.
- Local development shows an `Environnement local` badge and demo-account login; production shows
  neither.
- Suspended partners see a persistent banner; compliance alerts and licence expiry (< 30 days) are
  first-class dashboard signals.

## Capabilities and Constraints

- Constitution (`.specify/memory/constitution.md`) is authoritative. Notably: Starter brokers never see
  CRM, Kanban, advanced pipeline, tasks, reminders or team assignment presented as available;
  sponsorship is labelled and never changes ranking; AI appears only as a transparency label where a
  model is really called.
- Public visitor journeys and authenticated partner/admin journeys stay separated applicatively. The
  two back-offices are never merged and must stay visually distinguishable at a glance (admin must
  never be mistaken for the broker space and the reverse).
- Existing shared components live in `packages/ui/backoffice` (shell, data table, filter bar, forms,
  notices, KPI card, tabs, confirm dialog, skeleton, badges); every class is `bo-` prefixed and
  styled from `packages/ui/styles/backoffice.css` and `tokens.css`. The public `am-` design system is
  separate and not shared.
- Status vocabulary carries meaning and must keep it across the redesign: green = validated or
  confirmed, orange = sponsored or caution, red = error or blocked, neutral = informational.
- Next.js version has breaking changes; read `node_modules/next/dist/docs/` before touching framework
  APIs.

## Brand Commitments

- Name: AssurMatch. Logo: umbrella over a shield with people, in blue and green
  (`public/logo-assurmatch*.png`).
- The product owner asked (2026-10-08) for a **total break from the public site's visual world**
  (« Le patron »: indigo cloth, pattern sheet, yellow tape). The back-offices must not borrow its
  indigo/yellow identity, its cut-paper devices or its display face.
- One shared system for both back-offices, with a distinguishing accent per app.
- Direction (product owner, 2026-10-08, second round): the first build, the category standard played
  straight, was rejected as too sober and banal (colours, layout and typography all disliked). The owner
  chose the radical dealt direction « Raie d'émission »: a dark charcoal working plate, bone text, one
  grotesque, colour only as emission lines whose form (solid, dashed, half-height, struck, doubled)
  carries the state. The standard SaaS look is no longer the target.
- Anti-references named by the owner for the public site and held here too: `D:\APP\MedicProWeb`
  (themed costume site). Back-offices must read as tools, not as a concept piece.

## Evidence on Hand

- Local demo data: seeded leads, partners, offers, compliance alerts; admin demo accounts per role
  (`apps/admin/app/lib/dev-demo-accounts.ts`) and broker demo accounts per plan.
- The current look (navy sidebar, white cards, blue primary) is incumbent evidence, not authority.
- Absent and not to be fabricated: customer logos, testimonials, performance benchmarks, SLA figures.

## Product Principles

1. The next thing to do is visible: dashboards lead with what needs attention, not with decoration.
2. A status is never colour alone: every state carries a label, and the same state looks the same in
   both apps.
3. Dense but calm: operators read tables all day; scanability and consistent controls outrank
   expression.
4. Say what an action does and to whom: destructive, transmitting or billing actions name their effect
   and ask for confirmation.
5. Admin and broker are different rooms in the same building: recognisably one product, never
   confusable.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for every text/background pair; nothing below 14px.
- Full keyboard operation of navigation, tables, dialogs and forms; visible focus.
- Reduced-motion preference disables all animation.
- Works at 1024px laptop width without horizontal page scroll; broker space usable at phone width.
