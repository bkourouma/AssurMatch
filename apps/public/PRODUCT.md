# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Visitors (primary).** Adults in francophone West Africa (Côte d'Ivoire first, Senegal and other
  countries as they open) who need car, motorbike, health, home or travel insurance (including
  travel cover for a Schengen visa application). They arrive on a phone, often on mobile data, and
  want to see what exists, at what indicative price, before talking to anyone. Their job: compare
  indicative offers for their country and product, understand what they are looking at, and send a
  quote request to an authorised partner broker when they are ready.
- **Insurance brokers (secondary).** Authorised brokers evaluating whether to join as partners:
  they read the partner pages, the plans and pricing, and fill in a four-step application. Their
  authenticated back-office is a separate app and never part of this site.

Devices: phones first (confirmed by the product owner, 2026-10-05). Design and judge at 390px first,
desktop second.

## Product Purpose

AssurMatch is a technical B2B2C platform that compares indicative insurance offers country by
country and connects the visitor with an authorised partner broker. Success is a visitor who
understands the offers, trusts that nothing is sent without their consent, and sends a quote
request that a responsible broker picks up.

## Positioning

AssurMatch is not a broker, an insurer or an agent. It compares, explains and transmits; the
partner broker confirms the price and the conditions and carries the professional responsibility.
The visitor pays nothing to AssurMatch; brokers pay a subscription or for the requests they
receive. Sponsorship is always labelled and never changes the score.

## Operating Context

- Bilingual site (French default, English), routes localised through `next-intl` pathnames.
- Country-scoped catalogue: countries, products, offers, partner brokers and insurers come from the
  public API (`app/lib/public-api.ts`); countries can be open or on a waiting list.
- Amounts in FCFA, written `45 000 FCFA`; dates written `24 septembre 2026`.
- Visitor journey: home → country → product → offers (filter, sort, compare up to 4) → offer detail
  → quote request (steps, review, consent) → tracking page by public reference.
- Feature flags (`public_comparator_enabled`, `quote_request_enabled`, `sponsored_offers_enabled`,
  country and product flags) each have explicit copy for their off state.
- Forms must keep working without JavaScript (server-rendered submission, honeypot).

## Capabilities and Constraints

- Constitution (`.specify/memory/constitution.md`) is authoritative, notably principles I, II and
  VIII: offers are shown as indicative; "prix indicatif" and "à confirmer par le courtier partenaire"
  where relevant; sponsored offers clearly marked; the visitor must know when, to whom and why a
  request is transmitted; the platform's technical role and legal notices stay visible on public
  journeys and at consent points.
- Banned wording (CI guardrail, both languages): "acheter", "souscrire maintenant", "contrat
  valide", "garantie acceptée", "la meilleure assurance du marché", plus the spec 050 list
  (superlatives, instant/one-click promises, "IA" as a selling point, marketing jargon).
- Public CTAs favour « Comparer les offres », « Demander un devis », « Être rappelé par un courtier
  partenaire ».
- AI appears only as a transparency label on a function that really calls a model.
- Public and authenticated (admin, broker) journeys stay separate apps.
- Every fact on the page comes from the API or the editorial content in
  `specs/050-public-editorial-rewrite/content/`; missing facts stay marked, never invented.

## Brand Commitments

- Name: AssurMatch. Signature: « Comparer d'abord. Être accompagné ensuite. » (spec 050 D3); the
  old tagline « Le bon courtier, pour un meilleur avenir » is retired and must not be shown.
- Logo: an umbrella over a shield with people, in blue and green (`public/logo-assurmatch*.png`).
  The product owner allows a flatter, simpler redraw in the same spirit; it is a brand change and is
  shown to the owner before shipping.
- Voice: the editorial charter `specs/050-public-editorial-rewrite/content/00-charte-editoriale.md`
  (vouvoiement, short sentences, concrete before abstract, a limit is worth more than a promise, no
  exclamation marks, sentence case).
- Credible first, expressive allowed (product owner, 2026-10-05, loosened 2026-10-08): the site must
  stay credible and clear on price and consent, but a distinct visual identity is welcome. Anti-references:
  `D:\APP\MedicProWeb`, a heavily themed site (painted freight-container metaphor, condensed all-caps
  display, rendered metal plates), and the retired navy-sign world « La signalétique ». AssurMatch must
  not look like a costume or a concept piece. Current world: « Le patron » (indigo cloth, pattern sheet,
  yellow measuring tape).

## Evidence on Hand

- Live counters from `GET /public-stats` (open countries, active partner brokers, validated
  offers), shown only when non-zero, with their computation date.
- Real catalogue data through the public API (demo seed locally).
- Editorial content: 7 guides, FAQ, glossary, legal pages, "Notre engagement" (spec 050).
- Absent and not to be fabricated: testimonials, customer logos, response delays, partner counts
  beyond the API, ratings, press.

## Product Principles

1. Indicative, and says so: every price and guarantee is shown with its status and who confirms it.
2. Nothing leaves without consent: transmission is explained before it happens, never implied.
3. Plain over impressive: the visitor is an adult making a money decision on a phone; clarity and
   speed beat effect.
4. Sponsorship is visible and never bends the ranking.
5. One goal per page, one primary action.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for every text/background pair; nothing below 14px.
- 44px minimum tap targets; works on small phones and slow connections.
- Reduced-motion preference disables all animation.
- Forms usable without JavaScript; errors explained without exposing sensitive data.
