# Feature Specification: Public Site — Bilingual Shell, Brand System and Institutional Surface

**Feature Branch**: `045-public-site-bilingual-institutional`
**Created**: 2026-09-19
**Status**: Implemented and validated 2026-09-19
**Validation State**: Validated. See `tasks.md` for the per-task verification notes.
**Continuous Workflow Eligible**: Yes.

## Why this spec exists

The public site exists only as a funnel. A visitor can reach a country, a product, a list of
indicative offers, a comparison and a quote request. Everything a visitor needs in order to *trust*
that funnel is missing.

There is no legal notice, no privacy policy, no cookie page, no regulatory status page explaining how
AssurMatch is paid and how offers are ranked. There is no "how it works", no FAQ, no glossary, no
guide. There is no broker directory and no insurer directory, so the partner named on an offer card
cannot be verified anywhere. There is no way to become a partner: no plans page, no pricing, no
application form, not even a link to the broker portal. There is no contact form. A country open only
on a waiting list has nowhere to capture that demand. A wrong URL renders the framework's default 404.

The shell is equally thin: three navigation links, a footer with no links at all, no logo, no font,
no per-page title or description, no sitemap, no structured data, and a colour palette copied from
the admin back-office rather than from the brand. Every visible string is hard-coded French with the
accents stripped, so the site cannot be read in a second language at all.

This is what the site PRD (§5 to §11, SITE-101 to SITE-413, NFR-01 to NFR-14) specifies and what this
spec delivers, plus one requirement the PRD does not state: the site must be bilingual, French
default and English second, because the diaspora profile in §4 browses from abroad.

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Reinforced, not changed. The new institutional pages are where the
  platform states in full what it is and what it is not: it compares indicatively, it puts a visitor
  in touch with an authorised partner broker, and it does not sell insurance, does not issue a
  contract or a certificate, and does not collect a premium. The regulatory status page states how
  the platform is paid and how results are ranked.
- **Impacted application(s)**: Web Publique Client (major), Backend API (new public endpoints and two
  admin read endpoints), shared packages (contracts), database (migration 0017), runtime (env vars,
  health script), docs.
- **Affected scopes**: Countries, products, partners, offers, quote requests, billing plan prices,
  consent records.
- **Frontend separation**: Unchanged and tested. The public app gains links *to* the broker portal's
  login URL built from `NEXT_PUBLIC_ASSURMATCH_BROKER_URL`; it imports no back-office code, embeds no
  back-office screen and never depends on partner or admin authentication state. The literal strings
  for the broker and admin route prefixes stay absent from `apps/public/app`.
- **Required feature flags**: No new flag. The work reads existing ones: `public_comparator_enabled`,
  `quote_request_enabled`, `sponsored_offers_enabled` (global); `country_public_enabled`,
  `country_waitlist_enabled`, `country_comparison_enabled`, `country_quote_enabled`,
  `country_broker_onboarding_enabled` (country); `product_public_enabled` and siblings (product).
  A country's waiting page exists only when `country_waitlist_enabled` is true and
  `country_public_enabled` is false. Broker onboarding pages and the public plan prices are gated on
  `country_broker_onboarding_enabled`.
- **Consent and transmission**: Three new public forms collect personal data — waiting list, broker
  application, contact. Each has its own unchecked consent box, stores the consent version it
  displayed, and is rate limited with a honeypot. None of them transmits anything to a broker. The
  quote funnel's consent rules are untouched, and the tracking page gains the withdrawal action the
  PRD requires (SITE-317), which cancels the request, closes open assignments and notifies the
  partner in-app.
- **Partner license controls**: The public broker directory lists a partner only when the tenant is
  active, holds an active authorisation for that country, and has at least one licence for that
  country with status `valid` and an expiry date in the future. A broker application creates a
  `PartnerApplication`, never a tenant and never an authorisation; nothing about it grants access.
- **Audit and data history**: Every public submission, every directory read and every consent
  withdrawal writes an `AuditLog` row through the existing writer, with a hashed e-mail fingerprint
  and never a raw address. The three new models carry an explicit `retentionUntil`.
- **Security and RBAC**: The new public endpoints are unauthenticated, validated with zod, rate
  limited per IP and per session through a shared abuse guard, and reject a filled honeypot. They
  echo no personal data back. The two new admin read endpoints require the existing roles.
- **Routing impact**: None. No new endpoint influences broker selection.
- **AI impact**: None new. Existing visitor AI stays behind its flags and keeps its label.
- **UX/content restrictions**: All copy moves into message catalogues checked in CI. Forbidden
  wording is now matched diacritics-insensitively and in English as well as French, so writing the
  site in proper French with accents cannot smuggle a banned phrase past the guardrail. Every page
  rendering an amount carries the indicative-price mention in the same block. Sponsored offers keep
  the orange badge and never the green one.
- **Workflow continuity**: Not interrupted.

## Decisions

### D1 — Bilingual with next-intl, French unprefixed, English under `/en`

`next-intl` v4 with `localePrefix: "as-needed"` and automatic locale detection **off**. French URLs
stay exactly where search engines and the local tooling expect them, and English lives under `/en`.
Detection is off on purpose: the local health script and the launcher accept only a 200 on the root,
and the browser smoke test runs with an `en-US` Accept-Language header, so automatic redirection
would break both and would also override a French visitor's choice. The language toggle in the header
is the only way into English.

Public slugs are French for French and English for English, declared once in a `pathnames` map.
Folder names stay English so the map is the single source of truth for URLs.

The file is `apps/public/proxy.ts`: Next 16 renamed the middleware convention, and declaring both
names is a build error.

### D2 — Backend-provided French text is never machine-translated

Offer names, disclaimers, score labels, form field labels and consent texts come from the API in
French. On an English page they render inside a `lang="fr"` wrapper and the layout states that
partner-provided content is in French. Translating a consent text the visitor agrees to would put a
string on screen that differs from the one recorded in the `ConsentRecord`.

### D3 — Institutional content ships as versioned modules, not a CMS

SITE-401 asks for a CMS with a draft to compliance-review to publication cycle. No CMS exists, and
building one would delay every page that depends on it. Legal, institutional, guide, glossary and FAQ
content ships as typed content modules behind `getLegalPage(slug, country, locale)` and siblings.
The seam is the function signature: replacing the module with a content API call later changes one
file per content type and no page. The compliance review happens in code review, on a versioned file
with an `updatedAt`, which is weaker than a workflow but is not nothing. Recorded as a deliberate
deviation, not an oversight.

### D4 — A broker application is its own record, not a draft tenant

`PartnerApplication` with its own status enum (`received`, `under_review`, `accepted`, `rejected`).
Creating a `PartnerTenant` in `draft` from an unauthenticated form would put an unverified stranger
into the list partners are read from, would demand fields the applicant cannot supply, and would give
that stranger a tenant identifier. Acceptance converting an application into a tenant is an admin
action and a later spec; the column is reserved.

### D5 — Licence upload and outbound e-mail for the new forms are deferred

The application form collects the licence number, authority and expiry as declared data, and states
that the document will be requested. Uploading it means a second storage path with its own retention,
scanning and sharing rules, and the quote-document service is bound to a quote request and its
verification token. Sending an ops e-mail for a contact message or an application means a new
`NotificationType` enum value, a migration, a template and a branch in the delivery worker. Both are
follow-ups; the submissions are visible through the two admin read endpoints so nothing is lost.

### D6 — Country detection pre-selects, never redirects

SITE-102 and acceptance criterion 15.1. The visitor's country comes from a functional cookie first,
then from a CDN geo header, and is only ever used to pre-select the selector and announce the guess.
No redirect, and the choice is changeable from the header on every page.

## Requirements

### Shell, brand and internationalisation
- **FR-001** (SITE-413, NFR-09): Header carries the logo, the country selector, the comparison call
  to action at every viewport, a language toggle, and a full-screen mobile menu that needs no
  JavaScript framework. Footer carries navigation by country and by product, guides, the four legal
  pages, the regulatory status page, contact and the broker links.
- **FR-002** (PRD §9-11): Design tokens are the single source of colour, type, spacing, radius and
  shadow. Components hold no raw value. Green is never a page background nor a primary button; the
  sponsored badge is orange.
- **FR-003** (NFR-09): Every visitor-facing string lives in `messages/fr.json` or `messages/en.json`;
  the two key trees are identical and checked in CI.
- **FR-004** (NFR-08): Every page exports a unique title and description, a canonical URL and
  `hreflang` alternates; the sitemap is generated from the catalogue and the robots file excludes the
  funnel's private pages.

### Entry and catalogue
- **FR-010** (SITE-101): The home page presents a country and product selector with the comparison
  call to action above the fold on mobile and desktop.
- **FR-011** (SITE-102, SITE-103, D6): The detected country is pre-selected and announced, never
  imposed; the choice is stored in a functional cookie and changeable from the header everywhere.
- **FR-012** (SITE-105): The home page shows live counts of open countries, active brokers and
  validated offers, read from the catalogue, never typed by hand.
- **FR-013** (SITE-106): The home page and the country page carry the platform status notice in full.
- **FR-014** (SITE-107): The countries page splits countries into open, pilot and coming, from the
  catalogue's statuses and flags.
- **FR-015** (SITE-108): A country that is not public but has the waiting-list flag answers 200 with
  an e-mail and desired-product capture, and offers no quote path.
- **FR-016** (SITE-109): The country page lists the country's partner brokers with trade name, city
  when known, licence number and covered products.
- **FR-017** (SITE-114): An unknown or disabled route renders a branded 404 with suggestions.

### Content, institutional and brokers
- **FR-020** (SITE-405): The how-it-works page describes the three steps Comparez, Demandez,
  Souscrivez auprès du courtier, and names explicitly what AssurMatch does not do.
- **FR-021** (SITE-406): The regulatory status page explains remuneration, ranking rules and
  sponsored-offer treatment, and is linked from the footer, the home page, the results page and the
  confirmation page.
- **FR-022** (SITE-407, D3): Legal notice, privacy, cookies and terms exist globally and in a country
  variant that takes precedence when it exists.
- **FR-023** (SITE-401, SITE-402, D3): Guides, glossary and FAQ are served from versioned content
  modules; each content page embeds the entry selector of the product it belongs to.
- **FR-024** (SITE-404): The country broker and insurer directories list only active public partners
  and the insurers behind publicly visible offers, with an individual broker page.
- **FR-025** (SITE-408): The become-a-partner page presents the three plans, an anonymised lead
  example and an illustration of the portal.
- **FR-026** (SITE-409): The pricing page shows at least the Starter price for the selected country
  and the seven criteria that make a lead billable.
- **FR-027** (SITE-410, D4, D5): The application form collects company, country, licence number,
  expiry, authority, desired products, monthly capacity, contacts and desired plan, and creates a
  `PartnerApplication`.
- **FR-028** (SITE-411): The broker login page explains multi-factor authentication and links to the
  broker portal.
- **FR-029** (SITE-412): The contact form distinguishes visitor, broker, insurer and press from the
  first field.

### Funnel additions
- **FR-030** (SITE-316, SITE-317): The tracking page lets the visitor withdraw consent in one click
  with a confirmation; the request is cancelled, open assignments are closed, the partner is notified
  and the action is audited.

### Non-functional
- **FR-040** (NFR-01, NFR-02, NFR-04): Pages are server-rendered, content pages ship no client
  JavaScript, and the product page stays under the PRD's mobile budgets.
- **FR-041** (NFR-06): WCAG 2.1 AA — 44 px targets, visible focus, labels, errors tied to their
  field, a skip link, and a keyboard-operable mobile menu.
- **FR-042** (NFR-10, NFR-14): Public submissions are validated, rate limited, honeypot-protected and
  carry no personal data in a URL. CI fails on forbidden wording in either language and on a page
  that renders an amount without the indicative mention.

## User Scenarios & Testing

1. **Country pre-selected, never imposed** (15.1). Given a visitor whose geo header says Senegal,
   When the home page renders, Then Senegal is pre-selected and announced, no redirect occurred, and
   Côte d'Ivoire is reachable in two interactions.
2. **Closed country captures demand**. Given Senegal with the waiting-list flag true and the public
   flag false, When the visitor opens its country page, Then the page answers 200, offers no quote
   path, is marked `noindex`, and an e-mail submission is accepted once; a second identical
   submission is accepted without creating a duplicate.
3. **Broker directory tells the truth**. Given a partner whose only licence for the country expired
   yesterday, When the directory is read, Then that partner is absent from the list and its
   individual page answers 404.
4. **Application does not grant anything**. Given a broker application for a country whose onboarding
   flag is false, When it is submitted, Then it is refused with a 422 and no record is created. Given
   the flag true, Then a `PartnerApplication` exists at `received`, no `PartnerTenant` and no
   authorisation were created, and the response echoes no personal data.
5. **Consent withdrawn stops the lead** (SITE-317). Given a transmitted request opened with a valid
   tracking token, When the visitor withdraws consent and confirms, Then the consent record is
   `withdrawn`, the request is `cancelled`, open assignments are closed, the partner has an in-app
   notification, the action is audited, and repeating the call changes nothing further.
6. **English mirrors French**. Given the language toggle on any page, When English is chosen, Then
   the same page renders under its English URL with the same data, `lang="en"`, `hreflang`
   alternates on both, and partner-provided French text marked `lang="fr"`.
7. **Legal country variant wins**. Given a country with its own privacy text, When that country's
   privacy page is opened, Then the country version renders and states that it is the country
   version; a country without one falls back to the global text.
8. **Forbidden wording fails the build**. Given a banned phrase introduced in either message
   catalogue, in either language, with or without accents, When CI runs, Then the build fails naming
   the phrase and the file.
9. **Old URLs survive**. Given a link to a pre-migration URL, When it is opened, Then it redirects
   permanently to the French URL, query strings intact.

## Validation

`npm run typecheck`, `npm run lint`, `npm run test`, `npx prisma validate`, a real `next build` of
`apps/public` (the root build script is type-check only and would not exercise the proxy, the plugin,
the redirects, the fonts or the metadata), `npm run test:web`, then the local stack with the broker
demo seed: health script, browser smoke, and a manual pass over the journey, the three new forms,
both languages, the 404 and a mobile viewport.

## Explicit non-goals

A CMS with a review workflow (D3); licence file upload and outbound e-mail for the new forms (D5);
converting an accepted application into a tenant; the per-country WhatsApp number and contact block
(SITE-116); product and city pages (SITE-403); visitor-adjustable score weights (SITE-209); the
cookie consent banner and a real analytics backend (NFR-11, only a typed no-op tracker ships);
renaming the admin and broker middleware files to the Next 16 proxy convention.
