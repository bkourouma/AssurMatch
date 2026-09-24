# Tasks: Public Site — Bilingual Shell, Brand System and Institutional Surface

**Impacted surfaces**: Web Publique Client, Backend API, shared packages, database (migration 0017),
runtime (env, health script, seed), docs.
**Status**: implemented; validated 2026-09-19 (see T043/T046 notes below — this pass verified the
items below by reading the actual source, schema and test files, not by trusting an earlier status).

## Foundations

- [x] T001 Shared contracts for every new public payload (waiting list, contact, broker application,
  country directory, public stats, public partner, insurer, public plan price, consent withdrawal),
  each public submission carrying the honeypot and session fields and an unchecked-consent literal.
  Verified: `packages/shared/contracts/public-site.contracts.ts` (`website`/`sessionId` honeypot pair,
  `consent: z.literal(true)`) and `partner-application.contracts.ts` (same consent literal).
- [x] T002 Prisma models `WaitlistEntry`, `PartnerApplication`, `ContactMessage`, the four enums, the
  optional `city` on the partner tenant, and migration 0017. Verified: `backend/prisma/schema.prisma`
  (`WaitlistEntryStatus`, `PartnerApplicationStatus`, `ContactAudience`, `ContactMessageStatus`,
  `PartnerTenant.city String?`) and `backend/prisma/migrations/0017_public_site_forms`.
- [x] T003 Shared public abuse guard: empty-honeypot assertion, per-IP window limit, per-session burst
  limit, with messages that map to 400 and 429 through the existing response filter. Verified:
  `backend/src/modules/common/abuse/public-abuse-guard.service.ts`, used by the waitlist, contact,
  partner-application and quote-request modules.
- [x] T004 Audit action names for the new public surfaces, kept out of the quote action list.
  Verified: `backend/src/modules/audit-logs/public-site-audit-actions.ts`.
- [x] T005 Front-end internationalisation scaffold: routing with the full French and English path map,
  request config, navigation helpers, the Next 16 proxy, typed message augmentation, and permanent
  redirects from every pre-migration URL with query strings preserved. Verified:
  `apps/public/i18n/routing.ts`, `apps/public/next.config.ts` (`redirects()`).
- [x] T006 Design tokens from the PRD palette and type scale, with an alias layer over the previous
  variables so already-written pages keep rendering; base, component and page stylesheets; the two
  brand fonts. Verified: `apps/public/app/styles/{tokens,base,components,pages,brokers}.css`,
  `apps/public/app/fonts.ts` (Nunito/Inter). Not re-reviewed visually in this pass.
- [x] T007 Brand assets wired: horizontal logo, white variant for the dark footer, symbol-only
  favicon and touch icon derived from the supplied artwork. Verified:
  `apps/public/public/logo-assurmatch{,-white,-symbol}.png`, `apps/public/app/{icon,apple-icon}.png`.
- [x] T008 UI primitives (button, field, radio cards, badge, score pill, notice, AI box, broker block,
  progress bar, comparison bar, empty state, breadcrumb, hero, section, inline icon set, logo,
  WhatsApp button, structured-data emitter, backend-text wrapper, language switcher). Verified: every
  file listed is present under `apps/public/app/components/ui/`.
- [x] T009 Site chrome: header with logo, country selector, always-visible comparison call to action,
  language toggle and a JavaScript-framework-free mobile menu; footer with country, product, guide,
  legal, regulatory, contact and broker navigation; platform status notice; local contact band; skip
  link. Verified by reading `components/site/site-header.tsx` and `site-footer.tsx` directly (also
  covered by the new `public-site-shell.spec.ts`); `mobile-menu.tsx` confirmed present and wired but
  not read line by line.
- [x] T010 Front-end libraries: site configuration, SEO and structured-data builders, visitor country
  detection that pre-selects and never redirects, the country cookie server action, the typed no-op
  tracker, and country-aware money and date formatting. Verified: `lib/site-config.ts`, `lib/seo.ts`,
  `lib/visitor-country.ts` read directly; `lib/visitor-country-actions.ts`, `lib/analytics.ts`,
  `lib/country-format.ts` confirmed present and consistently imported.
- [x] T011 API client extended with cached reads, message keys, and tolerant wrappers for every new
  endpoint, including a fallback so the country directory works before its endpoint exists. Verified:
  `apps/public/app/lib/public-api.ts` (`listCountryDirectory` falls back to `listPublicCountries`).
- [x] T012 Existing pages moved under the locale segment with metadata, translated copy and
  internationalised links, keeping every structural marker the existing specs assert. Verified: every
  page lives under `apps/public/app/[locale]/`; the repaired specs in `apps/public/tests/` now pass
  against it.

## Feature modules

- [x] T020 Waiting list: accepted only for a country whose waiting-list flag is on and public flag is
  off, idempotent per country and e-mail fingerprint, three-year retention, audited. Verified:
  `backend/src/modules/waitlist/waitlist.module.ts` (`WAITLIST_RETENTION_YEARS = 3`), unit spec
  `backend/tests/unit/waitlist/waitlist.service.spec.ts`, integration spec
  `backend/tests/integration/public-site/waitlist-runtime-http.spec.ts`.
- [x] T021 Broker applications: gated on the country onboarding flag, deduplicated per country,
  e-mail fingerprint and licence number, five-year retention, public reference returned, audited, no
  tenant and no authorisation created. Verified: `partner-applications.module.ts`
  (`RETENTION_YEARS = 5`), unit and integration specs present.
- [x] T022 Contact messages: four audiences, two-year retention, audited, no synchronous e-mail.
  Verified: `contact-messages.module.ts` (`CONTACT_RETENTION_YEARS = 2`), unit spec
  `contact-messages.service.spec.ts`, integration spec `contact-runtime-http.spec.ts`; no
  `EmailDeliveryService`/mailer import in the module.
- [x] T023 Public broker directory and individual broker read: active tenant, active country
  authorisation, at least one valid unexpired licence for the country; explicit public field list;
  short cache. Verified: `backend/src/modules/partners/public-partner-directory.service.ts`
  (`isLicenseCurrentlyValid`, `partner.status === "active"`, TTL cache); the public app's
  `getCountryPartner` reads an explicit allow-list of fields (`countries/[countryCode]/brokers/
  [partnerId]/page.tsx`).
- [x] T024 Public statistics: open countries, active brokers, validated offers, computed from the
  catalogue with a short cache. Verified: `backend/src/modules/public-stats/public-stats.module.ts`
  registered and consumed by the public home page via `getPublicStats`.
- [x] T025 Public insurer list per country derived from publicly visible offers, and public plan
  prices per country gated on the onboarding flag. Verified: `listInsurers` wired in
  `runtime-http-wiring.module.ts`, `GET /partners/plans` (`PublicPartnersController.plans`).
- [x] T026 Consent withdrawal from the tracking token: consent record withdrawn, request cancelled,
  open assignments closed, partner notified in-app, audited, idempotent. Verified:
  `POST /quote-requests/:publicReference/consent-withdrawal` registered, unit spec
  `backend/tests/unit/quote-requests/consent-withdrawal.spec.ts`, integration spec
  `consent-withdrawal-runtime-http.spec.ts`, and the front end's `ConsentWithdrawal` component on the
  tracking page.

## Pages

- [x] T030 Home: country and product selector above the fold, live trust figures, platform status
  notice, the three canonical steps, the brand signature. Verified by reading
  `apps/public/app/[locale]/page.tsx`; the country/product selector is also exercised live by the
  extended browser smoke (`local-app-launcher-browser.spec.ts`, env-gated).
- [x] T031 Countries page split into open, pilot and coming; country page with products and partner
  brokers; waiting page with capture for a non-public country. Verified by reading
  `[locale]/countries/page.tsx` and `[locale]/countries/[countryCode]/page.tsx`
  (`OpenCountry`/`WaitingCountry`); the waiting-list variant was exercised live against the seeded
  "SN" country.
- [x] T032 Product page with real product name, prepared-documents list, product FAQ and its
  structured data; offers, comparison, offer detail, quote and confirmation restyled on the new
  primitives; consent withdrawal on the tracking page. Verified by reading every page under
  `products/[productKey]/**`, `compare/page.tsx`, `offers/[offerId]/page.tsx` and
  `quote-requests/[publicReference]/page.tsx`.
- [x] T033 How it works, regulatory status, the four legal pages and their country variants. Verified
  by reading the pages and `content/institutional.ts`/`content/legal/**`; covered by the new
  `public-institutional.spec.ts`.
- [x] T034 Guides, glossary and FAQ from versioned content modules, each embedding the entry selector
  of its product; contact page with the four audiences. Verified: pages present and read; the four
  `Contact.audience*` catalogue entries confirmed in `messages/fr.json`.
- [x] T035 Become a partner, pricing with the seven billable-lead criteria, application form, broker
  login explanation. Verified by reading `brokers/{page,pricing,apply,login}/page.tsx` and
  `content/brokers.ts`; covered by the new `public-brokers.spec.ts`.
- [x] T036 Broker and insurer directories per country, individual broker page with its structured
  data, and the generated sitemap with language alternates. Verified: `sitemap.ts` builds
  `localizedEntries` with an `alternates.languages` map per route; the broker detail page emits
  `localBusinessJsonLd`.
- [x] T037 English catalogue and English content for the institutional and legal pages. Verified
  programmatically: `messages/fr.json` and `messages/en.json` have identical 712-key trees (see
  `i18n-messages.spec.ts`), and `content/institutional.ts`/`content/legal/**` export a distinct `en`
  record for every entry.

## Wiring, tests and documentation

- [x] T040 HTTP controllers and runtime accessors for every new endpoint, plus the two admin reads;
  guardrail lists updated for the new repositories and routes. Verified: every spec-045 route
  (`waitlist`, `contact`, `partners/applications`, `partners/plans`, `countries/directory`,
  `countries/:code/insurers`, the consent-withdrawal route) found registered in
  `runtime-http-wiring.module.ts`, plus `AdminPartnerApplicationsController.list` and
  `AdminContactMessagesController.list`; the new repositories appear in
  `backend/tests/guardrails/domain-repository-memory.spec.ts` and
  `runtime-memory-boundaries.spec.ts`.
- [x] T041 Integration tests over the HTTP harness for each new route: status codes, flag gating,
  idempotence, absence of personal data in responses, audit rows written. Verified: an
  integration spec exists per feature under `backend/tests/integration/public-site/` plus a unit spec
  per service under `backend/tests/unit/`. Not re-executed in this pass (out of my ownership and out
  of scope for `npm run test:web`) — only their presence and the behaviour they claim to cover were
  checked against the implementation.
- [x] T042 Demo seed: onboarding flag on for the open country, partner cities, plan prices, the
  waiting-list country left closed. Verified: `scripts/local-app/seed-broker-demo.ts` sets
  `country_broker_onboarding_enabled: true` and seeds plan prices for CI, partner cities ("Abidjan",
  "Yamoussoukro"), and leaves SN's onboarding flag `false`.
- [x] T043 Source-marker specs updated to the new paths and to the message catalogue, using a shared
  helper; new specs for the shell, the entry pages, the institutional pages, the broker pages, the
  metadata coverage and the catalogue parity. Done in this pass: `apps/public/tests/helpers/
  public-sources.ts` added; the eleven pre-existing specs repaired; `public-site-shell.spec.ts`,
  `public-institutional.spec.ts`, `public-brokers.spec.ts`, `public-seo.spec.ts` and
  `i18n-messages.spec.ts` added. All pass under `npx playwright test apps/public/tests/`, including
  the env-gated browser specs re-run against the live local stack.
- [x] T044 Vocabulary guardrail: forbidden wording matched without diacritics and in both languages
  over the application and the catalogues; every file rendering an amount must carry the indicative
  mention; no pre-checked consent box. Verified: `backend/tests/guardrails/content/
  forbidden-wording.spec.ts` checks `findForbiddenWording` (both accented and unaccented entries in
  `packages/shared/contracts/content-safety.ts`) against both `messages/fr.json` and
  `messages/en.json`; `offer-wording.spec.ts`/`public-journey-wording.spec.ts` assert the indicative
  mention; "no pre-checked consent box" is asserted directly in this pass's own
  `public-multi-broker-consent.spec.ts` and `public-brokers.spec.ts`.
- [x] T045 Launcher and preproduction environment variables, health script path and its escaped-quote
  bug, quickstart and coverage map. Verified: `scripts/local-app/local-health.mjs` now probes
  `/pays/CI/produits/auto/devis`; the coordinator confirmed `npm run local:health` passes all nine
  checks against the live stack. Quickstart (`docs/local-app-quickstart.md`) and the coverage map
  (`docs/prd_coverage_map.md`) updated in this pass.
- [x] T046 Validation, completed by the supervisor on 2026-09-19. All green: `npm run typecheck`,
  `npm run lint`, `npm run test` (245 files, 597 tests), `npm run test:web` (130 passed, 11 env-gated
  specs skipped), `npx prisma validate`, migration 0017 applied to the local database with
  `prisma migrate deploy`, a real production `next build` of `apps/public` with every route present,
  and `npm run local:health` (9 of 9). End to end on the live stack: the French pages render French
  and the English pages under `/en` render English whatever the locale cookie says, legacy URLs
  redirect permanently, the branded 404 answers, the waiting-list country captures an e-mail with no
  quote path, the broker directory lists the three eligible partners and excludes the expired
  licence, the three public forms return 202 with a real reference, and a submitted quote request was
  withdrawn end to end (cancelled, idempotent on repeat, 404 on a wrong token). A read-only design
  review ran over the primitives and the forms; the findings it raised were fixed (consent tap
  targets now clear 44px, consent errors are announced on their own control) and the copy was scanned
  against the banned list in both catalogues, in accent-insensitive form, with no hit.
  Not covered, and deliberately so: a Lighthouse mobile measurement of the product page against the
  budgets in NFR-01 and NFR-02, which needs a deployed build rather than a development server.
