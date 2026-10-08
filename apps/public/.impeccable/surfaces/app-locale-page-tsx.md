---
version: 1
slug: "app-locale-page-tsx"
primary_target: "app/[locale]/page.tsx"
related_targets: ["app/[locale]/layout.tsx","app/styles"]
---

# Surface brief: public site (apps/public), all routes

Scope: the whole public site, home first; every route inherits the world. Mode: Persuade on home,
product and broker-acquisition pages; Operate on offers, compare and quote; Read on guides, FAQ,
glossary and legal pages.

Audience and job: see PRODUCT.md. Phones first (390px), desktop second. Constraint from the owner:
"not fancy"; anti-reference D:\APP\MedicProWeb (themed costume world).

Build path: code-led (the OpenAI key is deactivated, so no comps exist; the owner's recorded default
is comp-first and stays in .impeccable/config.json).

## Direction contract

THESIS: The public site is a wayfinding sign system for an insurance decision. Every page opens on a
navy sign that says where you are; every list is a directory of rows you walk; every price says who
confirms it. It refuses the comparator default: soft gradient hero, form-in-a-card, rows of
icon cards, eyebrow labels.

OWN-WORLD: White ground and pale cool-grey bands; flat navy sign panels with white Atkinson
Hyperlegible Next. Palette law: navy = where you are, logo blue = what you can do (links, buttons),
green = confirmed or done, orange = sponsored, red = error; nothing decorative. 4px corners, 1px
rules, no shadows, no gradients, no glass. Navy pictogram tiles drawn from flat planes. Indicative
is outlined, confirmed is solid.

STORY: The visitor sees their country and the products open there, understands that offers are
indicative and confirmed by an authorised broker, walks Pays, Produit, Offres, Demande, Courtier
along a visible route, and sends a request only after consent.

FIRST VIEWPORT: 390px: 56px white bar (flat mark + wordmark, compare icon, menu). Navy sign about
40% high: location line with the country and a change link, h1 « Comparez d'abord. Soyez
accompagné ensuite. » at 34-38px bold white, one indicative sentence. Attached white directory:
« Choisissez un produit », 64px rows (navy pictogram tile, bold name, arrow): the primary action.
1440px: the sign spans the container; headline over a two-column product directory inside the same
frame; never a split hero.

FORM: airport and bus-station wayfinding signage, position 4 of 7 on the ordered list, seed key
dab26c12. Signature interaction: the « Vous êtes ici » route strip on every journey page, stops are
links back, current stop the strongest solid mark (a white disc on the navy sign). Motion: no entrance animation; directory arrows nudge 4px on
hover and focus. Raises: fixed label grid on every offer card; solid confirmed / outlined
indicative; palette law; owned navy; flat-plane pictograms; offer columns never move.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Roll record

Seed key dab26c12 (concept-seed, scope direction, mode persuade, catalog pool c3b204a1eed6). The
roll is reproduced in `.impeccable/questions/roll-dab26c12.txt` (assigned index 4, six challengers);
the decision payload with verdicts and raises is `.impeccable/questions/direction.json`; the owner
chose the assigned card on 2026-10-05.

Grounded candidates, ordered by resonance before the roll (the roll assigned number 4):
1. Le guichet: plain public-service web writing (offered as Impeccable's pick).
2. Le banc d'essai: consumer-magazine comparison tables with explained scores.
3. La page services: newspaper service listings (pharmacies de garde, columns by commune).
4. La signalétique: airport and bus-station wayfinding signage (built).
5. Le récépissé: carbon-copy receipt book of a request filed.
6. Le fil de messages: the request as a WhatsApp-style message thread.
7. Le parapluie: the logo's umbrella and shield as page geometry (the literal reading).
Replaced before the roll on truth grounds: the insurance attestation document grammar (AssurMatch
issues no attestation, constitution I) and the mobile-money receipt (AssurMatch collects no premium).

## Unresolved

- The simplified logo (flat SVG mark) is a brand change: show it to the owner before shipping.
