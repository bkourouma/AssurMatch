# Refonte premium du site public AssurMatch (`apps/public`, port 3601)

Date : 2026-09-20. Branche : `chore/agentic-speckit-supervisor`. Surface impactee : **Web Publique Client uniquement**
(aucun changement back-office, backend, contrats ou `packages/ui`).

## 1. Audit initial

### Stack constatee
- Next 16.2.7 App Router, React 19.2, next-intl 4 (routes localisees FR/EN, `messages/{fr,en}.json`), CSS natif avec tokens
  `--am-*` importes de `@assurmatch/ui/tokens.css` (partages avec admin/courtier : ne pas les modifier).
- Pas de Tailwind, pas de bibliotheque d'icones (21 glyphes SVG inline dans `components/ui/icons.tsx`), aucune bibliotheque
  d'animation, aucune animation hormis l'ombre du header au scroll.
- Pages : accueil, comment ca marche, pays, fiche pays, produit, offres, devis (4 etapes), detail offre, comparateur, suivi de
  demande, guides (+ detail), FAQ, lexique, contact, statut reglementaire, 4 pages legales (+ variantes pays), courtiers
  (vitrine, tarifs, candidature, connexion), 404, erreur.
- Tests statiques Playwright lisent les sources (`apps/public/tests/*.spec.ts`) : ancres a preserver (`href="/compare"`,
  `am-header__cta`, `<LanguageSwitcher`, liens du footer, `brokerLoginUrl`, honeypot `name="website"`, etc.).
- Garde-fous backend (`backend/tests/guardrails/content/*`) : vocabulaire interdit (`acheter maintenant`, `souscrire
  maintenant`, `contrat valide`, `garantie acceptee`, `la meilleure assurance du marche`), presence obligatoire de
  "plateforme technique", "comparaison indicative", "courtier partenaire", "offre indicative", "Comparer les offres",
  "Demander un devis". Parite des cles FR/EN et apostrophe droite obligatoire dans les catalogues.

### Problemes UX/UI
1. **Aucune profondeur ni hierarchie** : bandes pleine largeur alternees blanc / gris / bleu pale, sections espacees de 96 px
   avec un titre et une ou deux lignes ; aucun element visuel dans le hero ; les statistiques sont trois boites blanches.
2. **Composants generiques** : toutes les cartes sont des rectangles 1 px identiques ; boutons sans etat hover/active/loading
   travaille ; selects natifs bruts ; badges et notices monotones.
3. **Aucune animation** : pas de reveal, pas de micro-interaction, pas de count-up, menu mobile qui apparait sans transition.
4. **Header** : selecteur pays = `<select>` + bouton fleche disgracieux ; navigation sans etat actif ; CTA unique.
5. **Footer** : bloc navy dense, 6 colonnes egales, pas de barre basse, pas de reseaux sociaux, pas d'interactions.
6. **Page d'accueil** : section "signature" orpheline (une phrase en style h1 + notice) ; fil d'Ariane "Accueil" inutile ;
   formulaire d'entree perdu dans le hero.
7. **Etats** : l'etat vide du comparateur double le bouton "Comparer les offres" ; enormes espaces vides.
8. **Bugs** : page Contact leve `FORMATTING_ERROR` (variable `reference` non fournie a `Contact.reference`) ; page Courtiers
   affiche a la fois le tableau et les cartes des formules a 1440 px (la regle `@media (min-width: 681px) .am-plans-cards
   {display:none}` de `brokers.css` n'est pas appliquee, doublon a corriger).
9. **CSS global dangereux** : `button {}` style tout bouton en secondaire, `[role="alert"]`/`[role="status"]` transforment tout
   element porteur du role en boite grise (l'etat vide en herite), `label {}` global impose une marge basse.
10. **Duplication** : classes legacy `.pub-*` (steps, cards, offer, criteria, table, form grid) cote a cote avec `.am-*`.
11. **Responsive** : correct mais "desktop retreci" (cartes empilees sans reflexion), offres illisibles sur mobile (dl longue),
    tableau de score avec scroll horizontal.
12. **Accessibilite** : bonne base (skip link, labels, aria) ; a preserver ; focus visible a harmoniser ; contraste des liens
    footer (`primary-100` sur `primary-700`) a verifier.

## 2. Direction de design

**Premium + Modern + Clean + Interactive + Intelligent.** Bleu marque conserve comme couleur d'identite ; vert reserve a la
validation ; orange = sponsorise ; rien sous 14 px ; notices jamais fermables.

- **Couleurs** : echelle bleue complete (50 -> 900, dont navy profond 800/900 pour hero sombre optionnel et footer), canvas
  `#f6f8fc`, surfaces blanches, bordures `#e3e8f0`, texte 900/700/500, halo `primary-500` a 12-18 % pour les glows.
- **Typographie** : Nunito 800 pour display/headings avec `letter-spacing: -0.02em`, tailles fluides `clamp()` (display 40->60,
  h1 32->48, h2 26->36, h3 20->22), Inter 400-600 corps 16/17.
- **Espacements** : echelle 4 -> 128 ; sections 64 -> 112 px.
- **Rayons** : 8 (champs), 12 (petites cartes), 16 (cartes), 24 (panneaux/hero), pill.
- **Ombres** : `xs`, `sm`, `md`, `lg` en couches douces teintees navy + `glow` primaire pour le CTA.
- **Motion** : durees 120 / 200 / 320 / 520 ms, easing `cubic-bezier(.2,.8,.2,1)` ; reveal au scroll (fade + translateY 16 px
  + stagger), count-up des chiffres, hover elevation des cartes, fond du bouton qui glisse, menu mobile en slide,
  accordeon FAQ anime, header en verre depoli au scroll. `prefers-reduced-motion` desactive tout.
- **Icones** : `lucide-react` (coherent, 24 px, `currentColor`), via le composant `Icon` existant pour garder l'API
  `name="..."` et l'attribut `aria-hidden`.

## 3. Architecture cible

```
apps/public/app/styles/
  tokens.css        import du socle partage + extension publique (--am-pub-*)
  base.css          reset, typo fluide, focus, reduced motion (sans regles globales button/label/role)
  motion.css        keyframes, [data-reveal], stagger, utilitaires d'animation
  components.css    primitives .am-* (button, card, badge, notice, field, select, checkbox, table, faq, empty, skeleton,
                    progress, radiocards, score, aibox, broker, breadcrumb, stat) + legacy .pub-* retargetes
  chrome.css        header, menu mobile, footer, bande contact local
  pages/home.css, pages/institutional.css, pages/journey.css, brokers.css
apps/public/app/components/
  ui/               primitives revues + card.tsx, stat.tsx, skeleton.tsx, icons.tsx (lucide)
  motion/           reveal.tsx (client, IntersectionObserver), count-up.tsx (client)
  site/             header, menu, footer, contact local, selecteurs
```

Toutes les pages continuent d'utiliser `Hero`, `Section`, `Notice`, `Button`, `Badge`, `EmptyState`, `Field`. Les routes,
server actions, clients API, `lib/*`, `content/*` (hors composants de vue), `i18n/*` et `next.config.ts` ne changent pas.

## 4. Plan par page

| Page | Action principale | Refonte |
| --- | --- | --- |
| Accueil | Comparer les offres | Hero 2 colonnes (texte + carte d'entree elevee + visuel CSS d'une offre), bande de chiffres count-up avec icones, 3 etapes avec connecteurs et icones, "Notre role" en panneau fait / ne fait pas, apercu des guides, signature integree au bandeau courtier |
| Comment ca marche | Comparer | Etapes en timeline verticale illustree, panneau "ne fait pas" en checklist barree, liens en cartes |
| Pays / fiche pays | Choisir un pays / Comparer | Grille de cartes pays avec drapeau (emoji ISO) et disponibilite, produits en cartes avec icone et actions hierarchisees |
| Produit | Comparer les offres | Hero avec resume et CTA, garanties en grille d'icones, IA en panneau |
| Offres | Selectionner / Demander un devis | Filtres en panneau repliable, cartes d'offre compactes (prix, score, garanties en pastilles, details repliables), barre de comparaison flottante animee |
| Devis | Envoyer la demande | Stepper horizontal anime, formulaire en une colonne aeree, consentement en carte, assistance IA a part |
| Comparateur | Comparer | Tableau colonne par offre sticky, etat vide illustre sans doublon de bouton |
| Suivi / confirmation | Comprendre l'etat | Stepper d'etat, carte de reference, retrait de consentement en panneau |
| Guides / FAQ / lexique | Lire | Cartes editoriales avec meta, FAQ en accordeon anime, lexique en liste alphabetique |
| Contact | Envoyer | Bug `reference` corrige, radio-cards illustrees, formulaire 2 colonnes |
| Courtiers | Devenir partenaire | Hero navy, tableau des formules sans doublon, carte lead exemple, mock portail anime, CTA final |
| Tarifs | Voir les tarifs | Cartes de prix avec mise en avant Pro, criteres facturables en checklist |
| Candidature | Envoyer | Formulaire en sections numerotees |
| 404 / erreur | Revenir | Illustration icone, CTA |

## 5. Vagues et delegation

| Vague | Agent (modele) | Fichiers en ecriture | Depend de |
| --- | --- | --- | --- |
| 0 Fondation | `foundation` (Opus) | `styles/tokens.css, base.css, motion.css, components.css, globals.css`, `components/ui/**`, `components/motion/**`, `docs/ui/public-design-system.md` | - |
| 1a Chrome | `chrome` (Opus) | `components/site/**`, `[locale]/layout.tsx`, `styles/chrome.css`, cles `Layout.*` des catalogues | 0 |
| 1b Accueil + institutionnel | `home` (Opus) | `[locale]/page.tsx`, `how-it-works`, `regulatory-status`, `faq`, `glossary`, `guides/**`, `contact`, pages legales (+ `content/legal-page-view.tsx`, `legal-placeholder.tsx`), `not-found.tsx`, `app/error.tsx`, `forms/contact-form.tsx`, `styles/pages/home.css`, `styles/pages/institutional.css`, cles `Home/HowItWorks/Faq/Guides/Contact/...` | 0 |
| 1c Parcours comparateur | `journey` (Opus) | `[locale]/countries/**`, `offers/**`, `compare`, `quote-requests/**`, `components/offer-cards.tsx`, `quote-form.tsx`, `quote-document-upload.tsx`, `visitor-ai-assistant.tsx`, `public-journey.tsx`, `forms/offer-comparison-bar.tsx`, `forms/consent-withdrawal.tsx`, `forms/waitlist-form.tsx`, `styles/pages/journey.css`, cles des namespaces concernes | 0 |
| 1d Courtiers | `brokers` (Sonnet) | `[locale]/brokers/**`, `components/brokers/**`, `forms/partner-application-form.tsx`, `styles/brokers.css`, cles `Brokers*` | 0 |
| 2 Revue | `visual-qa` (Opus, lecture + captures), `a11y-perf` (Sonnet, lecture), `abracodabra:designer-ui-ux` | aucun | 1 |
| 3 Corrections | superviseur (+ Sonnet si volume) | selon les revues | 2 |

Regles : un seul proprietaire par fichier ; les catalogues `messages/*.json` sont edites par insertions locales dans le
namespace de l'agent uniquement ; aucun agent ne touche `lib/`, `i18n/`, `proxy.ts`, `next.config.ts`, `content/*.ts`
(donnees), les tests, le backend, `packages/*`. Le serveur de dev tourne deja (hot reload) : ne pas le relancer.

## 6. Validation

```
npm run typecheck
npm run lint
npx playwright test apps/public/tests
npx vitest run backend/tests/guardrails/content
node <scratchpad>/shoot.mjs <dir> "320,375,390,430,768,1024,1280,1440,1920" "<routes>"
```

Puis revue visuelle des captures a chaque largeur, controle console (aucune erreur), clavier (focus visible, menu mobile,
accordeons), `prefers-reduced-motion`.
