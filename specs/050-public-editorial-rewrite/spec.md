# Feature Specification: Public Site — Editorial Rewrite and Trust-First UX

**Feature Branch**: `050-public-editorial-rewrite`
**Created**: 2026-09-24
**Status**: Approved and implemented 2026-09-25 (see `tasks.md`)
**Validation State**: Approved by the product owner on 2026-09-25 (D2 validated, D3 validated, callback label = « Être rappelé par un courtier partenaire »).
**Continuous Workflow Eligible**: Yes.

## Why this spec exists

Spec 045 gave the public site its structure: bilingual shell, catalogue, institutional pages, broker
acquisition. The 2026-09-20 redesign gave it its look. What neither changed is the voice. The copy was
moved into catalogues string by string, and it still reads as a product description written for a
reviewer: accurate, compliant, and impersonal. A visitor in Abidjan or Dakar does not feel that
people who know the market wrote it.

A read-only audit on 2026-09-24 also found UX gaps that the copy cannot fix alone:

- the quote form sends in one click, with no review step, and never names the responsible broker
  before the consent box, even when the visitor arrived from a specific offer;
- the side-by-side comparison is a table that scrolls sideways on a phone;
- offer selection has no upper bound in the interface: the 4-offer limit is enforced only after
  submission;
- the visitor sort list exposes "sponsored first" and "name", which a visitor never needs and the
  first of which undermines the claim that sponsorship does not affect ranking;
- the offer card hides the last-update date inside a collapsed panel;
- guides have no reading time and no "mistakes to avoid"; there is no guide on the deductible, on
  third-party liability or on declaring a claim;
- the commitments a visitor needs in order to trust the site are spread over four pages, and there
  is no single page stating them;
- the broker application is one long form whose confirmation replaces the form in place;
- the home page closes on a signature containing a superlative ("pour un meilleur avenir");
- the CI wording guardrail only knows five regulated phrases.

This spec delivers the editorial content (in `content/`) and the UX changes it needs.

## Deliverable structure

| File | Content |
| --- | --- |
| `content/00-charte-editoriale.md` | Voice, writing rules, banned vocabulary, positioning sentences, normalised action labels, data inventory, markers |
| `content/01-accueil-pays-produits.md` | Site map; home; countries; country page (open and waiting list); product pages |
| `content/02-offres-comparaison-devis.md` | Offer list, filters, sort, offer card; offer detail; comparison; quote form; confirmation and tracking |
| `content/03-guides-faq-lexique.md` | Guide index and template; full text of 7 guides; FAQ; glossary |
| `content/04-confiance-legal.md` | How it works; regulatory status; **Notre engagement** (new); privacy; cookies; terms; legal notice; contact |
| `content/05-espace-courtiers.md` | Become a partner; plans and pricing; 4-step application; confirmation (new); login; directories |
| `content/06-composants-etats-accessibilite.md` | Shell; component catalogue; every interface state; accessibility; microcopy glossary; EN derivation rules |

Every missing fact is marked `[à confirmer]`, `[à vérifier juridiquement]`, `[à mesurer]` or
`[exemple]`. Nothing is invented: no figure, licence, partner, price, delay, coverage or testimonial.

## Constitutional Scope & Compliance

- **Technical platform role (I)**: Reinforced. The four positioning sentences of the charter (§4)
  are repeated at every decision point: home, product, offer detail, consent, confirmation.
- **Impacted surfaces**: **Web Publique Client** (major: copy, page structure, 3 new routes, form
  steps, comparison layout, filters and sort); **shared packages** (`packages/shared/contracts/
  content-safety.ts`: extended banned-wording list); **tests** (public specs and backend content
  guardrails). **Not impacted**: Backend API, database, migrations, Back-office Partenaires/
  Plateforme, Broker Back-office, runtime. Every datum the new copy displays already exists in the
  public API contract.
- **Frontend separation (III)**: Unchanged. The broker login page keeps building the portal URL from
  `NEXT_PUBLIC_ASSURMATCH_BROKER_URL`; no back-office route, screen or auth state enters the public
  app. The new broker confirmation page is a public page and carries only a public reference.
- **Consent (II, VIII)**: Strengthened. The responsible broker is named before the consent box when
  it is knowable (preselected offer). A review step precedes sending. The consent text itself is
  still the versioned backend text recorded in `ConsentRecord`; this spec rewrites only the
  microcopy around it, never the text the visitor agrees to.
- **Feature flags**: No new flag. Every state tied to `public_comparator_enabled`,
  `quote_request_enabled`, `sponsored_offers_enabled`, country and product flags gets explicit copy
  (`content/06`).
- **Sponsorship (VIII)**: "Sponsored first" leaves the visitor sort list. The sponsored badge stays
  orange and visible on every card, detail, comparison column and preview. The score is never
  modified by sponsorship and the copy says how to check it.
- **AI (V)**: No new AI. Decision D2 below.
- **Routing (VII)**: None. The multi-broker checkbox copy states what it does; no copy implies that
  AssurMatch chooses a broker by judgement.
- **Data / audit (IV, VI)**: No new collection. The broker application's new confirmation page
  receives a public reference in its URL, never an e-mail, name or phone number.
- **Content restrictions (VIII)**: The banned list grows (charter §3) and the CI guardrail is
  extended to match it, in both languages, diacritics-insensitively, with the noun "garantie"
  explicitly allowed.

## Decisions

### D1 — Content first, then UX, in one spec
The copy and the UX changes are specified together because half of the copy only exists if the UX
changes (review step, broker named before consent, mobile comparison cards, "max 4 reached" state).
Splitting them would ship copy describing screens that do not exist.

### D2 — "IA" is a disclosure, never an argument *(validated 2026-09-25)*
The brief asks never to write "intelligence artificielle". The constitution (V) requires AI output to
be visibly marked. Both are satisfied by one rule: the word appears only in the transparency label of
a function that really calls a model ("Réponse générée automatiquement par un outil d'IA. Aide à la
lecture, pas un conseil."), never in a headline, benefit list or plan argument. Removing the label to
sound less artificial would hide from the visitor that a model wrote the text, which is the opposite
of the transparency the brief also asks for.

### D3 — The brand signature is replaced *(validated 2026-09-25)*
"Le bon courtier, pour un meilleur avenir" is replaced by "Comparer d'abord. Être accompagné
ensuite."

### D4 — The responsible broker before consent
With a preselected offer, the quote page reads that offer through the existing public endpoint and
shows the broker's trade name above the consent box, with its authorisation number and a link to its
directory page when the country directory resolves it (the same name lookup the offer detail page
already performs; the offer contract carries `partnerName` but no partner id). When the lookup fails,
the name alone is shown; no backend change is needed. Exposing a partner id on the offer summary
would make the lookup exact and is a follow-up, not part of this spec. Without one, the page
explains that a broker authorised for this country and product will receive the request (up to
three if the visitor opts in) and that the name will appear on the tracking page. The broker is not
known before routing in that case, and pretending otherwise would be false.

### D5 — Visitor sort list
Score (default), lowest price, highest guarantee level, fastest processing, popularity, most recently
updated. "Sponsored first" and "name" stay in the API enum for internal use and leave the visitor
interface. Popularity is labelled with its real definition from the API, or hidden if that definition
cannot be stated plainly.

### D6 — Progressive forms without breaking no-JS
The quote form and the broker application become step-by-step on the client. Without JavaScript they
render as one page with the same numbered sections, exactly as today, so a server-rendered submission
still works and the existing honeypot and unchecked-consent tests keep their meaning.

### D7 — Three new public routes
`/notre-engagement` (EN `/our-commitment`), `/courtiers/candidature/confirmation`
(EN `/brokers/apply/confirmation`), and the three new guide slugs under the existing `/guides/[slug]`.
All added to the `pathnames` map, the sitemap and the footer where relevant.

### D9 — Callback label *(validated 2026-09-25)*
The callback action reads « Être rappelé par un courtier partenaire » everywhere; « agréé » is not
used for it.

### D8 — No testimonials, no invented delays, no cookie banner
The testimonial component is specified but not rendered until a verification rule exists. No response
delay is shown until a real measure exists. The site still sets only one functional cookie, so there
is no cookie banner; the "consent banner" on product pages is an information strip.

## Requirements

### Editorial
- **FR-001**: Every visitor-facing French string in `messages/fr.json` and `app/content/*.ts` is
  rewritten according to `content/00-charte-editoriale.md` and the page files `01` to `06`.
- **FR-002**: The English catalogue is re-derived from the new French using the mapping in
  `content/06`; key trees stay identical.
- **FR-003**: The banned vocabulary of charter §3 is added to the content guardrail, checked in both
  catalogues and in `app/content/*.ts`, diacritics-insensitive, with the noun "garantie(s)" and
  "niveau de garantie" allowed.
- **FR-004**: Strings pinned by `public-institutional.spec.ts`, `public-brokers.spec.ts` and
  `public-localized-wording.spec.ts` are preserved or the test is updated in the same change with the
  reason stated.

### Journey
- **FR-010**: The offer list shows 4 primary filters and a "Plus de filtres" group (D5, `content/02`).
- **FR-011**: The offer card shows the last-update date at first level.
- **FR-012**: Selecting a fifth offer is impossible in the interface and the reason is stated.
- **FR-013**: Below 768 px the comparison renders one card per criterion; no horizontal scroll.
- **FR-014**: An unavailable offer renders one rewritten message that names the three possible causes
  (expired, not validated, broker no longer eligible) without claiming which one applies, and leads
  back to the current offers. The API returns one generic error today; telling the causes apart is
  a backend follow-up (see *Follow-ups*), not part of this spec.
- **FR-017**: The default visitor sort is `score_desc`, set by the page (`offers/page.tsx:72`), not by
  the shared schema, whose default stays `updated_desc` for other callers.
- **FR-015**: The quote form runs in 4 steps with a review step and names the broker before consent
  when knowable (D4, D6).
- **FR-016**: Each personal-data field states why it is asked.

### Content and trust
- **FR-020**: Guides carry a computed reading time, key points, mistakes to avoid and a targeted
  comparison call to action; three new guides are published.
- **FR-021**: FAQ and glossary follow `content/03`.
- **FR-022**: "Notre engagement" exists, is linked from the footer, the home page and the quote
  review step.
- **FR-023**: Legal pages open with a plain-language summary box; placeholders stay placeholders.

### Brokers
- **FR-030**: The broker application runs in 4 steps (D6) and ends on its own confirmation page (D7).
- **FR-031**: Plan feature lists name functions by what they do; AI functions carry the D2 label.

### Non-functional
- **FR-040**: WCAG 2.1 AA as detailed in `content/06` §4; nothing below 14 px; focus visible; errors
  tied to fields; score readable as text.
- **FR-041**: Pages stay server-rendered; client JavaScript only for the step controllers and the
  comparison bar, which existed already.

## Acceptance criteria

1. **Broker named before consent.** Given a visitor who clicks "Demander un devis" on an offer card,
   When the review step renders, Then the broker's trade name appears above the unchecked consent
   box, with its authorisation number when the country directory lists it, and nothing has been
   sent.
2. **No broker invented.** Given a visitor who opens the quote form without a preselected offer,
   When the review step renders, Then no broker name is shown and the text explains who will receive
   the request and where its name will appear.
3. **Nothing leaves before consent.** Given the review step with the consent box unchecked, When
   the visitor presses "Envoyer ma demande", Then the request is not submitted and the error names
   the box.
4. **Fifth offer.** Given four offers selected, When the visitor looks at a fifth card, Then its
   "Ajouter à la comparaison" control is disabled and states the 4-offer limit.
5. **Mobile comparison.** Given a 375 px viewport and three offers compared, When the page renders,
   Then no element scrolls horizontally and every criterion shows the three values with their offer
   names.
6. **Sponsorship visible, never ranked.** Given a sponsored offer, When the list is sorted by score,
   Then its position is the one its score gives, it carries the orange badge, and the sort list
   offers no "sponsored first" option.
7. **Unavailable offer.** Given an offer whose validity ended, When its detail URL is opened, Then
   the page states that the offer is no longer available publicly and why that can happen, shows no
   price as available, and offers a way back to the current offers.
8. **Banned word fails CI.** Given "instantané", "révolutionnaire" or "meilleure" introduced in
   either catalogue or a content module, with or without accents, When CI runs, Then the build fails
   naming the phrase and the file; Given "garantie responsabilité civile", Then it passes.
9. **Application confirmation.** Given a valid broker application, When it is accepted, Then the
   browser lands on the confirmation page whose URL and body contain the public reference and no
   personal data.
10. **No-JS still works.** Given JavaScript disabled, When a visitor submits the quote form or the
    broker application, Then the submission succeeds from the single-page fallback.
11. **English mirrors French.** Given any page of this spec, When English is chosen, Then the page
    renders with the same structure and data, and backend French text stays marked `lang="fr"`.

## Validation

`npm run typecheck`, `npm run lint`, `npm run test`, a real `next build` of `apps/public`,
`npm run test:web`, then the local stack with the demo seed: `npm run local:health`,
`npm run test:web:local`, and a manual pass on the home page, one product, the offer list, the
comparison at 375 px and 1280 px, the quote form (with and without a preselected offer, with and
without JavaScript), the broker application, "Notre engagement", the 404 and both languages.

## Explicit non-goals

A CMS; real testimonials; a measured response delay; a cookie banner; product and city pages beyond
auto and voyage variants; changes to the backend consent texts; any backend, database or back-office
change; making AI more visible or more present.

## Follow-ups (backend, separate spec)

- Expose `validUntil` on the offer summary so validity can appear on the card (today: detail only).
- Return a reason category for an unavailable offer (expired / not validated / broker ineligible),
  after checking that naming a broker's ineligibility publicly leaks nothing sensitive (VIII).
- Expose a partner id on the offer summary so the broker shown before consent is resolved exactly
  rather than by trade name (D4).
- **Trusted proxies for the client address (security).** `clientIp()` in
  `backend/src/modules/common/http/request-actor.ts` trusts the first `x-forwarded-for` entry from any
  caller, so a client talking to the API directly can already choose its rate-limit bucket. The no-JS
  server actions added here forward the visitor address they received (otherwise every no-JS
  submission would share the Next server's bucket); they add no capability a direct API caller lacks,
  but they inherit the same trust. Fix in the backend: honour `x-forwarded-for` only from configured
  proxy addresses (e.g. `ASSURMATCH_TRUSTED_PROXIES`), and make the public app's server actions one
  of them. Recorded after the 2026-09-25 security review.

## Open items for the product owner

Collected from the `[à confirmer]` markers of `content/`; see the list in `content/README.md`.
