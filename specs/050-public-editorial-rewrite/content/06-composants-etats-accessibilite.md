# 06 — Composants, états d'interface et accessibilité

Ce fichier documente la coquille du site (navigation, pied de page), le catalogue de composants
réutilisables, la copie exacte de chaque état d'interface, la checklist d'accessibilité WCAG 2.1 AA,
le glossaire de microcopy et les règles de dérivation anglaise. Il applique la charte éditoriale
(`00-charte-editoriale.md`) et s'appuie sur le design system existant
(`docs/ui/public-design-system.md`) : les composants ci-dessous sont à réutiliser, jamais réinventer.

Sauf mention contraire, tous les textes sont en français standard d'Afrique de l'Ouest, vouvoiement,
phrases courtes, sans superlatif ni promesse de délai. Les montants et durées d'exemple portent la
mention `[exemple]`. Les informations manquantes portent `[à confirmer]` ou
`[à vérifier juridiquement]`.

---

## 1. Coquille (shell)

### 1.1 Barre de navigation

- Composant : `SiteHeader` (`apps/public/app/components/site/site-header.tsx`), barre collante 72px
  (`--am-header`), fond verre dépoli une fois la page défilée (`data-scrolled`, gérée par
  `header-scroll-shadow.tsx`).
- Ordre des éléments (de gauche à droite) : logo (lien accueil) -> navigation centrée -> zone
  utilitaires (sélecteur de pays, switch de langue) -> CTA principal -> menu mobile (sous 960px, les
  utilitaires et la navigation passent dans le tiroir).

**Items de navigation, dans l'ordre exact** (`site-header.tsx:31-36`, namespace `Layout.nav`,
`fr.json:6-11`) :

| Ordre | Libellé FR | Route FR | Route EN | Icône mobile |
| --- | --- | --- | --- | --- |
| 1 | Comment ça marche | `/comment-ca-marche` | `/how-it-works` | `compass` |
| 2 | Pays | `/pays` | `/countries` | `globe` |
| 3 | Guides | `/guides` | `/guides` | `book-open` |
| 4 | Courtiers | `/courtiers` | `/brokers` | `briefcase` |

Le CTA principal, toujours visible (icône seule sous 480px, libellé répété dans le tiroir) :
**« Comparer les offres »** (`Common.compareOffers`, `Layout.cta`, protégé mot pour mot par
`backend/tests/guardrails/content/public-localized-wording.spec.ts`). `aria-label` identique au
libellé visible.

État courant : `NavLink` (`nav-link.tsx:30-41`) pose `aria-current="page"` sur la route active et sur
toute route descendante (ex. `/guides` reste actif sur `/guides/assurance-auto`).

**Libellé skip link** (premier élément focusable de chaque page, `Layout.skipToContent`,
`[locale]/layout.tsx:49`) : **« Aller au contenu principal »**, cible `#contenu` (le `<main id="contenu">`).

**Menu mobile** (`MobileMenu`, `mobile-menu.tsx`, tiroir plein écran en `<details>`, fonctionne sans
JavaScript) :

| Clé | Libellé FR (`Layout.menu.*`, `fr.json:13-17`) |
| --- | --- |
| Ouvrir le menu | Menu |
| Fermer le menu | Fermer le menu |
| Nom du `<nav>` du tiroir | Menu mobile |
| Lien espace courtier en pied de tiroir | Espace courtier |

Dans le tiroir, chaque lien de navigation porte en plus une icône décorative (`aria-hidden`) et un
chevron `>` décoratif ; le nom de home est identique au libellé du logo (« Accueil AssurMatch »,
`Layout.homeLink`). Le bouton de fermeture en bas du panneau (`data-menu-close`) est masqué en CSS
sans JavaScript, jamais laissé à l'écran comme un contrôle inerte.

### 1.2 Sélecteur de pays

- Composant : `CountrySelector` (`apps/public/app/components/site/country-selector.tsx`). Deux
  variantes : `compact` (barre du header, panneau du tiroir mobile) et `extended` (grille de cartes de
  la page `/pays`).
- Formulaire natif (`<form action={setVisitorCountry}>`) — note d'implémentation : le formulaire reste
  opérable sans JavaScript ; le pays choisi est stocké dans le cookie fonctionnel unique du site (voir
  D-Cookies, `_brief-agents.md`).

**Présélection et annonce du pays (spec 045, décision D6).** Le header lit le pays déjà mémorisé par
le visiteur (cookie) ; à défaut, il retient le premier pays au statut « Ouvert » de l'annuaire
(`site-header.tsx:26-29`, commentaire `SITE-102`). Le contrôle affiche donc toujours une valeur
présélectionnée plutôt qu'un champ vide, même lors de la toute première visite. Cette présélection
n'est jamais silencieuse : la page qui en dépend (accueil, page pays) rappelle en texte courant quel
pays est affiché, par exemple **« Produits comparables, courtiers partenaires autorisés et demande de
devis pour {country}. »** (`Country.description`).

**Microcopy exacte** (`Layout.countrySelector`, `fr.json:24-33`) :

| Clé | Texte FR |
| --- | --- |
| Étiquette du champ | Pays |
| Option désactivée du `<select>` | Choisir un pays |
| `aria-label` de la grille étendue | Choisir votre pays |
| Bouton d'action (variante pleine, avec texte) | Changer de pays |
| Bouton d'action (variante `dense`, icône seule, header desktop) | `aria-label="Changer de pays"`, icône `arrow-right` |
| Badge « pays ouvert » | Ouvert |
| Badge « pays pilote » | Pilote |
| Badge « pays en liste d'attente » | Pas encore ouvert |

Accessibilité : `<select>` porte `aria-label` identique au placeholder ; l'icône globe et le chevron
sont décoratifs (`aria-hidden`). Dans la variante `dense`, le bouton icône-seule conserve un
`aria-label` explicite : jamais d'icône cliquable sans nom accessible.

### 1.3 Switch de langue FR / EN

- Composant : `LanguageSwitcher` (`apps/public/app/components/ui/language-switcher.tsx`), pilule
  segmentée avec indicateur glissant, `role="group"`.
- Bascule sur l'URL localisée équivalente (params et query string conservés), donc les filtres et
  jetons de suivi survivent au changement de langue.

**Microcopy** (`Layout.languageSwitcher`, `fr.json:19-23`) :

| Cle | Texte |
| --- | --- |
| `aria-label` du groupe | Langue |
| Option FR | `lang="fr"`, `aria-label="Français"`, contenu visible « FR » |
| Option EN | `lang="en"`, `aria-label="English"`, contenu visible « EN » |

L'option active porte `aria-current="true"` et `disabled` (elle ne relance pas la même page). Version
`tone="invert"` utilisée dans le pied de page navy.

### 1.4 Fil d'Ariane

- Composant : `Breadcrumb` (`apps/public/app/components/ui/breadcrumb.tsx`), toujours passé via la
  prop `breadcrumb` du composant `Hero` (jamais un `<div class="am-container">` autonome au-dessus du
  hero — voir `docs/ui/public-design-system.md:226-230`) pour garder un alignement constant avec le
  reste de la page.
- Structure : `<nav aria-label="Fil d'Ariane"><ol>` (`Common.breadcrumbLabel`), chevrons `>` décoratifs
  entre les maillons, dernier maillon en `<span aria-current="page">` (texte, pas de lien), données
  structurées `BreadcrumbList` associées automatiquement (`breadcrumbJsonLd`).
- Sur fond navy (hero teinté `navy`), le fil s'inverse automatiquement en `primary-200` (contraste
  8.45:1, `public-design-system.md:261`). Une page sans hero (aujourd'hui : connexion courtier)
  enveloppe son fil dans `<div className="am-breadcrumbbar am-container">`.
- Exemple de fil (page produit) : Accueil > Pays > Côte d'Ivoire > Assurance auto.

### 1.5 Pied de page

- Composant : `SiteFooter` (`apps/public/app/components/site/site-footer.tsx`), bande navy,
  `aria-label="Pied de page"` (`Layout.footer.label`). Pas d'icônes de réseaux sociaux : le site n'a
  aucun compte à relier, et une rangée d'icônes pointant vers « # » serait un décor déguisé en lien.

**Structure (dans l'ordre)** :

1. **Bloc marque et contact** — logo blanc, phrase de positionnement courte : « Plateforme technique
   de comparaison indicative. » (`Layout.footer.tagline`), bouton secondaire **« Nous contacter »**
   vers `/contact`.
2. **Cinq colonnes de liens** :

   | Colonne | Titre | Contenu |
   | --- | --- | --- |
   | 1 | Pays | Les 6 premiers pays de l'annuaire (`fr.json:56-65`) + lien « Comparer les offres » |
   | 2 | Produits | Les 6 premiers produits du pays du visiteur, ou lien générique « Produits » si aucun pays n'est détecté |
   | 3 | Guides | « Tous les guides », « FAQ », « Lexique », « Comment ça marche » |
   | 4 | Légal | « Mentions légales », « Confidentialité », « Cookies », « Conditions générales d'utilisation », « Statut réglementaire » |
   | 5 | Courtiers | « Devenir partenaire », « Tarifs », « Connexion » |

   **Nouveau lien à ajouter (D-Engagement)** : la colonne « Guides » (ou une sixième colonne courte,
   au choix de l'implémentation) gagne le lien **« Notre engagement »** vers `/notre-engagement`
   (EN `/our-commitment`). C'est le même lien qui doit apparaître sur l'accueil et sur la page de
   consentement du formulaire de devis (D-Devis, étape 3). Ce libellé et cette route n'existent pas
   encore dans `apps/public/i18n/routing.ts:14-78` : à ajouter aux `pathnames` avant l'implémentation.

3. **Panneau réglementaire** (icône `shield-check`, jamais fermable — c'est un `Notice`-like, pas un
   `Notice` composant à proprement parler mais suit la même règle de non-fermeture) :
   - Phrase longue exacte (`Layout.footer.regulatorySentence`) :
     « AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec
     des courtiers partenaires autorisés. Les offres affichées sont indicatives : chaque prix
     indicatif reste à confirmer par le courtier partenaire responsable. AssurMatch ne vend pas
     d'assurance, n'émet ni contrat ni attestation et n'encaisse aucune prime. »
   - Phrase sponsorisation (`Layout.footer.sponsoredSentence`) :
     « Les pays, produits et offres visibles dépendent des activations publiques. Une offre
     sponsorisée est toujours signalée. »
   - Sur les pages anglaises uniquement, une troisième ligne (`Common.backendContentInFrench`) :
     « Certains contenus fournis par les courtiers partenaires et les assureurs restent affichés en
     français. »
4. **Barre du bas** :
   - Ligne de copyright : `© {annee} AssurMatch — Tous droits réservés.` (l'année est calculée à
     l'exécution, jamais figée ; `Layout.footer.rights`). La raison sociale exacte à citer si elle
     diffère de « AssurMatch » est `[à confirmer]` (charte, section 6).
   - Mini-liens légaux répétés : Mentions légales, Confidentialité, Cookies, Conditions générales
     d'utilisation.
   - Switch de langue (`tone="invert"`) et lien **« Retour en haut »** vers `#am-site-header`
     (icône chevron-up).

**Positionnement sentence à citer une fois par page de pied de page** : la phrase moyenne de la charte
(section 4) peut remplacer `regulatorySentence` si une version plus courte est nécessaire ailleurs,
mais le pied de page garde la version longue ci-dessus car elle est protégée comme wording de
référence.

---

## 2. Catalogue de composants

Chaque entrée : objet, anatomie, variantes, emplacements de microcopy avec texte par défaut,
exigences d'accessibilité, composant existant à réutiliser.

### 2.1 Hero

- **Objet** : bandeau d'ouverture de page (kicker, titre, intro, actions, fil d'Ariane, colonne
  secondaire optionnelle).
- **Composant existant** : `Hero` (`apps/public/app/components/ui/hero.tsx`), props `tone`
  (`light|brand|navy`), `size` (`sm|md|lg`), `breadcrumb`, `actions`, `aside`.
- **Anatomie** : kicker (majuscule discrète) -> `h1` -> paragraphe d'intro (`am-lead`, 68 caractères
  de large maximum) -> rangée d'actions (CTA principal + au plus un secondaire, règle charte n°5) ->
  colonne `aside` optionnelle (carte, formulaire d'entrée) dès 980px.
- **Microcopy par défaut** : aucune valeur générique — chaque page fournit son propre kicker/titre/
  lead ; voir les fiches de pages (fichiers 01 à 05).
- **Accessibilité** : un seul `h1` par page ; si le hero est absent, la page ne saute jamais de `h1` à
  `h3`. Sur `tone="navy"`, le contraste du texte et du fil d'Ariane est déjà vérifié
  (`public-design-system.md:261`).

### 2.2 Badges (Indicative, Sponsorisée, Mis à jour le, Offre expirée, Pilote, Pas encore ouvert)

- **Composant existant** : `Badge` (`apps/public/app/components/ui/badge.tsx`), prop `tone`
  (`approved|sponsored|new|pilot|soon|neutral`), tailles `sm|lg`, `dot` (point coloré au lieu d'une
  icône).
- Les badges de contenu ci-dessous ne sont pas tous des `tone` distincts du composant : certains sont
  du texte simple avec icône (« Mis à jour le »), d'autres réutilisent un `tone` existant.

| Badge | `tone` à utiliser | Texte par défaut | Icône | Règle de couleur |
| --- | --- | --- | --- | --- |
| Offre indicative | `neutral` (texte, pas de badge coloré — la mention est une phrase, pas un badge, voir 2.6) | « Offre indicative » | — | jamais vert ni orange |
| Sponsorisée | `sponsored` | « Sponsorisé » (carte) / « Sponsorisée » (accord au féminin quand le nom « offre » est explicite dans la phrase) | `alert-triangle` (icône par défaut du tone) ou aucune | toujours `warning-800` sur `warning-50`, jamais vert, jamais bleu marque |
| Mis à jour le | pas un badge — texte `am-caption` avec icône `clock` | « Mis à jour le {date} » (`Guides.updated`, format `24 septembre 2026`) | `clock` | neutre |
| Offre expirée | `neutral` avec icône `alert-triangle`, jamais affichée comme disponible | « Offre expirée » | `alert-triangle` | neutre, jamais rouge alarmant (ce n'est pas une erreur du visiteur) |
| Pilote | `pilot` | « Pilote » (`Common.pilot`, `Layout.countrySelector.availability.pilot`) | — | couleur du tone pilot (distincte du succès) |
| Pas encore ouvert | `soon` | « Pas encore ouvert » (`Common.soon`, `Layout.countrySelector.availability.waitlist`) | — | neutre/attente |
| Agréé (rappel : existe déjà) | `approved` | « Agréé » (`Common.approved`) | `badge-check` | seul badge vert, réservé à la licence vérifiée |

**Règle stricte (design system, non négociable)** : le vert (`--am-success-*`) ne sert qu'à valider —
jamais à « Sponsorisée », jamais à « Pilote » ni « Pas encore ouvert ». Une offre sponsorisée garde son
score inchangé et porte toujours le badge orange, y compris lorsqu'elle est en tête d'un tri qui ne
trie pas par sponsorisation (D-Tri : le tri « Sponsorisées d'abord » est retiré de l'interface
visiteur).

**Accessibilité** : chaque badge est un `<span>` avec le texte visible dans le DOM (jamais une couleur
seule) ; l'icône est décorative (`aria-hidden`). Le badge « Sponsorisée » est systématiquement
accompagné, sur la carte d'offre, d'une phrase explicite (voir `OfferCards.sponsoredTitle` :
« Placement payant du courtier partenaire, signalé et sans effet sur le score indicatif. »).

### 2.3 Carte d'offre (contrat de composant)

Le détail complet de la carte d'offre (anatomie visuelle, contenu par section, tri, filtres associés)
est traité dans le fichier `02` de ce dossier. Ce fichier ne documente que le **contrat** du
composant, tel que le catalogue de composants doit le connaître.

- **Composant existant** : rendu par `OfferCards.*` (namespace i18n) sur `Card` (`ui/card.tsx`),
  `ScorePill`, `Badge`, `BrokerBlock`, `Notice`.
- **Props attendues (contrat)** : nom de l'offre, assureur, courtier responsable (+ licence), prix
  indicatif ou `priceToConfirm`, franchise, plafond, délai de traitement, souplesse de paiement,
  garanties incluses/exclues (au moins 1 aperçu + compteur « + n garanties »), score sur 100 avec
  détail par critère, statut sponsorisé (bool + libellé), date de mise à jour, date de fin de
  validité, action « Voir le détail », action « Ajouter/Retirer de la comparaison » (`OfferCards.pick`
  / `OfferCards.picked`), action « Demander un devis ».
- **Microcopy fixes réutilisées ici** : `OfferCards.selectLabel` = « Sélectionner cette offre pour la
  comparaison » (nom accessible de la case à cocher, distinct du libellé visible « Ajouter à la
  comparaison »), `OfferCards.actionsLabel` = « Actions {name} » (regroupe les boutons de la carte
  sous un nom accessible unique par offre).
- **Accessibilité** : la carte est un `<li>` dans une liste (`Card as="li"`), jamais une `<div>` seule
  dans une grille sans sémantique de liste. Le prix « à confirmer » n'est jamais une couleur seule :
  toujours le texte `priceNotice` (« prix indicatif, à confirmer par le courtier partenaire »).

### 2.4 Score avec barre de progression

- **Composants existants** : `ScorePill` (`ui/score-pill.tsx`) pour la valeur compacte, `ProgressBar`
  (`ui/progress-bar.tsx`) pour un parcours à étapes (ne sert pas au score lui-même, réservé au
  formulaire) — le détail du score utilise plutôt une série de barres par critère dans
  `.am-criteria*` (voir fiche produit/offre, fichier 02).
- **Alternative textuelle obligatoire** : le chiffre affiché (`82/100`) est toujours entouré d'un
  `aria-label` complet porté par le conteneur, jamais lu seul par un lecteur d'écran. Texte exact
  (`Common.scoreLabel`, `OfferCards.scoreAria`) :
  **« Score indicatif : {score} sur 100 »** — exemple : « Score indicatif : 78 sur 100 ».
- **Bandes de couleur** (`scoreBand()`, `score-pill.tsx:9-13`) : `high` dès 75 (vert, `success-800` sur
  `success-100`, ratio 5.92:1), `mid` dès 50 (`primary-700` sur `primary-100`, ratio 9.33:1), `low`
  en dessous (neutre). La couleur n'est jamais le seul signal : le chiffre `/100` reste toujours
  visible dans le DOM (`aria-hidden` seulement sur l'icône éventuelle, jamais sur le chiffre).
- **Phrase de cadrage systématique à proximité du score** (`Product.scoreFineprint`) : « Le score
  reste indicatif : il n'est ni un conseil personnalisé ni un classement officiel, et la
  sponsorisation n'a aucun effet sur son calcul. »

### 2.5 Liste de garanties (incluses/exclues)

- **Composant existant** : liste `.am-pill-list` / `.am-pill` pour l'aperçu compact sur la carte
  d'offre ; tableau `criterionLabels` / `criteria` pour le détail complet.
- **Règle non négociable** : inclus/exclu n'est jamais signalé par la couleur seule. Chaque ligne
  porte une icône **et** un texte :
  - Inclus : icône `check-circle` (vert `success-*`) + texte visible **« Incluse »**
    (`OfferCards.included`).
  - Exclu : icône `x-circle` (neutre ou `danger-*` selon le fond) + texte visible
    **« Non incluse »** (`OfferCards.notIncluded`).
- **Microcopy associée** : compteur « + n garanties » au pluriel correct (`OfferCards.moreGuarantees`,
  ICU pluriel : « + 1 garantie » / « + 3 garanties »), valeur manquante = **« non renseigné »**
  (`OfferCards.notProvided`), jamais un champ vide silencieux.
- **Accessibilité** : la liste est un `<ul>` sémantique ; chaque icône est `aria-hidden`, le texte
  « Incluse »/« Non incluse » porte l'information pour un lecteur d'écran comme pour un daltonien.

### 2.6 Blocs de mention réglementaire (jamais fermables)

- **Composant existant** : `Notice` (`apps/public/app/components/ui/notice.tsx`). **Aucune fermeture
  possible** — le composant n'a pas d'affordance de fermeture et ne doit jamais en recevoir une
  (règle non négociable du design system, ligne 17 de `public-design-system.md`).
- **Variantes (`tone`)** :

  | `tone` | Usage | Rôle ARIA |
  | --- | --- | --- |
  | `indicative` | Rappel de prix/offre indicative, présent partout où un prix est montré | pas de `role` (texte de contexte permanent) |
  | `info` | Statut réglementaire général, positionnement de plateforme | pas de `role`, ou `role="status"` si le contenu change dynamiquement |
  | `success` | Confirmation passive (ex. inscription liste d'attente enregistrée) | `role="status"` |
  | `error` | Erreur bloquante sur laquelle le visiteur doit agir | `role="alert"` |

- **Textes de référence à réutiliser tels quels** (les quatre phrases de positionnement, charte
  section 4) :
  - Courte (pied de carte, bandeau) : « Offre indicative. Le prix et les conditions sont confirmés
    par le courtier partenaire. »
  - Moyenne (accueil, pages produit) : « AssurMatch compare des offres indicatives et vous met en
    relation avec un courtier autorisé. Nous ne vendons pas d'assurance, nous ne signons pas de
    contrat et nous ne recevons pas votre prime. »
  - Remuneration : « Vous ne payez rien à AssurMatch. Ce sont les courtiers partenaires qui paient un
    abonnement ou les demandes qu'ils reçoivent. »
  - Transmission (avant tout consentement) : « Rien n'est transmis tant que vous n'avez pas coché la
    case de consentement et envoyé votre demande. »
- **Bandeau de consentement produit (D-Cookies)** : ce n'est pas une bannière de cookies — c'est un
  bandeau d'information permanent, même composant `Notice tone="indicative"`, texte : **« Rien n'est
  transmis tant que vous n'avez pas donné votre accord. »**
- **Accessibilité** : l'icône du `Notice` est toujours `aria-hidden` (`notice.tsx:39-41`), le titre
  optionnel (`title`) est un `<p>` en gras avant le corps ; sur `tone="error"`, le `role="alert"`
  interrompt le lecteur d'écran — à réserver aux erreurs qui bloquent réellement une action.

### 2.7 Filtres

- **Composant existant** : `<fieldset>` / `Field` / `select` natifs sous `am-form-grid`, bouton
  « Plus de filtres » en divulgation (`<details>`).
- **4 filtres principaux visibles** (D-Filtres) : niveau de garantie minimum, garantie incluse, rythme
  de paiement, budget indicatif (min/max). Libellés existants à conserver : « Niveau de garantie
  minimum », « Garantie incluse », « Flexibilité de paiement », « Prix indicatif minimum » / « Prix
  indicatif maximum » (`Offers.minGuaranteeLevel`, `Offers.guarantee`, `Offers.paymentFlexibility`,
  `Offers.minPrice`/`maxPrice`).
- **Sous « Plus de filtres »** : franchise maximale, délai de traitement maximum, assureur, courtier
  partenaire (`Offers.maxDeductible`, `maxProcessingDays`, `insurer`, `broker`).
- **Microcopy** : légende de groupe **« Filtres »** (`Offers.filtersLabel`/`filtersLegend`), bouton
  d'application **« Appliquer les filtres »** (`Offers.apply`), bouton de réinitialisation
  **« Effacer les filtres »** (charte section 5 — remplace l'ancien libellé « Réinitialiser »),
  compteur de filtres actifs au pluriel : « 1 filtre actif » / « 3 filtres actifs »
  (`Offers.filtersActive`), aide **« Les filtres portent uniquement sur les offres indicatives
  affichées. »** (`Offers.filtersHint`).
- **Tri (D-Tri)** : options visibles au visiteur, dans cet ordre : score (par défaut), prix croissant,
  garanties (niveau décroissant), rapidité, popularité, mise à jour récente. Les options
  « Sponsorisées d'abord » et « Nom » existantes dans `Offers.sort.*` (`fr.json:395-404`) sont retirées
  de ce `<select>` côté visiteur — elles restent, le cas échéant, un tri interne non exposé.
- **Accessibilité** : chaque `<select>`/`<input>` de filtre est dans un `Field` avec `label` visible ;
  le groupe de filtres est un `<fieldset><legend>` ; le bouton « Plus de filtres » est un
  `<details><summary>` (ouverture/fermeture clavier native, pas de JS nécessaire) ; les cibles
  tactiles des contrôles restent >= 44px sur mobile.

### 2.8 Accordéons FAQ

- **Composant existant** : `<details className="am-faq__item">` (`.am-faq`, natif, chevron dessiné en
  CSS qui pivote à l'ouverture — voir `public-design-system.md:178-185`).
- **Anatomie** : `<summary>` = question (texte de bouton natif, focusable et actionnable au clavier
  sans script), `<p class="am-faq__answer">` = réponse.
- **Microcopy de section** : titre de bloc **« Questions fréquentes »** (`Faq.title`/
  `Product.faqTitle`), compteur au pluriel **« 1 question » / « 12 questions »**
  (`Faq.questionCount`).
- **Accessibilité** : `<details>`/`<summary>` sont nativement accessibles (role, état expanded/collapsed
  gérés par le navigateur) ; ne jamais remplacer par une `<div onClick>`. Un seul accordéon peut rester
  ouvert à la fois n'est pas imposé — chaque `<details>` est indépendant, plusieurs peuvent être
  ouverts simultanément.

### 2.9 Étapes numérotées

- **Composant existant** : `.am-steplist` (pages courtiers) pour une liste d'étapes statique (« Comment
  ça marche », candidature) ; `ProgressBar` (`ui/progress-bar.tsx`) pour un parcours interactif à
  étapes (formulaire de devis, candidature courtier).
- **`ProgressBar` — anatomie** : cercles numérotés reliés par un connecteur ; état `done` = coche verte,
  `current` = dégradé marque + halo, `todo` = neutre. Empilé verticalement sous 680px.
- **Microcopy** : `aria-label` du `<nav>` = **« Progression de la demande »** (`Common.progress.label`
  / `QuoteForm.progressLabel`), phrase d'étape courante lue par le lecteur d'écran, non affichée
  visuellement en double = **« Étape {current} sur {total} »** (`Common.progress.step`,
  `QuoteForm.stepStatus`) — exemple : « Étape 2 sur 4 ».
- **Libellés des 4 étapes du devis (D-Devis)** : 1. Votre besoin, 2. Vos coordonnées, 3. Vérification
  et consentement, 4. Confirmation. (Les clés existantes `QuoteForm.steps.*`,
  `fr.json:509-514`, sont dans un ordre différent — contact avant besoin — et devront être réordonnées
  à l'implémentation pour respecter D-Devis ; à signaler en note d'implémentation.)
- **Accessibilité** : l'étape courante porte `aria-current="step"` (`progress-bar.tsx:30`), l'icône de
  coche des étapes terminées est décorative, le libellé textuel de chaque étape reste toujours visible
  (jamais seulement le numéro).

### 2.10 Témoignage (défini, désactivé)

- **Statut (D-Témoignages)** : composant défini au niveau design system mais **non affiché** tant
  qu'aucun témoignage n'est vérifié. Aucune instance ne doit apparaître sur une page publiée.
- **Anatomie prévue** (à implémenter, non branchée) : citation courte, prénom + première lettre du nom
  ou fonction (jamais de nom complet sans consentement explicite), pays, produit concerné, date, et un
  badge **« Vérifié »** obligatoire une fois activé.
- **Règle d'activation qui permettrait de le sortir de désactivation** : un témoignage n'est publiable
  que s'il est (1) issu d'un visiteur ou courtier réel identifiable en interne, (2) accompagné d'un
  consentement écrit explicite à la publication, (3) vérifié par l'équipe conformité (correspondance
  entre le témoignage et une demande de devis réellement transmise), (4) horodaté. Tant que ces quatre
  conditions ne sont pas remplies pour au moins un témoignage, la section reste retirée de toutes les
  pages (pas de placeholder « bientôt des avis », pas de témoignage fictif marqué `[exemple]` affiché
  au visiteur).
- **Accessibilité (à l'activation)** : la citation est un `<blockquote>` avec `cite` si une source
  publique existe ; le badge « Vérifié » suit la même règle de couleur que « Agréé » (vert = validation
  uniquement).

### 2.11 CTA primaire / secondaire

- **Composant existant** : `Button` (`apps/public/app/components/ui/button.tsx`), `variant`
  (`primary|secondary|tertiary|ghost|whatsapp`).
- **Règle de page (charte section 2.5)** : un seul objectif par page, donc un seul CTA `primary`
  visible à la fois pour cet objectif, au plus un CTA `secondary`. Le `tertiary`/`ghost` sert aux
  actions annexes (retour, changement de filtre).
- **Libellés normalisés (charte section 5, table complète)** — à reprendre mot pour mot :

  | Contexte | Libellé exact |
  | --- | --- |
  | Aller aux offres | Comparer les offres |
  | Formulaire de devis | Demander un devis |
  | Rappel | Être rappelé par un courtier agréé |
  | Carte d'offre | Voir le détail |
  | Sélection carte | Ajouter à la comparaison / Retirer de la comparaison |
  | Lancer la comparaison | Comparer la sélection (2 à 4 offres) |
  | Étape suivante d'un formulaire | Continuer |
  | Retour formulaire | Revenir à l'étape précédente |
  | Vérification avant envoi | Vérifier ma demande |
  | Envoi final | Envoyer ma demande |
  | Courtier — devenir partenaire | Devenir partenaire |
  | Courtier — tarifs | Voir les formules |
  | Courtier — candidature | Envoyer ma candidature |
  | Courtier — connexion | Se connecter à l'espace courtier |
  | Réinitialiser des filtres | Effacer les filtres |

  Les trois premiers libellés (« Comparer les offres », « Demander un devis », « Être rappelé par un
  courtier agréé ») sont protégés par `public-localized-wording.spec.ts` : à garder mot pour mot.
- **Accessibilité** : un bouton icône-seule (`iconOnly`) porte toujours un `aria-label` explicite
  (jamais seulement un `title`) ; l'état `loading` remplace le libellé par un spinner tout en gardant
  un texte accessible équivalent (le composant `Button` gère déjà `data-loading` — ne jamais vider le
  contenu texte côté appelant).

### 2.12 Formulaire progressif (devis, candidature courtier)

- **Composants existants** : `ProgressBar`, `Field` + `fieldControlProps` (`ui/field.tsx`),
  `RadioCards` (`ui/radio-cards.tsx`) pour les choix à cartes, `.am-checkline` pour les cases à cocher
  (cible tactile 44px), `Notice` pour les rappels de consentement.
- **Repli sans JavaScript (D-Devis, D-Candidature)** : chaque parcours en étapes doit rester
  utilisable comme une seule page longue si JavaScript est indisponible — pas d'étape masquée par du
  CSS seul sans équivalent serveur.

**Anatomie générique d'une étape** :
1. Titre de section (`<legend>` ou `am-eyebrow` + `h2`) reprenant le libellé de l'étape courante.
2. Un ou plusieurs `Field` : `label` toujours visible au-dessus du contrôle, `hint` sous le contrôle
   quand une précision est utile, `error` sous le contrôle en cas d'erreur (`role="alert"`,
   `aria-describedby` déjà câblé par `fieldControlProps`).
3. **Chaque champ dit pourquoi il est demandé** (D-Devis) — texte d'aide obligatoire, pas seulement un
   placeholder. Exemples existants à reprendre : e-mail — « Utilisée par le courtier partenaire pour
   vous répondre. » (`QuoteForm.emailHint`), téléphone — « Indicatif pays compris. »
   (`QuoteForm.phoneHint`).
4. Bloc de consentement en dernière étape, **avant** l'envoi, jamais coché par défaut.
5. Boutons de navigation : « Revenir à l'étape précédente » (sauf en première étape) et « Continuer »
   (sauf en dernière étape, où « Envoyer ma demande » / « Envoyer ma candidature »).

**Identification du courtier avant consentement (D-Devis)** : si une offre est présélectionnée, le nom
du courtier responsable et son numéro d'autorisation (`BrokerBlock`, variant `line` ou `card`)
s'affichent **avant** la case de consentement, avec le texte déjà existant
**« Offre indicative présélectionnée : le courtier partenaire responsable confirmera le devis et les
conditions. »** (`QuoteForm.preselected`). Sans offre présélectionnée, le texte explique le routage :
« votre demande ira à un courtier autorisé pour ce pays et ce produit (ou jusqu'à 3 si la case
multi-courtiers est cochée), et son nom apparaîtra sur la page de suivi. » — cette phrase précise n'a
pas encore de clé i18n dédiée au moment de la rédaction : à créer à l'implémentation, en s'inspirant
de `QuoteForm.consentLabel` / `QuoteForm.multiBrokerLabel` déjà présents (`fr.json:527-528`). Aucun
délai de réponse n'est promis nulle part dans ce bloc.

**Écran de vérification (« Vérifier ma demande »)** : récapitulatif en lecture seule de toutes les
réponses saisies, groupées par étape, avec un lien « Modifier » par section qui ramène précisément à
l'étape concernée (jamais un retour générique au début du formulaire).

**Accessibilité spécifique au formulaire progressif** :
- L'ordre de tabulation suit l'ordre visuel de haut en bas, jamais un `tabindex` positif.
- Le focus se déplace sur le titre de la nouvelle étape (`h2` avec `tabindex="-1"`) après un clic sur
  « Continuer », pour qu'un lecteur d'écran annonce le changement d'étape.
- Une erreur de validation ramène le focus sur le premier champ en erreur et l'annonce via
  `role="alert"`.
- Cases à cocher de consentement : cible tactile 44px minimum (`.am-checkline`), jamais cochées par
  défaut, label entièrement cliquable.

### 2.13 Barre de comparaison

- **Composant existant** : `ComparisonBar` (`apps/public/app/components/ui/comparison-bar.tsx`),
  pilule flottante en bas d'écran, `role="region"`, masquée tant que moins de deux offres sont
  sélectionnées (`count < 2` -> `return null`, `comparison-bar.tsx:14`).
- **Sélection (D-Comparaison)** : de 2 à 4 offres. Au-delà de 4, les cases restantes se désactivent
  avec une explication visible près de la case (pas seulement un `title`) — texte suggéré :
  **« Comparaison limitée à 4 offres. Retirez-en une pour en ajouter une autre. »** — clé à créer, à
  côté de `Offers.compareHint` existant (« Cochez 2 à 4 offres puis comparez-les côte à côte. »).
- **Microcopy** : `aria-label` de la région = **« Sélection à comparer »**
  (`Common.comparisonBar.label`), compteur au pluriel = **« 1 offre sélectionnée » / « 3 offres
  sélectionnées »** (`Common.comparisonBar.count`), action = **« Comparer la sélection »**
  (`Common.comparisonBar.action` — à compléter avec le détail « (2 à 4 offres) » du libellé normalisé
  de la table CTA quand la barre est utilisée hors du bouton de fin de liste).
- **Rendu comparatif (D-Comparaison)** : tableau classique dès 768px ; en dessous, une carte par
  critère avec les offres empilées dedans, jamais de défilement horizontal forcé (l'indice de
  défilement horizontal `Compare.scrollHint` existant — « Faites défiler le tableau horizontalement
  pour voir toutes les offres. » — ne s'applique donc qu'au rendu desktop en tableau).
- **Accessibilité** : l'icône `scale` du compteur est décorative ; la barre reste opérable au clavier
  (le bouton d'action est un `Button` standard, jamais un `<div onClick>`).

### 2.14 État vide

- **Composant existant** : `EmptyState` (`apps/public/app/components/ui/empty-state.tsx`),
  `role="status"`, une seule action au maximum (jamais un bouton déjà présent ailleurs sur la page,
  règle explicite du composant, `empty-state.tsx:8-9`).
- **Anatomie** : icône (`IconTile`, ton neutre) optionnelle -> titre (`h2`) -> description -> une
  action optionnelle.
- **Microcopy générique par défaut** (`Common.emptyState`) : titre **« Rien à afficher pour le
  moment »**, description **« Modifiez vos critères ou revenez plus tard. »** — à spécialiser page par
  page (voir section 3 ci-dessous pour les variantes exactes : aucune offre, aucun résultat de filtre,
  aucun pays actif, etc.).

---

## 3. États d'interface — copie exacte

Chaque état ci-dessous donne : titre, description/corps, action(s), et la clé i18n existante quand
elle existe déjà (à conserver), ou le texte proposé à créer sinon.

### 3.1 Vide (générique)

- Composant : `EmptyState`, `tone="default"`.
- Titre : **« Rien à afficher pour le moment »** (`Common.emptyState.title`).
- Description : **« Modifiez vos critères ou revenez plus tard. »** (`Common.emptyState.description`).
- Action : aucune par défaut (à spécialiser selon le contexte).

### 3.2 Chargement (squelette + texte pour lecteur d'écran)

- Composant : `Skeleton` (`apps/public/app/components/ui/skeleton.tsx`), formes `text|title|block|
  circle`.
- Le conteneur de squelette porte `role="status"` et un texte pour lecteur d'écran uniquement
  (`.am-visually-hidden`), jamais le squelette seul : **« Chargement en cours. »**
  (`Common.loading`) — un lecteur d'écran ne doit jamais rester silencieux pendant un chargement.
- Sous `prefers-reduced-motion: reduce`, l'animation de scintillement du squelette (`am-shimmer`) est
  désactivée automatiquement (règle motion.css globale) ; le squelette reste visible sans mouvement.

### 3.3 Erreur générique

- Composant : `Notice tone="error"` ou page d'erreur dédiée selon le contexte (bloc en ligne vs. page
  entière).
- Bloc en ligne, titre optionnel + corps, `role="alert"` :
  - Titre : **« Une erreur est survenue »** (`Error.title`).
  - Corps : **« Le service public est momentanément indisponible. Réessayez dans quelques
    instants. »** (`Error.description`).
  - Action : **« Réessayer »** (`Error.retry`).
- Variante API générique (utilisée quand aucune clé spécifique n'existe) : **« Service public
  temporairement indisponible. »** (`Api.serviceUnavailable`) ou **« API publique temporairement
  indisponible. »** (`Api.apiUnavailable`).

### 3.4 Erreur réseau

Aucune clé dédiée n'existe encore ; le texte ci-dessous est proposé (à créer, namespace `Common` ou
`Error`) — il se distingue de l'erreur générique en nommant la cause probable sans jargon technique :
- Titre : **« Connexion impossible »**.
- Corps : **« Vérifiez votre connexion internet, puis réessayez. Si le problème persiste, le service
  peut être momentanément indisponible. »**
- Action : **« Réessayer »** (reprend `Error.retry`, même libellé que l'erreur générique pour ne pas
  multiplier les termes).

### 3.5 Aucune offre disponible

- Composant : `EmptyState`, `tone="muted"`, icône `search`.
- Titre : **« Aucune offre indicative pour ces critères »** (`Offers.empty.title`).
- Description : **« Modifiez vos filtres ou élargissez votre recherche. Une offre sponsorisée est
  affichée uniquement avec sa mention. »** (`Offers.empty.description`).
- Action : **« Effacer les filtres »** (reprend le libellé normalisé de la table CTA, section 2.11).

### 3.6 Aucun résultat pour les filtres

Même composant et mêmes textes que 3.5 — la charte ne distingue pas « liste vide au chargement » de
« liste vide après filtre » au niveau du texte, l'important est que l'action proposée (« Effacer les
filtres ») redonne immédiatement accès aux offres qui existent. Si l'implémentation souhaite un texte
plus précis pour l'état post-filtre, la variante suivante est proposée (à créer) :
- Titre : **« Aucune offre ne correspond à ces filtres »**.
- Description : **« Essayez d'élargir votre budget ou de réduire le niveau de garantie demandé. »**
- Action : **« Effacer les filtres »**.

### 3.7 Succès de la demande (devis)

- Composant : `Notice tone="success"` sur la page de confirmation, plus rappel visuel via `IconTile`
  ton `success`.
- Titre : **« Demande reçue »** (`QuoteForm.successTitle`, également `BrokerApply.form.success.title`
  pour la candidature).
- Référence publique affichée immédiatement, préfixe : **« Référence publique »**
  (`QuoteRequest.referenceLabel`) suivi de la référence, avec un bouton **« Copier la référence »**
  (`QuoteRequest.copy`) dont l'état après clic annonce **« Référence copiée »**
  (`QuoteRequest.copied`, à annoncer via une région `aria-live="polite"`, pas seulement un changement
  visuel de texte).
- Corps (prochaines étapes, `QuoteRequest.nextSteps`) :
  1. « Votre demande est enregistrée sous la référence ci-dessus : conservez-la pour tout échange. »
  2. « Un courtier partenaire autorisé reprend votre demande lorsque le routage est possible pour ce
     pays et ce produit. »
  3. « Vous pouvez ajouter des documents optionnels ou retirer votre consentement depuis cette page. »
- **Aucun délai de réponse n'est promis** (D-Devis) — ne jamais ajouter « sous 24h » ou équivalent.

### 3.8 Offre expirée

- Badge : « Offre expirée » (section 2.2). Ne s'affiche jamais comme une offre disponible dans une
  liste de résultats — une offre expirée est soit filtrée du listing public, soit affichée en détail
  avec ce message explicite si le visiteur suit un ancien lien.
- Titre (page détail d'offre indisponible) : **« Offre indisponible »** (`OfferDetail.unavailable.
  title`).
- Description : **« Cette offre n'est pas disponible publiquement (expirée, non validée ou courtier
  partenaire non éligible). »** (`OfferDetail.unavailable.description`) — cette phrase couvre à la
  fois 3.8, 3.9 et 3.10 aujourd'hui ; conserver ce texte commun sauf si le produit demande, à
  l'implémentation, une distinction plus fine par cause.
- Action : « Voir les pays ouverts » (`OfferDetail.backToCountries`).

### 3.9 Offre non validée

Même composant et mêmes textes que 3.8 (`OfferDetail.unavailable.*`), la cause exacte
(non validée vs. expirée vs. courtier non éligible) n'est aujourd'hui pas distinguée visuellement pour
le visiteur — volontairement : le visiteur n'a pas besoin de connaître la raison interne, seulement
que l'offre ne peut pas être reprise en l'état.

### 3.10 Courtier plus éligible

Même composant et mêmes textes que 3.8/3.9. Si une distinction devient nécessaire (ex. rediriger vers
un autre courtier du même pays/produit), le texte suivant est proposé comme variante spécifique
(à créer) :
- Titre : **« Le courtier responsable de cette offre n'est plus disponible »**.
- Description : **« Cette offre ne peut plus être reprise. Vous pouvez comparer d'autres offres pour ce
  produit. »**
- Action : « Comparer les offres ».

### 3.11 Pays fermé / liste d'attente

- Composant : page dédiée `Waitlist` + `Notice`.
- Titre : **« Liste d'attente — {country} »** (`Waitlist.title`).
- En-tete de page : **« {country} : AssurMatch n'est pas encore ouvert »** (`Waitlist.heading`).
- Corps : **« Aucune offre indicative n'est comparable et aucune demande de devis ne peut être
  transmise pour ce pays tant qu'il n'est pas ouvert. »** (`Waitlist.lead`), puis **« Un pays n'ouvre
  qu'une fois des courtiers partenaires autorisés référencés et des offres validées disponibles.
  Laissez-nous votre adresse e-mail : vous serez informé de l'ouverture publique de {country}. »**
  (`Waitlist.explanation`).
- Précision : **« Aucun parcours de devis n'est proposé depuis cette page. »** (`Waitlist.noQuote`).
- Formulaire : champ e-mail (« Adresse e-mail », aide « Utilisée uniquement pour vous prévenir de
  l'ouverture de ce pays. »), produit souhaité (facultatif, défaut « Sans préférence »), case de
  consentement obligatoire (« J'accepte d'être informé par e-mail de l'ouverture publique de ce
  pays. »), champ piège anti-robot invisible (« Ne remplissez pas ce champ »), bouton **« Être informé
  de l'ouverture »**.
- Succès : titre **« Inscription enregistrée »**, description **« Vous serez informé par e-mail de
  l'ouverture publique de ce pays. Aucune demande de devis n'a été transmise. »**
  (`Waitlist.form.successTitle/successDescription`).
- Erreur : **« Inscription impossible pour le moment. »** (`Waitlist.form.error`, cohérent avec
  `Api.waitlistFailed`).
- Complément : rappel des pays déjà ouverts (« Pays déjà ouverts » / « Vous pouvez comparer des offres
  indicatives dans ces pays. », `Waitlist.openCountriesTitle/openCountriesLead`) pour ne jamais
  laisser le visiteur dans une impasse.

### 3.12 Produit fermé

- Titre : **« Aucun produit public actif »** (`Country.productsEmpty.title`).
- Description : **« Aucune demande de devis ne peut être transmise tant qu'un produit n'est pas activé
  publiquement pour ce pays. »** (`Country.productsEmpty.description`).
- Variante « comparaison/devis non activé pour ce produit précis » (badge inline plutôt que page
  vide) : **« Comparaison non activée »** / **« Devis non activé »** (`Country.comparisonDisabled` /
  `Country.quoteDisabled`), avec l'explication associée **« La comparaison publique n'est pas activée
  pour ce produit dans ce pays. »** / **« La demande de devis n'est pas disponible pour ce produit
  dans ce pays. »** (`Country.comparisonHint` / `Country.quoteHint`).

### 3.13 Fonctionnalité désactivée par flag

Réutilise le même registre que 3.11/3.12 — une fonctionnalité masquée par un feature flag ne doit
jamais ressembler à une panne. Texte générique proposé pour un flag non couvert par une clé existante
(à créer si besoin) :
- Titre : **« Fonctionnalité non disponible pour le moment »**.
- Description : **« Cette fonctionnalité n'est pas activée pour ce pays ou ce produit. »** (aligné sur
  le ton de `VisitorAi.unavailable` / `Api.aiDisabled` : « L'assistant de lecture n'est pas disponible pour ce
  pays ou ce produit. »).
- Ne jamais employer « bientôt » ni de date : si une ouverture est prévue et confirmée, utiliser une
  date exacte (`24 septembre 2026`) fournie par l'équipe produit, sinon rester silencieux sur le
  calendrier.

### 3.14 Trop de demandes (rate limit)

- Texte générique (`Api.rateLimited`) : **« Trop de demandes. Réessayez plus tard. »**
- Variantes spécifiques déjà existantes à réutiliser selon le contexte :
  - Assistant de lecture : **« Trop de demandes d'assistance. Réessayez plus tard. »**
    (`Api.aiRateLimited`).
  - Ajout de documents : **« Trop d'envois. Réessayez plus tard. »** (`Api.documentRateLimited`).
- Aucun compte à rebours ni délai chiffré n'est promis (« réessayez dans X minutes » serait une
  promesse de délai interdite par la charte, sauf si le délai est réellement connu et fixé côté
  serveur — à confirmer avec l'équipe technique avant d'afficher un chiffre, `[à confirmer]`).

### 3.15 Page 404 (avec suggestions)

- Composants : `IconTile` (`compass`, ton neutre) + page dédiée (`app/not-found.tsx` racine en
  français par défaut, `app/[locale]/not-found.tsx` à l'intérieur de la coquille localisée).
- Titre : **« Page introuvable »** (`NotFound.title`).
- Description : **« Cette page n'existe pas ou n'est plus publiée. Vous pouvez repartir des pays
  ouverts ou comparer des offres indicatives. »** (`NotFound.description`).
- Actions : **« Comparer les offres »** (`NotFound.cta`) et **« Retour à l'accueil »**
  (`NotFound.backHome`).
- Suggestions : liste des pays actuellement ouverts (jusqu'à 8), sous le titre **« Pays ouverts »**
  (`NotFound.countriesTitle`), région liée par `aria-labelledby` à ce titre
  (`app/[locale]/not-found.tsx:36-47`).

### 3.16 Page erreur 500

- Composant : limite d'erreur racine (`apps/public/app/error.tsx`), même famille visuelle que la 404
  (`IconTile` ton `warning`, icône `alert-triangle`).
- Titre : **« Une erreur est survenue »**.
- Description : **« Le service public est momentanément indisponible. Réessayez dans quelques
  instants. »**
- Action unique : **« Réessayer »** (relance la page via `reset()`, pas un lien de navigation).
- Cette page ne peut pas utiliser `next-intl` (elle est rendue hors du segment `[locale]` en cas
  d'erreur précoce) : elle reste **toujours en français**, même sur une URL `/en/...`. C'est un choix
  technique assumé, à rappeler en note d'implémentation plutôt qu'un défaut à corriger.

---

## 4. Checklist accessibilité — WCAG 2.1 AA

### 4.1 Contraste

- Chaque paire texte/fond utilisée doit atteindre au moins 4,5:1 (texte courant) — règle non
  négociable du design system (`public-design-system.md:15`).
- Paires déjà mesurées à réutiliser sans revérification (`public-design-system.md:249-268`) :

  | Paire | Ratio |
  | --- | --- |
  | Badge « Sponsorisée » — `warning-800` sur `warning-50` | 6.95:1 |
  | Badge « Agréé » — `success-800` sur `success-50` | 6.44:1 |
  | Score bande haute — `success-800` sur `success-100` | 5.92:1 |
  | Score bande moyenne — `primary-700` sur `primary-100` | 9.33:1 |
  | Placeholder de champ — `neutral-500` sur fond blanc | 4.97:1 |
  | Fil d'Ariane sur hero navy — `primary-200` sur `--am-gradient-navy` | 8.45:1 (au point le plus clair) |
  | Bouton WhatsApp — `--am-whatsapp-ink` sur `--am-whatsapp` | 7.08:1 |

- Toute nouvelle combinaison de couleur introduite par ce dossier éditorial (aucune n'est prévue ici,
  ce fichier ne crée pas de nouveau token) devra être mesurée avant intégration, pas devinée.

### 4.2 Navigation au clavier

- Ordre de focus = ordre visuel (de haut en bas, de gauche à droite), jamais de `tabindex` positif.
- Focus visible sur chaque élément interactif : anneau `--am-ring` (marge blanche + `primary-500`) sur
  fond clair, `--am-ring-invert` sur fond navy — jamais de `outline: none` sans remplacement visible.
- Le tiroir mobile (`MobileMenu`) s'ouvre et se ferme au clavier via l'interaction native
  `<details>/<summary>` (touche Entrée/Espace sur le bouton burger).
- **Échap ferme les menus ouverts** : le tiroir mobile et tout menu déroulant doivent se fermer sur
  `Escape`, et le focus doit revenir sur le contrôle qui a ouvert le menu (le bouton burger pour le
  tiroir).
- Le fil d'Ariane, les accordéons FAQ et les `<details>` de filtres sont opérables au clavier nativement
  (pas de gestion JS supplémentaire nécessaire, ne pas la réimplémenter).
- Le lien d'évitement (« Aller au contenu principal ») est le tout premier élément atteignable à la
  tabulation sur chaque page.

### 4.3 Étiquettes de formulaire

- Chaque contrôle a un `<label>` visible associé par `htmlFor`/`id` (jamais un `placeholder` en guise
  de label) — c'est le contrat de `Field` (`ui/field.tsx:33-41`).
- Les champs obligatoires portent un astérisque visuel `aria-hidden` **et** un texte accessible
  équivalent injecté via `.am-visually-hidden` (« obligatoire », `Forms.required`) — jamais
  l'astérisque seul.
- Chaque hint et chaque erreur est reliée au contrôle par `aria-describedby` (déjà géré par
  `fieldControlProps`, `field.tsx:66-75`) ; une erreur ajoute aussi `aria-invalid="true"`.

### 4.4 Messages d'erreur explicites (« quoi + comment corriger »)

Dix exemples suivant le motif imposé — nommer ce qui est faux, puis dire comment le corriger :

1. « Adresse e-mail invalide. Vérifiez le format, par exemple nom@domaine.com. »
2. « Numéro de téléphone invalide. Utilisez le format international, par exemple +225XXXXXXXXX. »
   (`BrokerApply.form.errors.invalidPhone`, déjà conforme au motif)
3. « La date d'expiration doit être postérieure à aujourd'hui. Choisissez une date future sur votre
   document d'agrément. » (variante étendue de `BrokerApply.form.errors.licenseExpiresAtFuture`)
4. « Ce champ est obligatoire. Indiquez une valeur avant de continuer. » (variante étendue de
   `Forms.fieldRequired`)
5. « Sélectionnez au moins un produit. Cochez une case dans la liste ci-dessus. »
   (`BrokerApply.form.errors.productsRequired`, complète)
6. « Le consentement est obligatoire avant toute transmission. Cochez la case pour envoyer votre
   demande. » (variante étendue de `QuoteForm.consentRequired`)
7. « Fichier trop volumineux. Réduisez-le à 5 Mo maximum ou choisissez un autre fichier. » (variante
   étendue de `Api.documentTooLarge`)
8. « Document refusé. Utilisez un fichier PDF, JPEG ou PNG de 5 Mo maximum, cinq documents par
   demande au plus. » (variante étendue de `Api.documentRejected`)
9. « Indiquez une adresse e-mail valide. Ce champ est nécessaire pour vous informer de l'ouverture de
   ce pays. » (variante étendue de `Waitlist.form.emailRequired`)
10. « Le formulaire contient des erreurs. Corrigez les champs signalés en rouge ci-dessous avant
    d'envoyer. » (`BrokerApply.form.errors.generic`, déjà conforme — sert de récapitulatif en tête de
    formulaire quand plusieurs champs sont en erreur)

Règle commune : jamais de message réduit à « Erreur » ou « Champ invalide » seul ; toujours nommer le
champ ou le problème concret, jamais de jargon technique (pas de code d'erreur brut affiché au
visiteur sans traduction).

### 4.5 Règles de texte alternatif

- **Logos** (AssurMatch, partenaires) : texte alternatif = nom de l'entité (« AssurMatch », nom du
  courtier). Le logo AssurMatch du header est un lien : c'est le lien qui porte l'`aria-label`
  (« Accueil AssurMatch »), pas une alternative doublée sur l'image elle-même.
- **Drapeaux de pays** (emoji généré depuis le code ISO, `country-selector.tsx:31-35`) : purement
  décoratifs, toujours `aria-hidden="true"` — le nom du pays est déjà le texte du lien juste à côté,
  jamais porté uniquement par le drapeau.
- **Illustrations et icônes `lucide-react`** : décoratives par défaut (`aria-hidden`, contrat du
  composant `Icon`, `public-design-system.md:270-272`). Une icône qui est le SEUL contenu d'un
  bouton (icône seule, pas de texte visible) exige un `aria-label` explicite sur le bouton, jamais sur
  l'icône.
- **Images informatives** (captures, schémas explicatifs dans les guides) : texte alternatif qui décrit
  l'information transmise, pas la forme visuelle (« schéma des quatre étapes du parcours de devis »,
  pas « image d'un diagramme bleu »).

### 4.6 Mouvement réduit

- `prefers-reduced-motion: reduce` désactive toute animation d'entrée (`Reveal`), le scintillement des
  squelettes, le compteur animé (`CountUp` affiche directement la valeur finale, déjà rendue côté
  serveur pour le SEO) — règle globale déjà implémentée dans `base.css`/`motion.css`, à ne jamais
  contourner dans une page de contenu.
- Aucune animation en boucle infinie (`am-pulse-soft`, `am-float`) ne doit être utilisée comme seul
  porteur d'information — c'est un renfort visuel, jamais un signal exclusif.

### 4.7 Cibles tactiles 44px

- Tout contrôle interactif vise 44px de côté minimum sur mobile (40px minimum en desktop, déjà la
  règle du design system, `public-design-system.md:337`).
- Cas particuliers déjà gérés dans le code à respecter : bouton « Contact » du pied de page en taille
  par défaut plutôt que `sm` à 390px de large (commentaire `site-footer.tsx:44-45`), cases de
  consentement `.am-checkline` à 44px, sélecteur de pays compact du header à 44px
  (`chrome.css:150,166-167`).

### 4.8 Attributs de langue pour le texte backend en français sur une page anglaise

- Composant existant : `BackendText` (`apps/public/app/components/ui/backend-text.tsx`) — enveloppe
  tout contenu fourni par un courtier ou un assureur (nom de pays localisé venant de l'API, nom de
  produit, nom de courtier, description libre) avec `lang="fr"` quand la page est rendue en anglais,
  puisque ces contenus restent en français tant qu'aucune traduction partenaire n'existe.
- Règle : **chaque fois** qu'une donnée métier brute (nom de pays, nom de produit, raison sociale d'un
  courtier, description de courtier) est affichée sur une page `en`, elle passe par `BackendText`,
  jamais affichée nue dans le flux anglais. Le footer, les fiches pays/produit et `BrokerBlock`
  suivent déjà ce contrat (`site-footer.tsx:59,81`, `broker-block.tsx:61,73,75,79,91,100`).
- Sur les pages anglaises, la mention globale correspondante reste visible dans le pied de page :
  « Certains contenus fournis par les courtiers partenaires et les assureurs restent affichés en
  français. » (`Common.backendContentInFrench`).

---

## 5. Glossaire de microcopy (chaînes récurrentes)

| Emplacement | Texte FR exact | Clé i18n |
| --- | --- | --- |
| Lien d'évitement | Aller au contenu principal | `Layout.skipToContent` |
| Nom du lien logo | Accueil AssurMatch | `Layout.homeLink` |
| `aria-label` navigation principale | Navigation principale | `Layout.navLabel` |
| CTA principal (partout) | Comparer les offres | `Layout.cta` / `Common.compareOffers` |
| Bouton devis | Demander un devis | `Common.requestQuote` |
| Bouton rappel | Être rappelé par un courtier partenaire | `Common.callbackRequest` |
| Ouvrir le menu mobile | Menu | `Layout.menu.open` |
| Fermer le menu mobile | Fermer le menu | `Layout.menu.close` |
| `aria-label` du menu mobile | Menu mobile | `Layout.menu.label` |
| Lien espace courtier (tiroir) | Espace courtier | `Layout.menu.brokerSpace` |
| Libellé langue | Langue | `Layout.languageSwitcher.label` |
| Nom langue FR | Français | `Layout.languageSwitcher.fr` |
| Nom langue EN | English | `Layout.languageSwitcher.en` |
| Libellé sélecteur pays | Pays | `Layout.countrySelector.label` |
| Placeholder sélecteur pays | Choisir un pays | `Layout.countrySelector.placeholder` |
| Soumettre changement de pays | Changer de pays | `Layout.countrySelector.submit` |
| Fil d'Ariane, nom du `<nav>` | Fil d'Ariane | `Common.breadcrumbLabel` |
| Retour en haut (pied de page) | Retour en haut | `Layout.footer.backToTop` |
| Chargement en cours (lecteur d'écran) | Chargement en cours. | `Common.loading` |
| Valeur non renseignée | non renseigné | `Common.notProvided` / `OfferCards.notProvided` |
| Oui / Non (valeurs de garanties) | oui / non | `Common.yes` / `Common.no` |
| Badge Agréé | Agréé | `Common.approved` |
| Badge Sponsorisé | Sponsorisé | `Common.sponsored` |
| Badge Nouveau | Nouveau | `Common.new` |
| Badge Pilote | Pilote | `Common.pilot` |
| Badge Pas encore ouvert | Pas encore ouvert | `Common.soon` |
| Rappel indicatif court | Offre indicative, prix à confirmer par le courtier partenaire. | `Common.indicativeNotice` |
| Étiquette contenu IA | généré par IA | `Common.aiGenerated` |
| Disclaimer IA permanent | Assistance indicative d'aide à la compréhension, sans conseil personnalisé. Un courtier partenaire autorisé reste seul responsable du devis et des conditions. | `Common.aiDisclaimer` |
| Alternative textuelle du score | Score indicatif : {score} sur 100 | `Common.scoreLabel` |
| `aria-label` sélection carte offre | Sélectionner cette offre pour la comparaison | `OfferCards.selectLabel` |
| Ajouter à la comparaison | Ajouter à la comparaison | `OfferCards.pick` |
| Déjà sélectionnée | Sélectionnée | `OfferCards.picked` |
| `aria-label` barre de comparaison | Sélection à comparer | `Common.comparisonBar.label` |
| Action de comparaison | Comparer la sélection | `Common.comparisonBar.action` |
| `aria-label` progression formulaire | Progression de la demande | `Common.progress.label` |
| Étape courante (lecteur d'écran) | Étape {current} sur {total} | `Common.progress.step` |
| Champ obligatoire (texte accessible) | Champ obligatoire | `Forms.requiredMark` |
| Préfixe d'erreur de formulaire | Erreur : | `Forms.errorPrefix` |
| Confirmation d'envoi générique | Envoyé. | `Forms.success` |
| Référence publique | Référence publique | `QuoteRequest.referenceLabel` |
| Copier la référence | Copier la référence | `QuoteRequest.copy` |
| Référence copiée (annonce) | Référence copiée | `QuoteRequest.copied` |
| Titre 404 | Page introuvable | `NotFound.title` |
| Titre erreur 500 | Une erreur est survenue | `Error.title` |
| Bouton réessayer | Réessayer | `Error.retry` |
| Bandeau consentement (D-Cookies) | Rien n'est transmis tant que vous n'avez pas donné votre accord. | à créer, calqué sur `Journey.fineprint` |
| Effacer les filtres | Effacer les filtres | à créer (remplace l'ancien `Offers.reset`) |

---

## 6. Règles de dérivation anglaise

La version anglaise est dérivée clé par clé à l'implémentation, jamais traduite mot à mot depuis un
outil automatique. Même discipline qu'en français : pas de superlatif, pas de promesse de délai,
vouvoiement neutre (l'anglais ne marque pas le degré de formalité de la même façon — rester sobre et
direct, pas familier).

### 6.1 Table de correspondance des termes

| Terme FR | Terme EN | Remarque |
| --- | --- | --- |
| offre indicative | indicative offer | jamais « quote » seul pour designer l'offre affichee avant confirmation |
| prix indicatif | indicative price | jamais « estimated price » (glisse vers une promesse de precision) |
| courtier partenaire | partner broker | jamais « our broker » (AssurMatch n'a pas de courtier « a elle ») |
| courtier autorisé / agréé | licensed broker / authorised broker | choisir un seul terme et le garder constant dans tout le site anglais |
| à confirmer par le courtier partenaire | to be confirmed by the partner broker | forme systématique, jamais raccourcie en « TBC » |
| franchise | deductible (US) / excess (UK) | choisir une seule variante d'anglais pour tout le site (recommandation : « deductible », plus neutre pour un public ouest-africain habitué à l'anglais américain des plateformes internationales) `[à confirmer]` |
| plafond (de garantie) | coverage limit | jamais « cap » seul (trop familier) |
| garantie (couverture) | benefit / coverage | « garantie incluse » -> « benefit included » ; « niveau de garantie » -> « coverage level » |
| assureur | insurer | — |
| sinistre | claim | « déclarer un sinistre » -> « filing a claim » |
| attestation d'assurance | insurance certificate | — |
| carte grise | vehicle registration document | pas de calque litteral |
| carte brune CEDEAO | ECOWAS brown card | sigle CEDEAO -> ECOWAS, a garder tel quel en anglais |
| numéro d'agrément | licence number | orthographe britannique « licence » (nom) / « licensed » (adjectif, orthographe americaine du verbe) — choisir et garder une seule convention `[à confirmer]` |
| autorité de délivrance / autorité émettrice | issuing authority | — |
| mise en relation | introduction / referral | « nous mettons en relation » -> « we connect you with » |
| demande de devis | quote request | — |
| consentement | consent | « case de consentement » -> « consent checkbox » |
| plateforme technique | technical platform | garder le mot « technical » : c'est le même garde-fou réglementaire qu'en français (Constitution I) |
| espace courtier | broker portal / broker space | — |
| Notre engagement (nom de page) | Our commitment | route `/our-commitment`, alignee sur `/notre-engagement` |
| Mis à jour le {date} | Updated on {date} | format de date anglais : « 24 September 2026 » |
| Sponsorisée | Sponsored | ne jamais utiliser « featured » ou « promoted », qui suggèrent une qualité supérieure plutôt qu'un placement payé |
| Pilote (statut pays) | Pilot | — |
| Pas encore ouvert (statut pays) | Not yet open | statut d'annuaire, pas une promesse de délai de réponse |

### 6.2 Règles générales de dérivation

1. **Aucun superlatif ne doit apparaître en anglais alors qu'il était absent en français**, et
   inversement : la version anglaise applique la même liste d'interdits (section 3 de la charte),
   traduite terme à terme (« best », « leading », « number one », « guaranteed », « instant »,
   « in just a few clicks » sont interdits au même titre que leurs équivalents français).
2. **Les quatre phrases de positionnement** (charte section 4) sont traduites une fois, figées, puis
   réutilisées partout en anglais exactement comme en français — jamais reformulées page par page.
3. **`BackendText`** s'applique symétriquement : sur les pages anglaises, tout contenu partenaire brut
   reste en français et porte `lang="fr"` (section 4.8) ; il n'est jamais traduit automatiquement.
4. **Les montants restent en FCFA**, jamais convertis en devise étrangère ni reformatés
   (« 45,000 FCFA » avec virgule des milliers en anglais, `45 000 FCFA` avec espace fine en français —
   seule la ponctuation numérique change, jamais l'unité).
5. **Les dates** suivent le format long de chaque langue : `24 septembre 2026` en français,
   `24 September 2026` en anglais — jamais de format numérique ambigu (`24/09/2026` pourrait se lire
   `09/24/2026`).
6. **Les libellés de CTA normalisés** (section 2.11) sont traduits une seule fois et réutilisés à
   l'identique partout : « Compare offers », « Request a quote », « Be called back by a licensed
   broker », « View details », « Add to comparison » / « Remove from comparison », « Compare selection
   (2 to 4 offers) », « Continue », « Back to previous step », « Review my request », « Send my
   request », « Become a partner », « View plans », « Send my application », « Sign in to the broker
   portal », « Clear filters ».
7. **Chaînes protégées par un test** restent vérifiées uniquement en français aujourd'hui
   (`public-localized-wording.spec.ts` ne lit que `fr.json`) — un garde-fou équivalent sur `en.json`
   est à considérer comme un travail de suite, non couvert par ce fichier.

---

## Notes d'implémentation

- Ce fichier ne modifie aucun composant ni fichier de code : il documente le contrat existant et
  propose les textes manquants. Toute clé i18n marquée « à créer » ci-dessus doit être ajoutée dans
  `apps/public/messages/fr.json` (puis `en.json`) au moment de l'implémentation, pas devinée côté
  composant.
- La route `/notre-engagement` (FR) / `/our-commitment` (EN) n'existe pas encore dans
  `apps/public/i18n/routing.ts:14-78` : à ajouter aux `pathnames` avant de lier la page depuis le pied
  de page (section 1.5), l'accueil et la page de consentement du devis (D-Engagement).
- L'ordre des étapes du formulaire de devis dans `fr.json:509-514` (`QuoteForm.steps` : contact, besoin,
  consentement, confirmation) ne correspond pas à l'ordre imposé par D-Devis (besoin, coordonnées,
  vérification et consentement, confirmation) : à corriger à l'implémentation du formulaire, pas
  seulement dans les libellés.
- Chaînes protégées, à garder mot pour mot si elles sont touchées : « Comparer les offres »,
  « Demander un devis », « courtier partenaire » (sous-chaîne, insensible à la casse),
  « offre indicative » (sous-chaîne, insensible à la casse) — `public-localized-wording.spec.ts` ;
  « Ce qu'AssurMatch ne fait pas », « ne vend pas d'assurance », « n'émet aucun contrat ni
  attestation », « ne collecte aucune prime », « ne donne aucun conseil personnalisé engageant »,
  « AssurMatch est rémunéré par les courtiers partenaires, jamais par le visiteur », « Une offre
  sponsorisée ne peut jamais occuper la première position du seul fait d'être sponsorisée », « Une offre sponsorisée
  porte toujours un badge orange visible » — `apps/public/tests/public-institutional.spec.ts`.
- Marqueurs `[à confirmer]` utilisés dans ce fichier : raison sociale exacte du pied de page (section
  1.5), variante d'anglais retenue pour « franchise » et pour l'orthographe de « licence/license »
  (section 6.1), existence d'un délai de réponse fixe et chiffrable avant d'afficher un compte à
  rebours sur l'état de limitation de débit (section 3.14). Aucun marqueur `[à vérifier
  juridiquement]` n'était nécessaire dans ce fichier : les faits réglementaires par pays sont traités
  dans les fiches de pages dédiées, pas dans ce catalogue de composants.
