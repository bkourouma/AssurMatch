# Implementation Plan: Public Site — Editorial Rewrite and Trust-First UX

**Spec**: `specs/050-public-editorial-rewrite/spec.md` (approved 2026-09-25)
**Content source**: `specs/050-public-editorial-rewrite/content/00` to `06`
**Impacted surfaces**: Web Publique Client (major), shared packages (`content-safety.ts`), tests
(public Playwright source specs, backend content guardrails). Backend API, database, back-offices
and runtime: not impacted.

## Constitution check

- I / VIII: positioning sentences and normalised CTAs applied; "Acheter", "Souscrire maintenant",
  superlatives and delay promises stay out and the guardrail grows to enforce it.
- II: consent text untouched (backend, versioned); broker named before consent when knowable;
  review step before sending; nothing sent before the box is checked.
- III: no back-office route, layout or auth state in the public app; broker login URL still from env.
- V: no new AI; the assistant keeps its transparency label (D2).
- VII: no routing change.
- IX: every pinned string either preserved or its test updated in the same change with the reason.
- Result: pass. Re-checked after implementation in `tasks.md` T090.

## Sequencing

**Wave 0 — supervisor.** New routes in `i18n/routing.ts` (`/our-commitment`,
`/brokers/apply/confirmation`), sitemap entry for the commitment page, a lock-protected merge helper
for the message catalogues (scratchpad, not committed), this plan and `tasks.md`.

**Wave 1 — seven parallel owners (Sonnet), disjoint files and namespaces.**

| Owner | Namespaces | Files (exclusive) | Tests |
| --- | --- | --- | --- |
| A offers | Offers, OfferCards, Compare, OfferDetail, Journey | offers list page, compare page, offer detail page, `offer-cards.tsx`, `forms/offer-comparison-bar.tsx`, `public-journey.tsx`, `styles/pages/journey.css` | public-offers, public-compare |
| B quote | QuoteForm, QuoteRequest, DocumentUpload | quote page, `quote-form.tsx`, quote-requests page, `forms/consent-withdrawal.tsx`, `quote-document-upload.tsx`, new `styles/pages/quote.css` | public-quote-form, public-quote-confirmation, public-quote-documents, public-multi-broker-consent, public-comparator-quote-* |
| C entry | Home, Countries, Country, Waitlist, Product, VisitorAi | home page, countries pages, country page, product page, `home/*`, `forms/waitlist-form.tsx`, `visitor-ai-assistant.tsx`, product content module, `styles/pages/home.css` | public-country-product, public-visitor-ai |
| D content | Guides, Glossary, Faq | `content/guides.ts`, `faq.ts`, `glossary.ts`, guide/faq/glossary pages, `institutional/guide-card.tsx` | (none pinned) |
| E trust | HowItWorks, RegulatoryStatus, Legal, Contact, Commitment (new) | how-it-works, regulatory-status, legal pages (global + country), contact page, new our-commitment page, `content/institutional.ts`, `content/legal/**`, `forms/contact-form.tsx` | public-institutional |
| F brokers | Brokers, BrokerPricing, BrokerApply, BrokerLogin, Directory | brokers pages, new apply confirmation page, `components/brokers/*`, `forms/partner-application-form.tsx`, `content/brokers.ts`, country brokers/insurers pages, `ui/broker-block.tsx`, `styles/brokers.css` | public-brokers |
| G shell | Layout, Common, Metadata, NotFound, Error, Api, Forms | `components/site/*`, `components/ui/*` (except broker-block), `not-found.tsx`, `error.tsx`, `styles/{base,components,chrome,motion}.css`, `packages/shared/contracts/content-safety.ts`, `backend/tests/guardrails/content/*` | public-site-shell, public-seo, i18n-messages, auth-separation, backend guardrails |

Shared-file rules: `content/types.ts` and `styles/pages/institutional.css` are edited by D and E with
the Edit tool only, each in its own block, never rewritten whole. The catalogues are changed only
through the merge helper, one whole namespace at a time, French and English together. A string
needed from `Common` by a non-owner is added to that owner's own namespace instead.

**Wave 2 — supervisor.** Reconcile, `npm run typecheck`, `npm run lint`, `npm run test`,
`npx playwright test apps/public/tests`, real `next build` of `apps/public`, local stack with demo
seed, `npm run local:health`, `npm run test:web:local`, browser pass (home, offers, compare at 375 and
1280 px, quote with and without preselected offer, broker application, commitment page, 404, EN).

## Content rendering rules (all owners)

- `[à confirmer]`: never shown to a visitor. Omit the element, or, on legal pages, use the existing
  `LegalPlaceholder` ("à compléter avant mise en ligne").
- `[à vérifier juridiquement]`: ship the sentence without the marker; the list stays in
  `content/README.md` for legal review before launch.
- `[à mesurer]`: omit the figure.
- `[exemple]`: only inside components already labelled illustrative (`OfferPreview`,
  `LeadExampleCard`), with their existing "à titre illustratif" mention.
- Backend French text (offer names, consent texts, partner mentions) is never rewritten.

## Risks

- **Concurrent edits.** Mitigated by exclusive ownership, the lock-protected merge helper and
  Edit-only rules on the two shared files. The supervisor diff review in wave 2 is the backstop.
- **Pinned strings.** Several specs assert exact copy. Owners update a spec only in the same change
  and state why; the constitutional ones (notDone sentences, CTAs, billable criteria) are preserved.
- **Guardrail false positives.** "meilleur" or "immédiat" may appear in legitimate text (e.g. a
  consent-withdrawal effect). The guardrail matches visitor catalogues and content modules, with an
  explicit allow-list reviewed in the spec, rather than weakening the pattern.
- **Temporary type errors.** Owners work in parallel; each fixes only errors in its own files and the
  supervisor resolves cross-owner errors in wave 2.
