# Tasks: Public Site — Editorial Rewrite and Trust-First UX

**Impacted surfaces**: Web Publique Client, shared packages (`content-safety.ts`), tests.
**Status**: implemented 2026-09-25; validation notes under Wave 2.

## Wave 0 — foundations (supervisor)

- [x] T001 Record the validated decisions (D2, D3, D9) in `spec.md`, the charter and the README.
- [x] T002 Add `/our-commitment` and `/brokers/apply/confirmation` to `apps/public/i18n/routing.ts`.
- [x] T003 Add `/our-commitment` to the static sitemap routes.
- [x] T004 Lock-protected catalogue merge helper (scratchpad, not committed).
- [x] T005 `plan.md` and this file.

## Wave 1 — owners

### A offers
- [x] T010 Filters: 4 primary + "Plus de filtres"; "Effacer les filtres". (FR-010)
- [x] T011 Visitor sort list per D5, default `score_desc` set by the page. (FR-017)
- [x] T012 Offer card: last-update date at first level; copy per `content/02`. (FR-011)
- [x] T013 Comparison selection capped at 4 in the interface, with the reason. (FR-012) Verified by
      reading `forms/offer-comparison-bar.tsx` (the demo seed has 3 offers, so a fifth cannot be reached
      in the browser).
- [x] T014 Comparison: mobile card-per-criterion layout below 768 px, rewritten rows. (FR-013)
- [x] T015 Offer detail copy and single unavailable-offer message. (FR-014)
- [x] T016 Offers / OfferCards / Compare / OfferDetail / Journey catalogues FR + EN; specs updated.

### B quote
- [x] T020 4-step client-side quote form with single-page no-JS fallback. (FR-015, D6)
- [x] T021 Why-asked hints on every personal-data field. (FR-016)
- [x] T022 Review step; broker named before consent when an offer is preselected (D4).
- [x] T023 Confirmation, documents and withdrawal copy per `content/02`.
- [x] T024 QuoteForm / QuoteRequest / DocumentUpload catalogues FR + EN; specs updated.

### C entry
- [x] T030 Home rewrite; stats hidden when the call fails or every count is zero; new signature (D3).
- [x] T031 Countries, open country and waiting-list copy.
- [x] T032 Product pages: hero variants, documents, score explanation, FAQ, information strip.
- [x] T033 Visitor assistant: D2 label, "assistant de lecture" wording.
- [x] T034 Home / Countries / Country / Waitlist / Product / VisitorAi catalogues FR + EN; specs updated.

### D content
- [x] T040 Guide model: computed reading time, key points, mistakes, targeted CTA. (FR-020)
- [x] T041 Seven guides (4 rewritten, 3 new) FR + EN.
- [x] T042 FAQ (18 questions, 4 themes) and glossary (40 terms) FR + EN. (FR-021)

### E trust
- [x] T050 How it works and regulatory status rewrite, pinned sentences preserved.
- [x] T051 New "Notre engagement" page. (FR-022)
- [x] T052 Legal pages: summary box, rewritten sections, placeholders kept. (FR-023)
- [x] T053 Contact page and form copy.
- [x] T054 HowItWorks / RegulatoryStatus / Legal / Contact / Commitment catalogues FR + EN.

### F brokers
- [x] T060 Become-a-partner and pricing rewrite; plan features named by function, AI label (D2). (FR-031)
- [x] T061 4-step application with no-JS fallback. (FR-030)
- [x] T062 Application confirmation page, public reference only, `noindex`.
- [x] T063 Login page and directories copy.
- [x] T064 Brokers / BrokerPricing / BrokerApply / BrokerLogin / Directory catalogues FR + EN.

### G shell
- [x] T070 Header, footer (with "Notre engagement"), selectors, breadcrumb copy.
- [x] T071 404, error, API and form state messages per `content/06`.
- [x] T072 Banned-vocabulary guardrail extended (charter §3), both languages, diacritics-insensitive,
      catalogues and content modules, noun "garantie" allowed. (FR-003)
- [x] T073 Layout / Common / Metadata / NotFound / Error / Api / Forms catalogues FR + EN.

## Wave 1b — supervisor additions

- [x] T075 No-JavaScript server actions for the contact, broker application and waiting-list forms:
      without them the browser submitted those forms as GET and put name, e-mail, phone and licence
      number in the URL (pre-existing since spec 045, contrary to its FR-042). Same pattern as the quote
      form. Verified in a JS-disabled browser: no personal data in any resulting URL.
- [x] T076 The server actions forward the visitor address (`x-forwarded-for`) so the API's per-IP
      abuse guard does not see every no-JS submission as the Next server.
- [x] T077 Unavailable offer (API 404) shows the FR-014 message instead of the wrapper's generic text.
- [x] T078 Comparison values formatted like the offer cards (currency, dates, pluralised days).
- [x] T079 Filter labels follow the brief (« Budget indicatif », « Rythme de paiement »); English
      signature differs from the hero title (duplicate h1 text).

## Wave 2 — assembly (supervisor)

- [x] T080 Cross-owner reconciliation and diff review.
- [x] T081 `npm run typecheck`, `npm run lint`, `npm run test`.
- [x] T082 `npx playwright test apps/public/tests`.
- [x] T083 Real `next build` of `apps/public`.
- [x] T084 Local stack with demo seed, `npm run local:health`, `npm run test:web:local`.
- [x] T085 Browser pass (375 and 1280 px, FR and EN, with and without JavaScript for the forms).
- [x] T090 Constitution re-check and final report. Read-only security review (Sonnet): ship; the
      x-forwarded-for trust issue is pre-existing in the backend and recorded under Follow-ups.
