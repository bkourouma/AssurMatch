# 03 — Guides, FAQ, Lexique

Périmètre de cette fiche : **Web Publique Client** uniquement (`apps/public`). Applique la charte
`00-charte-editoriale.md` et les décisions D-IA, D-Guides, D-Filtres, D-Chiffres de
`_brief-agents.md`. Le livrable est en français ; la version anglaise est dérivée clé par clé à
l'implémentation, mêmes règles (pas de superlatif, pas de promesse de délai, « indicative offer »,
« to be confirmed by the partner broker »).

Sommaire : A. Fiches de page (charte §8) — B. Modèle de données à étendre — C. Production : 7
guides — D. Production : FAQ (18 questions, 4 thèmes) — E. Production : Lexique (40 termes) —
F. Notes d'implémentation transverses — G. Récapitulatif marqueurs et décisions.

---

## A. Fiches de page

### A.1 Index des guides

```
## Index des guides
- Route FR / EN : /guides — /guides
- Objectif prioritaire : donner envie d'ouvrir un guide pertinent pour son produit, sans jamais
  remplacer la comparaison par un conseil.
- Appel à l'action principal / secondaire : Lire un guide (carte) / Comparer les offres (bandeau
  de bas de page)
- Namespace i18n existant : `Guides.*` (apps/public/messages/fr.json:790-803)
- Statut : réécriture des 4 guides existants + ajout de 3 guides + ajout d'un badge produit et
  d'un temps de lecture sur chaque carte
```

#### Structure (dans l'ordre)

1. Hero — composant : `Hero` (`apps/public/app/[locale]/guides/page.tsx:29-42`)
   - Kicker : « Guides »
   - Titre : « Guides »
   - Sous-titre : « Des explications simples pour comparer sereinement, sans conseil personnalisé
     engageant. »
   - Corps / microcopie : —
   - Boutons : —
   - Données affichées (source) : fil d'Ariane (Accueil / Guides)
   - États : —

2. Filtre par produit — composant : nouveau, `GuideFilters` (léger, non-JS friendly : liens qui
   ajoutent `?produit=<key>` en query string, filtrage fait côté serveur dans la page)
   - Kicker : —
   - Titre : —
   - Sous-titre : —
   - Corps / microcopie : une ligne de puces cliquables au-dessus de la grille : « Tous »,
     « Général » (guides sans produit associé), puis un libellé par produit réellement associé à
     au moins un guide (aujourd'hui : « Auto », « Voyage »).
   - Boutons : chaque puce est un lien ; la puce active porte `aria-current="true"`.
   - Données affichées (source) : `guide.productKey`, calculé depuis `apps/public/app/content/guides.ts`
     (pas depuis l'API produits, pour rester statique et jamais vide au chargement).
   - États : vide → voir bloc 4.
   - **Décision produit prise dans cette fiche** : avec seulement 7 guides dont 5 transversaux
     (sans produit associé), un filtre à onglets serait surdimensionné aujourd'hui. Je documente
     la structure pour quand le nombre de guides augmentera, mais je recommande de livrer d'abord
     seulement le **badge produit** sur la carte (bloc 3) et de reporter le filtre actif tant que
     moins de 3 guides partagent un même produit. `[à confirmer]` par le produit.

3. Grille de guides — composant : `GuideCard` (`apps/public/app/components/institutional/guide-card.tsx`)
   - Kicker : —
   - Titre de carte : `guide.title`
   - Sous-titre : —
   - Corps / microcopie : `guide.description` (résumé, 1 à 2 phrases)
   - Boutons : lien « Lire » (icône flèche), toute la carte est cliquable
   - Données affichées (source) :
     - titre, résumé — `guides.ts`
     - badge produit si `guide.productKey` est défini (ex. « Auto », « Voyage ») — sinon aucun
       badge (pas de « Général » affiché sur la carte, réservé au filtre)
     - « Mis à jour le {date} » — `guide.updatedAt`, formaté par `formatDate`
     - « {n} min de lecture » — **calculé**, jamais saisi (voir B.2)
   - États : chargement — non pertinent (contenu statique, rendu serveur) ; erreur — non
     pertinent (pas d'appel réseau) ; vide — voir bloc 4.

4. État vide (si un filtre par produit est un jour actif et ne retourne aucun guide)
   - Titre : « Aucun guide pour ce produit »
   - Corps : « Aucun guide n'est disponible pour ce produit pour l'instant. En attendant, tous les
     guides restent utiles pour comparer une offre. »
   - Bouton : « Effacer les filtres » (libellé normalisé, charte §5)

### Notes d'implémentation — Index des guides

- `apps/public/app/content/types.ts:38-45` (`Guide`) : ajouter `keyPoints: string[]`,
  `mistakes: string[]`, `compareCta?: string` (voir B.1).
- `apps/public/app/components/institutional/guide-card.tsx:12-17` (`GUIDE_ICONS`) : ajouter les 3
  nouveaux slugs → `"comprendre-la-franchise": "percent"`, `"responsabilite-civile": "scale"`,
  `"declarer-un-sinistre": "siren"` (icônes déjà présentes dans `apps/public/app/components/ui/icons.tsx`).
- `apps/public/app/components/institutional/guide-card.tsx:19-49` : ajouter deux props optionnelles
  `productLabel?: string` et `readingTimeLabel: string`, affichées dans `CardFooter`/`CardMeta` à
  côté de la date de mise à jour.
- `apps/public/app/[locale]/guides/page.tsx:44-58` : passer `readingTimeLabel` calculé (B.2) et
  `productLabel` (nom du produit, déjà disponible via `listPublicProducts` côté `EntrySelector` — à
  défaut, si le nom exact du produit n'est pas résolu sans appel API supplémentaire, utiliser une
  version capitalisée de `productKey` `[à confirmer]`).
- Nouvelles clés `Guides.*` (`apps/public/messages/fr.json:790-803`) :
  - `"readingTime": "{minutes, plural, one {# minute de lecture} other {# minutes de lecture}}"`
  - `"filterAll": "Tous"`
  - `"filterGeneral": "Général"`
  - `"emptyTitle": "Aucun guide pour ce produit"`
  - `"emptyBody": "Aucun guide n'est disponible pour ce produit pour l'instant."`
- Chaîne protégée : le bouton du bandeau de comparaison réutilise `common("compareOffers")` =
  « Comparer les offres », gardé mot pour mot (charte §5, `public-localized-wording.spec.ts` ne
  couvre pas ce fichier mais le libellé reste normalisé partout ailleurs sur le site).

---

### A.2 Fiche guide (gabarit `/guides/[slug]`)

```
## Fiche guide
- Route FR / EN : /guides/[slug] — /guides/[slug] (même slug dans les deux langues)
- Objectif prioritaire : faire comprendre un point précis d'assurance, puis orienter vers la
  comparaison du produit concerné, sans jamais se substituer au courtier.
- Appel à l'action principal / secondaire : Comparer les offres (ciblé produit si possible) /
  Retour aux guides
- Namespace i18n existant : `Guides.*` — quelques clés à ajouter (ci-dessous)
- Statut : restructuration (nouveaux blocs points clés, erreurs à éviter, disclaimer, temps de
  lecture) + réécriture des 4 guides existants + 3 guides nouveaux
```

#### Structure (dans l'ordre)

1. Fil d'Ariane — composant : `Breadcrumb`, dans `Hero`
   - Données affichées : Accueil / Guides / {titre du guide}

2. Hero — composant : `Hero` (`apps/public/app/[locale]/guides/[slug]/page.tsx:53-69`)
   - Kicker : « Guides »
   - Titre : `guide.title`
   - Sous-titre : `guide.description` (résumé)
   - Boutons : —

3. Métadonnées — composant : nouveau bloc `am-reading__meta` étendu
   - Corps / microcopie : « Mis à jour le {date} » (icône calendrier, existant) **+** « {n} min de
     lecture » (icône horloge, nouveau)
   - Données affichées (source) : `guide.updatedAt` ; temps de lecture **calculé** sur le nombre de
     mots des sections (voir B.2), jamais saisi à la main (décision D-Guides).

4. Points clés — composant : nouveau, `GuideKeyPoints` (carte encadrée, ton neutre, icône coche)
   - Titre : « Points clés »
   - Corps / microcopie : liste de 3 à 5 puces courtes, une idée par puce
   - Données affichées (source) : `guide.keyPoints`
   - États : le bloc n'est rendu que si `keyPoints.length > 0` (toujours vrai pour les 7 guides
     livrés ici).

5. Sommaire — composant : `am-legal-toc` (existant, `apps/public/app/[locale]/guides/[slug]/page.tsx:77-91`)
   - Corps : liste de liens ancrés vers chaque section, uniquement si plus d'une section (vrai pour
     les 7 guides).

6. Sections — composant : `am-reading__section` (existant)
   - Corps / microcopie : `section.heading`, paragraphes `section.body`, puces `section.bullets` le
     cas échéant.

7. Erreurs à éviter — composant : nouveau, `GuideMistakes` (carte encadrée, ton avertissement léger,
   icône alerte — jamais un rouge d'erreur bloquante : ce ne sont pas des erreurs système)
   - Titre : « Erreurs à éviter »
   - Corps / microcopie : liste de 3 à 5 puces, formulées à l'infinitif (« Comparer uniquement... »)
   - Données affichées (source) : `guide.mistakes`

8. Ce que ce guide ne remplace pas — composant : nouveau, `GuideDisclaimer` (carte encadrée, ton
   muted, texte fixe identique sur les 7 guides, pas une donnée par guide)
   - Titre : « Ce que ce guide ne remplace pas »
   - Corps (texte fixe, à reproduire mot pour mot) :
     « Ce guide explique un principe général, pas votre situation personnelle. Il ne remplace pas
     l'analyse d'un courtier partenaire autorisé sur votre dossier, ni un avis juridique sur votre
     contrat. Pour une réponse qui vous engage, comparez les offres puis demandez un devis : un
     courtier autorisé confirmera ce qui s'applique à votre cas. »

9. Retour aux guides — composant : `Button` variant tertiaire (existant)
   - Bouton : « Retour aux guides »

10. Comparer les offres du produit — composant : `Section` tone="muted" + `EntrySelector` (existant)
    - Titre : `common("compareOffers")` = « Comparer les offres »
    - Sous-titre (appel à comparer **ciblé**) : `guide.compareCta` si défini, sinon
      `t("selectorLead")` générique.
    - Données affichées (source) : `getEntrySelectorData()`, pays et produits ouverts.
    - États : si `selector.countries.length === 0`, le bloc entier est masqué (déjà le cas
      aujourd'hui).

11. Autres guides — composant : `GuideCard` × 3 (existant)
    - Titre de section : « Autres guides »

### Notes d'implémentation — Fiche guide

- `apps/public/app/[locale]/guides/[slug]/page.tsx:71-119` : insérer les blocs 4 (points clés) et 7
  (erreurs à éviter) et 8 (disclaimer) ; ajouter le calcul du temps de lecture au bloc 3 ; remplacer
  `lead={t("selectorLead")}` (ligne 122) par `lead={guide.compareCta ?? t("selectorLead")}`.
- Nouvelles clés `Guides.*` : `"keyPointsTitle": "Points clés"`,
  `"mistakesTitle": "Erreurs à éviter"`, `"disclaimerTitle": "Ce que ce guide ne remplace pas"`,
  `"disclaimerBody"` (texte fixe ci-dessus).
- Le texte du disclaimer est un texte fixe de composant, pas une donnée `guides.ts` : éviter de le
  dupliquer dans chacun des 7 guides.

---

### A.3 FAQ

```
## FAQ
- Route FR / EN : /faq — /faq
- Objectif prioritaire : répondre aux questions de confiance avant qu'elles ne bloquent une
  demande de devis, sans jamais promettre un délai ou un résultat inventé.
- Appel à l'action principal / secondaire : Comparer les offres / —
- Namespace i18n existant : `Faq.*` (apps/public/messages/fr.json:815-824)
- Statut : réécriture des 12 questions existantes + 6 questions ajoutées + regroupement par thème
  (nouveau comportement de page)
```

#### Structure (dans l'ordre)

1. Hero — inchangé (kicker « Questions fréquentes », titre « FAQ », lead existant)

2. Compteur — « {n} questions » (`t("questionCount")`), mis à jour à 18

3. Questions groupées par thème — composant : restructuration de `apps/public/app/[locale]/faq/page.tsx:46-59`
   - Corps / microcopie : quatre groupes, dans cet ordre : **Le service**, **Les offres et le
     score**, **Ma demande et mes données**, **Les produits**. Chaque groupe est un `<h2>` suivi
     de ses `<details>` (accordéon existant, inchangé au niveau composant).
   - Données affichées (source) : `listFaq(locale)` groupé par `item.theme` dans l'ordre
     `THEME_ORDER` fixe (ne pas trier alphabétiquement : l'ordre éditorial ci-dessus est voulu).
   - États : —

4. Comparer les offres — bandeau existant, inchangé.

5. JSON-LD FAQ — inchangé, généré depuis la liste complète des 18 questions/réponses (l'ajout de
   `theme` ne casse pas `faqJsonLd`, qui ne lit que `question`/`answer`).

### Notes d'implémentation — FAQ

- `apps/public/app/content/types.ts:56-61` (`FaqItem`) : ajouter `theme?: string` (valeurs
  attendues : les 4 libellés ci-dessus, portés par les données, pas par des clés i18n).
- `apps/public/app/[locale]/faq/page.tsx:46-59` : grouper `items` par `theme` avant le rendu,
  ordre fixe des thèmes (tableau constant côté page, pas dans le contenu).
- Chaînes protégées (`public-localized-wording.spec.ts`) : ce fichier ne couvre pas `faq.ts`
  directement, mais « Comparer les offres » et « Demander un devis » restent utilisées mot pour mot
  partout où elles apparaissent, y compris ici.

---

### A.4 Lexique

```
## Lexique
- Route FR / EN : /lexique — /glossary (apps/public/i18n/routing.ts:76)
- Objectif prioritaire : donner une définition fiable d'un terme technique, avec un exemple concret
  quand ça aide à comprendre.
- Appel à l'action principal / secondaire : Comparer les offres / —
- Namespace i18n existant : `Glossary.*` (apps/public/messages/fr.json:804-814)
- Statut : réécriture des 31 termes existants (définition + exemple) + 9 termes ajoutés (40 au
  total)
```

#### Structure (dans l'ordre) — inchangée au niveau composant

1. Hero (kicker « Lexique », titre « Lexique », lead existant)
2. Rail alphabétique collant (`am-glossary-index`, existant)
3. Compteur « {n} termes expliqués », mis à jour à 40
4. Groupes par lettre, chaque terme avec définition + « Voir aussi » (existant,
   `apps/public/app/[locale]/glossary/page.tsx:83-111`) — aucun changement de composant nécessaire,
   uniquement le contenu de `glossary.ts`.
5. Comparer les offres — bandeau existant, inchangé.

### Notes d'implémentation — Lexique

- `apps/public/app/content/glossary.ts` : remplacer entièrement le tableau `fr` (voir E ci-dessous)
  par les 40 entrées ; le tri alphabétique (`sorted()`, ligne 71-73) reste inchangé et gère les
  nouveaux termes automatiquement, y compris ceux commençant par une lettre déjà groupée (« Tiers
  étendu » à côté de « Tiers »).
- Pas de changement de `types.ts` : `GlossaryEntry` (`seeAlso?: string[]`) suffit déjà pour les
  nouveaux renvois (ex. « Score indicatif » ↔ « Offre sponsorisée »).

---

## B. Modèle de données à étendre

### B.1 `Guide` (apps/public/app/content/types.ts:38-45)

```ts
export interface Guide {
  slug: string;
  title: string;
  description: string; // résumé, 1-2 phrases
  updatedAt: string;
  productKey?: string;
  keyPoints: string[];      // nouveau — 3 à 5 puces
  sections: ContentSection[];
  mistakes: string[];       // nouveau — 3 à 5 puces, "Erreurs à éviter"
  compareCta?: string;      // nouveau — sous-titre ciblé du bloc "Comparer les offres"
}
```

`readingTime` n'est **pas** un champ de données : c'est une fonction pure appliquée à `sections`
(voir B.2), conformément à la décision D-Guides (« calculé sur le nombre de mots, jamais saisi »).

### B.2 Calcul du temps de lecture

Fonction à exporter depuis `apps/public/app/content/guides.ts` :

```ts
export function guideReadingTimeMinutes(guide: Guide): number {
  const words = guide.sections
    .flatMap((section) => [...section.body, ...(section.bullets ?? [])])
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
```

200 mots/minute est une convention de lecture silencieuse standard, pas une donnée métier : elle
n'a donc pas besoin du marqueur `[à mesurer]`, mais reste un choix technique que je propose et que
l'équipe peut ajuster.

### B.3 `FaqItem` (apps/public/app/content/types.ts:56-61)

Ajouter `theme?: string`, valeur = un des 4 libellés de thème (voir A.3). Aucun impact sur
`faqJsonLd` (`apps/public/app/lib/seo.ts`, non modifié ici).

---

## C. Production — 7 guides

Format ci-dessous = les champs exacts du type `Guide` étendu. `body` : un paragraphe par ligne
(plusieurs lignes = plusieurs `<p>`).

### C.1 `assurance-auto` (réécriture)

- **title** : Comprendre l'assurance auto
- **description** (résumé) : Les garanties, la franchise et les documents utiles pour comparer des
  offres d'assurance auto en Côte d'Ivoire.
- **productKey** : `auto`
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - La responsabilité civile est la garantie de base d'une assurance auto `[à vérifier juridiquement
    pour son caractère obligatoire]`.
  - Le niveau choisi (tiers, tiers étendu, tous risques) change fortement le prix indicatif.
  - La franchise et le plafond comptent autant que le prix affiché.
  - La carte brune CEDEAO facilite les déplacements routiers dans la sous-région.
  - Les documents du véhicule et du conducteur principal accélèrent l'étude de la demande.

- **sections** :
  1. id `garanties-principales` — heading « Les garanties principales »
     - body : « Une assurance auto combine plusieurs garanties. La responsabilité civile couvre les
       dommages que vous causez à un tiers avec votre véhicule ; elle est obligatoire dans la
       plupart des pays de la sous-région `[à vérifier juridiquement]`. Au-dessus de cette base, des
       garanties complémentaires peuvent être ajoutées selon le niveau choisi : vol, incendie, bris
       de glace, ou dommages au véhicule assuré lui-même. »
     - bullets :
       - Responsabilité civile : les dommages causés à un tiers, la garantie de base.
       - Vol et incendie : le véhicule assuré lui-même, en cas de vol ou d'incendie.
       - Bris de glace : le pare-brise et les vitres.
       - Dommages tous accidents : les dommages au véhicule assuré, même en cas de responsabilité.
  2. id `niveaux-de-garantie` — heading « Tiers, tiers étendu, tous risques : les niveaux de
     garantie »
     - body : « Les offres d'assurance auto se répartissent en général en trois niveaux. Le tiers
       simple se limite à la responsabilité civile. Le tiers étendu, parfois appelé tiers plus, y
       ajoute quelques garanties choisies comme le vol ou l'incendie. Le tous risques couvre en plus
       les dommages au véhicule assuré, y compris lorsque le conducteur est responsable de
       l'accident. Le niveau choisi pèse davantage sur le prix indicatif que la plupart des autres
       critères. »
  3. id `franchise-et-plafond` — heading « Franchise et plafond de garantie »
     - body : « La franchise est la part d'un sinistre qui reste à votre charge ; le plafond de
       garantie est le montant maximal remboursé pour un sinistre. Deux offres au même prix
       indicatif peuvent proposer une franchise ou un plafond très différents. Ce sont des critères
       de comparaison aussi importants que le prix affiché, surtout pour un véhicule récent ou de
       valeur. »
  4. id `carte-brune-cedeao` — heading « La carte brune CEDEAO, pour circuler dans la sous-région »
     - body : « La carte brune CEDEAO est une attestation d'assurance responsabilité civile reconnue
       dans plusieurs pays de la Communauté économique des États de l'Afrique de l'Ouest. Elle
       permet de circuler en véhicule d'un pays membre à un autre sans souscrire une nouvelle
       assurance à chaque frontière. Les conditions d'émission, sa durée de validité et les pays
       couverts exactement dépendent de l'assureur et de la réglementation en vigueur `[à vérifier
       juridiquement]`. Si vous prévoyez un déplacement routier vers un pays voisin, vérifiez avant
       de partir si votre offre l'inclut ou si elle doit être demandée séparément. »
  5. id `documents-utiles` — heading « Documents utiles pour une demande de devis »
     - body : « Avant de demander un devis, il est utile de préparer : »
     - bullets :
       - la carte grise du véhicule ;
       - le relevé d'information de l'assureur précédent, si disponible ;
       - le permis de conduire du conducteur principal ;
       - un justificatif de bonus-malus, lorsque l'assureur précédent en délivre un.
  6. id `comparer-et-demander` — heading « Comparer puis demander un devis »
     - body : « Une fois les garanties comprises, la comparaison des offres indicatives permet de
       repérer les niveaux de garantie et les franchises proposés par les courtiers partenaires pour
       ce produit dans le pays choisi. Le prix définitif, la carte brune si elle est incluse, et les
       conditions exactes sont confirmés par le courtier partenaire après étude de la demande. »

  (≈ 620 mots de corps)

- **mistakes** :
  - Comparer uniquement le prix sans regarder le niveau de garantie retenu.
  - Partir en déplacement sous-régional sans vérifier la validité de la carte brune CEDEAO `[à
    vérifier juridiquement]`.
  - Ignorer la franchise annoncée, qui reste à votre charge en cas de sinistre.
  - Donner des informations approximatives sur le véhicule ou le conducteur, ce qui peut modifier le
    prix confirmé par le courtier.
  - Attendre l'expiration du contrat en cours pour commencer à comparer.

- **compareCta** : Comparez les offres d'assurance auto disponibles pour votre pays.

### C.2 `assurance-voyage` (réécriture)

- **title** : Comprendre l'assurance voyage
- **description** : Ce que couvre une assurance voyage, ce qu'elle ne couvre pas, et ce qu'il faut
  vérifier avant un déplacement vers l'espace Schengen ou ailleurs.
- **productKey** : `voyage`
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - Frais médicaux, rapatriement, annulation et bagages : l'étendue exacte dépend de chaque offre.
  - Un visa Schengen impose une couverture minimale et une durée qui couvre tout le séjour `[à
    vérifier juridiquement]`.
  - Le délai de traitement affiché est celui de l'étude de la demande, pas un délai de
    remboursement.
  - Les exclusions courantes méritent d'être lues avant de comparer sur le seul prix.

- **sections** :
  1. id `ce-que-couvre-lassurance-voyage` — heading « Ce que couvre une assurance voyage »
     - body : « Une assurance voyage couvre généralement les frais médicaux et l'hospitalisation à
       l'étranger, le rapatriement, l'annulation ou l'interruption du voyage, et parfois la perte,
       le vol ou le retard de bagages. L'étendue exacte, les plafonds de remboursement et les
       exclusions dépendent de chaque offre. »
     - bullets :
       - Frais médicaux et hospitalisation à l'étranger.
       - Rapatriement sanitaire.
       - Annulation ou interruption de voyage.
       - Bagages perdus, volés ou retardés, selon l'offre.
  2. id `visa-schengen` — heading « Le cas particulier du visa Schengen »
     - body : « Un visa Schengen exige en général une assurance voyage avec un montant minimal de
       couverture médicale et de rapatriement, souvent autour de 30 000 euros `[à vérifier
       juridiquement]`, valable pour toute la durée du séjour prévu dans l'espace Schengen. Une
       couverture insuffisante ou une date de fin antérieure à la date de retour peut entraîner un
       refus de visa ou un problème à l'entrée du territoire. Vérifiez ce montant et cette durée
       avant de choisir une offre, en particulier lorsque la date de départ est proche. »
  3. id `delai-de-traitement` — heading « Le délai de traitement affiché »
     - body : « Le délai de traitement indiqué sur une offre correspond au temps annoncé pour
       l'étude de la demande par le courtier partenaire, pas à un délai de remboursement en cas de
       sinistre. Il vaut la peine de comparer ce délai lorsque le voyage est proche. »
  4. id `exclusions-courantes` — heading « Exclusions courantes »
     - body : « Les activités à risque non déclarées, les zones déconseillées par les autorités, ou
       une pathologie préexistante non signalée figurent parmi les exclusions les plus fréquentes.
       Chaque offre affiche ses propres exclusions : elles méritent d'être lues avant de comparer
       sur le seul critère du prix. »
  5. id `comparer-et-demander` — heading « Comparer puis demander un devis »
     - body : « La comparaison des offres indicatives pour ce produit permet de repérer rapidement
       les garanties couvertes et le délai de traitement annoncé. Le courtier partenaire confirme
       ensuite le prix et les conditions exactes. »

  (≈ 500 mots de corps)

- **mistakes** :
  - Souscrire une couverture dont le montant est inférieur au minimum exigé pour le visa `[à
    vérifier juridiquement]`.
  - Choisir une date de fin de couverture antérieure à la date de retour prévue.
  - Ne pas déclarer une activité à risque ou une zone déconseillée par les autorités.
  - Comparer uniquement le prix sans vérifier le plafond de remboursement médical.
  - Demander un devis la veille du départ, sans laisser de temps à l'étude du dossier.

- **compareCta** : Comparez les offres d'assurance voyage disponibles pour votre pays.

### C.3 `lire-un-prix-indicatif` (réécriture)

- **title** : Lire un prix indicatif
- **description** : Pourquoi le prix affiché n'est pas définitif, et comment le score aide à
  comparer au-delà du seul prix.
- **productKey** : aucun (transversal)
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - Le prix affiché est une estimation, sans valeur contractuelle.
  - Le prix définitif dépend d'informations vérifiées par le courtier partenaire après étude du
    dossier.
  - Plusieurs éléments (garanties retenues, franchise, documents) peuvent faire varier le prix
    confirmé.
  - Le score sur 100 aide à comparer plusieurs critères à la fois, pas seulement le prix.

- **sections** :
  1. id `pourquoi-indicatif` — heading « Pourquoi un prix est indicatif »
     - body :
       - « Le prix affiché à côté d'une offre est calculé à partir des informations disponibles au
         moment de la comparaison. Il n'a pas de valeur contractuelle : c'est une estimation, jamais
         un engagement de prix final. »
       - « Le prix définitif dépend d'informations que seul le courtier partenaire vérifie
         précisément (situation exacte, historique, documents fournis) et qu'il confirme après
         étude de la demande. »
  2. id `ce-qui-peut-le-faire-varier` — heading « Ce qui peut faire varier le prix définitif »
     - body : « Plusieurs éléments, propres à chaque produit, peuvent modifier le prix confirmé par
       le courtier : »
     - bullets :
       - des informations complémentaires demandées lors de l'étude du dossier ;
       - le niveau de garantie finalement retenu ;
       - la franchise choisie ;
       - des documents justificatifs à fournir.
  3. id `score-indicatif` — heading « Score indicatif, un repère au-delà du prix »
     - body : « Chaque offre affiche aussi un score sur 100, calculé à partir de plusieurs critères
       : le prix, le niveau de garantie, la franchise, la rapidité annoncée et la souplesse de
       paiement. Un prix bas avec un score faible signale en général une offre moins complète sur
       les autres critères. Le score aide à comparer plusieurs offres d'un coup d'œil, sans
       remplacer la lecture du détail de chacune. »
  4. id `comparer-utilement` — heading « Comparer utilement plusieurs offres »
     - body : « Comparer uniquement le prix indicatif le plus bas peut être trompeur : deux offres
       au même prix peuvent proposer des garanties, une franchise ou un délai de traitement très
       différents. Le score affiché sur chaque offre tient compte de plusieurs de ces critères, pas
       seulement du prix. »

  (≈ 520 mots de corps)

- **mistakes** :
  - Choisir une offre uniquement parce que son prix indicatif est le plus bas.
  - Oublier que le prix affiché peut changer une fois le dossier étudié par le courtier.
  - Comparer deux offres sans vérifier leur niveau de garantie ni leur franchise.
  - Ignorer le score au profit du seul prix affiché.

- **compareCta** : Comparez les offres indicatives disponibles pour votre pays et votre produit.

### C.4 `choisir-un-courtier` (réécriture)

- **title** : Choisir un courtier partenaire
- **description** : Ce que fait un courtier partenaire autorisé, et comment savoir à qui votre
  demande sera transmise.
- **productKey** : aucun (transversal)
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - Le courtier partenaire confirme le devis et engage sa responsabilité professionnelle, pas
    AssurMatch.
  - Seuls des courtiers autorisés pour le pays et le produit concernés reçoivent une demande.
  - Le numéro de licence d'un courtier, lorsqu'il est disponible, est affiché sur sa fiche.
  - Une demande peut être transmise à plusieurs courtiers si vous l'acceptez explicitement.

- **sections** :
  1. id `role-du-courtier` — heading « Le rôle du courtier partenaire »
     - body : « Le courtier partenaire est l'interlocuteur qui confirme le devis, ajuste les
       conditions si nécessaire et accompagne la souscription. C'est lui, et non AssurMatch, qui
       répond des engagements pris avec vous. »
  2. id `courtiers-autorises` — heading « Des courtiers autorisés uniquement »
     - body : « AssurMatch met en relation le visiteur uniquement avec des courtiers partenaires
       autorisés pour le pays et le produit concernés. Le numéro de licence et l'autorité de
       délivrance d'un courtier, lorsqu'ils sont disponibles, sont affichés sur sa fiche. »
  3. id `un-seul-ou-plusieurs-courtiers` — heading « Un seul courtier, ou plusieurs si vous
     l'acceptez »
     - body : « Par défaut, une demande de devis est transmise à un seul courtier partenaire,
       responsable du pays et du produit concernés. Si vous cochez la case prévue à cet effet lors
       de la demande, elle peut être transmise à plusieurs courtiers autorisés, dans la limite
       prévue, pour comparer leurs réponses. »
  4. id `comment-orienter-son-choix` — heading « Comment orienter son choix »
     - body : « Au-delà du prix indicatif, le niveau de garantie, la franchise et le délai de
       traitement annoncés par chaque offre donnent une première indication. Le nom du courtier
       responsable d'une offre, et son numéro d'agrément lorsqu'il est affiché, s'affichent avant la
       case de consentement, pour que vous sachiez à qui votre demande sera transmise. »

  (≈ 500 mots de corps)

- **mistakes** :
  - Confirmer une demande sans avoir lu le nom du courtier responsable et, si affiché, son numéro
    d'agrément.
  - Croire qu'AssurMatch confirme elle-même le devis ou le contrat.
  - Ne comparer que le prix indicatif sans regarder le délai de traitement annoncé par le courtier.
  - Oublier que le contrat final se signe avec le courtier ou l'assureur, jamais avec AssurMatch.

- **compareCta** : Comparez les offres et voyez le courtier responsable de chacune.

### C.5 `comprendre-la-franchise` (nouveau)

- **title** : Comprendre la franchise
- **description** : Ce que veut dire une franchise, comment elle est appliquée en cas de sinistre,
  et pourquoi elle change le montant que vous recevez.
- **productKey** : aucun (transversal)
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - La franchise reste à votre charge, avant que l'indemnisation de l'assureur ne s'applique.
  - Elle peut être fixe ou proportionnelle, et parfois différente selon le type de sinistre `[à
    vérifier juridiquement]`.
  - Une franchise basse va en général avec une prime plus élevée.
  - Deux offres au même prix indicatif peuvent avoir des franchises très différentes.

- **sections** :
  1. id `ce-quest-une-franchise` — heading « Ce qu'est une franchise »
     - body : « La franchise est la part d'un sinistre qui reste à votre charge, avant que
       l'indemnisation de l'assureur ne s'applique. Si un sinistre est évalué à 200 000 FCFA
       `[exemple]` et que la franchise du contrat est de 30 000 FCFA `[exemple]`, l'assureur verse
       170 000 FCFA `[exemple]` et les 30 000 FCFA `[exemple]` restants restent à votre charge. »
  2. id `franchise-fixe-ou-proportionnelle` — heading « Franchise fixe ou franchise proportionnelle »
     - body : « Une franchise peut être fixe, un montant identique quel que soit le sinistre, ou
       proportionnelle, un pourcentage du montant du sinistre, parfois avec un plancher et un
       plafond. Certains contrats appliquent aussi une franchise différente selon le type de
       sinistre, par exemple un montant plus bas pour un bris de glace que pour un accident. La
       façon exacte dont une franchise est calculée est précisée dans les conditions de chaque
       offre `[à vérifier juridiquement pour les règles de calcul]`. »
  3. id `comment-elle-sapplique` — heading « Comment elle s'applique lors d'un sinistre »
     - body : « Au moment de l'indemnisation, l'assureur évalue d'abord le montant du sinistre, puis
       en déduit la franchise prévue par le contrat avant de verser le reste. Si le montant du
       sinistre est inférieur à la franchise, aucune indemnisation n'est versée : c'est pourquoi il
       est utile de connaître ce seuil avant de choisir une offre, pas seulement au moment de
       déclarer un sinistre. »
  4. id `franchise-basse-pas-toujours-adaptee` — heading « Une franchise basse n'est pas toujours le
     bon choix »
     - body : « Une franchise plus basse va en général avec une prime plus élevée : l'assureur
       couvre une part plus grande du risque et le fait payer en amont. À l'inverse, une franchise
       plus haute réduit souvent le prix indicatif, au prix d'un reste à charge plus important en
       cas de sinistre. Le bon niveau dépend de votre capacité à absorber ce reste à charge le jour
       où un sinistre survient, pas seulement du prix affiché aujourd'hui. »
  5. id `comparer-les-franchises` — heading « Comparer les franchises entre offres »
     - body : « Deux offres au même prix indicatif peuvent afficher des franchises très différentes.
       Le comparateur affiche la franchise de chaque offre à côté du prix et du niveau de garantie,
       pour permettre cette lecture avant de demander un devis. »

  (≈ 560 mots de corps)

- **mistakes** :
  - Choisir une offre uniquement sur le prix, sans regarder la franchise annoncée.
  - Confondre la franchise avec le plafond de garantie.
  - Ne pas vérifier si la franchise change selon le type de sinistre.
  - Apprendre le montant de la franchise seulement au moment de déclarer un sinistre.

- **compareCta** : Comparez le niveau de garantie et la franchise, pas seulement le prix.

### C.6 `responsabilite-civile` (nouveau)

- **title** : La responsabilité civile, simplement
- **description** : La garantie qui couvre les dommages causés à autrui : ce qu'elle couvre, ce
  qu'elle ne couvre pas, et pourquoi elle est souvent obligatoire.
- **productKey** : aucun (transversal — présente dans plusieurs produits)
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - La RC couvre les dommages causés à un tiers, pas les dommages que vous subissez vous-même.
  - Elle est souvent obligatoire pour circuler en véhicule, encadrée par le code CIMA `[à vérifier
    juridiquement]`.
  - Elle se retrouve dans plusieurs produits (auto, habitation, activité professionnelle), avec des
    règles propres à chacun.
  - Une garantie complémentaire est nécessaire pour couvrir vos propres dommages.

- **sections** :
  1. id `ce-que-couvre-la-rc` — heading « Ce que couvre la responsabilité civile »
     - body : « La responsabilité civile couvre les dommages que vous causez à un tiers, c'est-à-dire
       à toute personne autre que vous-même et l'assureur : un piéton blessé, un véhicule endommagé,
       un logement voisin dégradé. Elle indemnise la victime, dans la limite du plafond prévu par le
       contrat, pas vous-même pour vos propres dommages. »
  2. id `pourquoi-souvent-obligatoire` — heading « Pourquoi elle est souvent obligatoire »
     - body : « Dans plusieurs pays de la sous-région, la responsabilité civile automobile est une
       garantie obligatoire avant de circuler avec un véhicule, encadrée par le code CIMA et les
       réglementations nationales `[à vérifier juridiquement]`. Rouler sans cette garantie expose à
       des sanctions et laisse l'ensemble des dommages causés à un tiers à votre charge. »
  3. id `ce-quelle-ne-couvre-pas` — heading « Ce qu'elle ne couvre pas »
     - body : « La responsabilité civile ne couvre pas vos propres dommages : ni votre véhicule, ni
       votre logement, ni vos blessures si vous êtes seul en cause. Pour ces situations, il faut une
       garantie complémentaire, comme le tous risques pour un véhicule ou une garantie dommages aux
       biens pour un logement. »
  4. id `rc-dans-plusieurs-produits` — heading « La responsabilité civile dans plusieurs produits »
     - body : « La responsabilité civile ne concerne pas que l'automobile. Une assurance habitation
       inclut le plus souvent une responsabilité civile pour les dommages causés par le logement à
       un voisin ou un tiers, par exemple un dégât des eaux. Une activité professionnelle peut
       nécessiter sa propre responsabilité civile, distincte de celle du particulier. Chaque produit
       a ses règles propres, précisées dans les conditions de l'offre `[à vérifier juridiquement pour
       l'étendue exacte selon le produit]`. »
  5. id `comparer-les-offres-avec-rc` — heading « Comparer les offres qui incluent la responsabilité
     civile »
     - body : « Sur AssurMatch, la responsabilité civile figure parmi les garanties affichées pour
       chaque offre du produit concerné. Elle est présente dans la quasi-totalité des offres auto ;
       pour les autres produits, vérifiez-la au cas par cas avant de comparer. »

  (≈ 540 mots de corps)

- **mistakes** :
  - Confondre responsabilité civile et assurance tous risques : la RC ne couvre pas votre propre
    véhicule.
  - Rouler avec une attestation RC expirée.
  - Croire que la RC d'un produit couvre automatiquement un autre produit.
  - Penser que la RC indemnise vos propres blessures ou vos propres biens.

- **compareCta** : Comparez les offres qui incluent la responsabilité civile pour votre produit.

### C.7 `declarer-un-sinistre` (nouveau)

- **title** : Déclarer un sinistre : les bons réflexes
- **description** : Les étapes et les délais à connaître pour déclarer un sinistre à son assureur
  ou son courtier, sans compromettre l'indemnisation.
- **productKey** : aucun (transversal)
- **updatedAt** : `2026-09-24`
- **keyPoints** :
  - Le contrat fixe un délai de déclaration : le dépasser peut réduire l'indemnisation `[à vérifier
    juridiquement]`.
  - Un dossier complet (constat, justificatifs, photos) accélère l'étude par l'assureur.
  - Le versement peut, selon l'assureur, se faire par virement ou par Mobile Money `[à confirmer
    selon l'assureur]`.
  - Le courtier partenaire accompagne la déclaration, mais ne décide pas seul de l'indemnisation.

- **sections** :
  1. id `premiers-reflexes` — heading « Les premiers réflexes après un sinistre »
     - body : « Après un accident, un vol ou un incendie, la priorité est la sécurité des personnes.
       Vient ensuite la collecte de preuves : photos des dommages, coordonnées des témoins, et, pour
       un accident de la route, le constat amiable rempli et signé sur place avec l'autre conducteur
       lorsque c'est possible. Ces éléments accompagnent la déclaration transmise à l'assureur ou au
       courtier partenaire. »
  2. id `delai-de-declaration` — heading « Le délai de déclaration fixé par le contrat »
     - body : « Chaque contrat d'assurance fixe un délai pour déclarer un sinistre à l'assureur, en
       général compté en jours ouvrés à partir de l'événement ou de sa découverte. Dépasser ce délai
       peut réduire l'indemnisation, voire la remettre en cause selon les conditions du contrat `[à
       vérifier juridiquement]`. En cas de doute sur le délai applicable, le plus sûr est de
       prévenir le courtier partenaire dès que possible, sans attendre d'avoir réuni tous les
       documents. »
  3. id `documents-a-reunir` — heading « Les documents à réunir selon le sinistre »
     - body : « Les pièces attendues dépendent du type de sinistre. Pour un accident de véhicule : le
       constat amiable, et un procès-verbal de police si nécessaire. Pour un sinistre lié à un
       voyage : les justificatifs médicaux, les factures et, en cas d'annulation, la preuve de
       l'événement qui l'a motivée. Pour un dégât dans un logement : des photos datées et les
       factures des biens endommagés. Le courtier partenaire précise la liste exacte selon le
       contrat concerné. »
  4. id `versement-de-lindemnisation` — heading « Le versement de l'indemnisation »
     - body : « Une fois le dossier étudié et validé par l'assureur, l'indemnisation est versée selon
       les moyens proposés par l'assureur, qui peuvent inclure un virement bancaire ou, de plus en
       plus, un versement par Mobile Money `[à confirmer selon l'assureur]`. Le délai de versement
       dépend du dossier et n'est pas le même que le délai de traitement affiché sur une offre au
       moment de la comparaison, qui concerne l'étude initiale de la demande de devis. »
  5. id `ce-qui-peut-retarder` — heading « Ce qui peut retarder ou compromettre l'indemnisation »
     - body : « Un dossier incomplet, une déclaration tardive ou des informations inexactes
       retardent l'étude du sinistre et peuvent réduire le montant versé. Une fausse déclaration,
       même partielle, expose à un refus d'indemnisation et à d'autres conséquences prévues par le
       contrat `[à vérifier juridiquement]`. Relire les exclusions de son contrat avant de déclarer
       permet d'éviter de mauvaises surprises sur ce qui est réellement couvert. »

  (≈ 620 mots de corps)

- **mistakes** :
  - Attendre plusieurs semaines avant de prévenir l'assureur ou le courtier.
  - Ne pas remplir ou signer le constat amiable sur place lors d'un accident.
  - Ne pas conserver les factures ou justificatifs originaux.
  - Modifier ou arranger les faits déclarés, ce qui peut être considéré comme une fausse déclaration
    `[à vérifier juridiquement]`.
  - Ne pas relire les exclusions de son contrat avant de déclarer.

- **compareCta** : Comparez les offres avant un déplacement ou un renouvellement, pour connaître les
  conditions annoncées.

---

## D. Production — FAQ (18 questions, 4 thèmes)

Compteur de page : `t("questionCount", { count: 18 })`.

### Thème « Le service »

1. **AssurMatch vend-il de l'assurance ?**
   Non. AssurMatch est une plateforme technique de comparaison indicative et de mise en relation
   avec des courtiers partenaires autorisés. Elle ne vend pas d'assurance, n'émet aucun contrat ni
   attestation et ne collecte aucune prime.

2. **AssurMatch me fait-il payer quelque chose ?**
   Non. Comparer des offres et demander un devis sont gratuits pour vous. Vous ne payez rien à
   AssurMatch : ce sont les courtiers partenaires qui paient un abonnement et les demandes
   qualifiées qu'ils reçoivent.

3. **Le contenu généré par l'assistant de lecture remplace-t-il l'avis d'un professionnel ?**
   Non. Tout contenu généré automatiquement porte la mention « Réponse générée automatiquement par
   un outil d'IA. Aide à la lecture, pas un conseil. » Il aide à comprendre une offre ou un terme,
   sans donner de conseil personnalisé engageant. Le courtier partenaire autorisé reste seul
   responsable du devis et des conditions.

4. **Que se passe-t-il si mon pays n'est pas encore disponible ?**
   Certains pays sont en phase pilote ou en liste d'attente. La page des pays indique leur statut ;
   vous pouvez être informé de l'ouverture publique d'un pays dès qu'elle a lieu.

### Thème « Les offres et le score »

5. **Qui confirme le prix final ?**
   Le courtier partenaire responsable de votre pays et de votre produit. Chaque prix affiché sur
   AssurMatch est indicatif : il est confirmé, et ajusté si nécessaire, par ce courtier après étude
   de votre demande.

6. **Pourquoi le prix final peut-il différer du prix indicatif ?**
   Parce que le prix affiché est calculé à partir des informations disponibles au moment de la
   comparaison, sans vérification individuelle du dossier. Le courtier partenaire peut ajuster ce
   prix après avoir vérifié votre situation exacte, votre historique ou des documents
   complémentaires.

7. **Comment sont classées les offres affichées ?**
   Par défaut, selon un score indicatif décrit ci-dessous. Vous pouvez aussi trier par prix
   croissant, par niveau de garantie décroissant, par rapidité, par popularité ou par mise à jour
   récente.

8. **Comment le score est-il calculé ?**
   Le score sur 100 affiché sur chaque offre tient compte du prix, du niveau de garantie, de la
   franchise, de la rapidité annoncée, de la souplesse de paiement, de la qualité de l'information
   fournie par le courtier et, lorsque vous l'avez indiquée, de votre préférence. Une offre
   sponsorisée suit le même calcul : le fait d'être sponsorisée ne modifie pas son score.

9. **Qu'est-ce qu'une offre sponsorisée ?**
   Une offre dont le courtier partenaire a un partenariat commercial avec AssurMatch, signalée par
   un badge orange. Cela ne change ni son prix indicatif ni ses garanties, et elle ne peut jamais
   occuper la première position du classement du seul fait d'être sponsorisée.

10. **Que veut dire « prix indicatif, à confirmer par le courtier partenaire » ?**
    Que le montant affiché est une estimation calculée à partir des informations disponibles au
    moment de la comparaison, sans valeur contractuelle. Le prix définitif est confirmé par le
    courtier partenaire après étude de votre demande.

### Thème « Ma demande et mes données »

11. **Combien de temps pour être rappelé ?**
    Aucun délai n'est promis à ce jour : il dépend du courtier partenaire auquel votre demande est
    transmise. La page de suivi de votre demande indique son état ; un délai moyen observé sera
    affiché ici dès qu'il pourra être mesuré de façon fiable `[à mesurer]`.

12. **Mes données sont-elles transmises à un seul courtier ou à plusieurs ?**
    Par défaut, à un seul courtier partenaire responsable de votre pays et de votre produit. La
    demande peut être transmise à plusieurs courtiers uniquement si vous l'acceptez explicitement
    lors de la demande.

13. **Puis-je demander un devis à plusieurs courtiers en même temps ?**
    Oui, si vous cochez la case prévue à cet effet à l'étape de vérification de votre demande. Sans
    cette case cochée, votre demande va à un seul courtier autorisé pour votre pays et votre
    produit.

14. **Comment retirer mon consentement après une demande de devis ?**
    Depuis la page de suivi de votre demande, accessible par le lien reçu après l'envoi, une action
    permet de retirer votre consentement à tout moment. Sans ce lien, la page Contact permet d'en
    faire la demande.

15. **Comment modifier ou supprimer mes données ?**
    Vous disposez d'un droit d'accès, de rectification et d'effacement de vos données. Pour une
    demande de devis déjà transmise, retirez votre consentement depuis la page de suivi liée à
    cette demande. Pour toute autre demande sur vos données, écrivez-nous via la page Contact.

### Thème « Les produits »

16. **Quels produits d'assurance puis-je comparer sur AssurMatch ?**
    Les produits disponibles dépendent du pays choisi et sont activés progressivement. La page d'un
    pays affiche la liste des produits ouverts pour ce pays au moment où vous la consultez.

17. **Quels documents dois-je préparer pour une assurance auto ?**
    (productKey : `auto`) En général la carte grise du véhicule, le relevé d'information de
    l'assureur précédent si disponible, et le permis de conduire du conducteur principal. Le
    courtier partenaire précise les documents exacts nécessaires à votre dossier.

18. **Une assurance voyage couvre-t-elle l'annulation du voyage ?**
    (productKey : `voyage`) Selon l'offre, oui : l'annulation ou l'interruption de voyage fait
    partie des garanties courantes, aux côtés des frais médicaux et du rapatriement. Chaque offre
    indique précisément ses garanties et ses exclusions.

---

## E. Production — Lexique (40 termes, ordre alphabétique)

Nouveaux termes marqués **(nouveau)** ; les autres sont des réécritures des 31 termes existants.

- **Assistance (nouveau)** : Un service d'aide en cas de panne, d'accident ou d'urgence pendant le
  trajet ou le séjour couvert (dépannage, remorquage, avance de frais). Exemple : une assistance
  voyage peut organiser une consultation médicale sur place. *(Voir aussi : Rapatriement)*

- **Assuré** : La personne dont les biens, la santé ou la responsabilité sont couverts par un
  contrat d'assurance. Exemple : le conducteur principal d'un véhicule est l'assuré du contrat
  auto. *(Voir aussi : Assureur, Souscripteur)*

- **Assureur** : La société qui porte le risque et verse l'indemnisation en cas de sinistre couvert.
  À distinguer du courtier, qui met en relation sans porter le risque lui-même. *(Voir aussi :
  Courtier, Sinistre)*

- **Attestation d'assurance** : Le document délivré par l'assureur ou le courtier qui prouve qu'un
  contrat est en cours. AssurMatch n'émet jamais d'attestation : seul le courtier partenaire le
  fait, après souscription. Exemple : l'attestation d'assurance auto se présente en cas de contrôle
  routier `[à vérifier juridiquement pour les mentions obligatoires]`. *(Voir aussi : Courtier,
  Souscription)*

- **Avenant** : Un document qui modifie un contrat d'assurance déjà en cours, par exemple pour
  ajouter une garantie ou changer une information. Exemple : un changement de véhicule donne lieu à
  un avenant, pas à un nouveau contrat. *(Voir aussi : Contrat d'assurance)*

- **Bénéficiaire** : La personne qui reçoit l'indemnisation prévue par le contrat en cas de sinistre,
  lorsqu'elle est différente de l'assuré.

- **Bonus-malus** : Un coefficient qui ajuste la prime selon l'historique de sinistres de l'assuré :
  il baisse sans sinistre responsable, il augmente après un sinistre responsable. Exemple : un
  conducteur sans sinistre responsable depuis plusieurs années paie en général une prime réduite.
  *(Voir aussi : Prime, Sinistre)*

- **Carence (délai de)** : La période suivant la souscription pendant laquelle une garantie n'est
  pas encore active, même si le contrat est en cours. Sa durée exacte dépend du contrat et du type
  de garantie `[à vérifier juridiquement]`.

- **Carte brune CEDEAO (nouveau)** : L'attestation d'assurance responsabilité civile auto reconnue
  dans plusieurs pays de la Communauté économique des États de l'Afrique de l'Ouest. Exemple : un
  conducteur en déplacement routier vers un pays voisin peut présenter sa carte brune au lieu de
  souscrire une assurance à la frontière `[à vérifier juridiquement pour les pays couverts et les
  conditions exactes]`. *(Voir aussi : Responsabilité civile)*

- **Contrat d'assurance** : L'accord entre l'assuré et l'assureur qui fixe les garanties, la prime
  et les conditions. AssurMatch ne fait pas partie du contrat : il est conclu entre vous et le
  courtier partenaire ou l'assureur. *(Voir aussi : Assureur, Courtier)*

- **Courtage** : L'activité du courtier : représenter les intérêts du client, comparer des offres et
  l'accompagner jusqu'à la souscription. *(Voir aussi : Courtier)*

- **Courtier** : Le professionnel autorisé qui confirme le devis, ajuste les conditions si besoin et
  accompagne la souscription. C'est le courtier partenaire, et non AssurMatch, qui est responsable
  du contrat proposé. *(Voir aussi : Assureur, Devis, Courtier responsable)*

- **Courtier responsable (nouveau)** : Le courtier partenaire identifié comme destinataire d'une
  demande de devis pour une offre donnée. Son nom et, lorsqu'il est disponible, son numéro
  d'agrément sont affichés avant que vous ne cochiez la case de consentement. *(Voir aussi :
  Courtier)*

- **Délai de traitement** : Le temps annoncé pour qu'un courtier partenaire étudie une demande de
  devis. Ce n'est pas un délai de remboursement en cas de sinistre.

- **Devis** : Une proposition chiffrée transmise par un courtier partenaire après étude d'une
  demande. Un prix affiché sur AssurMatch avant ce devis reste indicatif. *(Voir aussi : Prix
  indicatif, Courtier)*

- **Exclusion** : Une situation ou un événement explicitement non couvert par une garantie, même si
  elle appartient à la même catégorie de risque. Exemple : une activité sportive à risque non
  déclarée peut être exclue d'une assurance voyage. *(Voir aussi : Garantie)*

- **Franchise** : La part d'un sinistre qui reste à la charge de l'assuré, avant que l'indemnisation
  de l'assureur ne s'applique. Exemple : pour un sinistre de 200 000 FCFA `[exemple]` et une
  franchise de 30 000 FCFA `[exemple]`, l'assureur verse 170 000 FCFA `[exemple]`. *(Voir aussi :
  Sinistre, Indemnisation)*

- **Garantie** : Un engagement de l'assureur à couvrir un risque précis (par exemple le vol,
  l'incendie ou les frais médicaux), en échange du paiement de la prime. *(Voir aussi : Exclusion,
  Plafond de garantie, Tous risques)*

- **Indemnisation** : La somme versée par l'assureur à l'assuré ou au bénéficiaire pour compenser un
  sinistre couvert, dans la limite du plafond de garantie et après déduction de la franchise. *(Voir
  aussi : Franchise, Plafond de garantie)*

- **Lead qualifié** : Une demande de devis qui remplit les critères techniques nécessaires
  (coordonnées valides, pays et produit actifs, consentement recueilli, demande non dupliquée,
  courtier assigné, informations minimales complètes) pour être facturée au courtier partenaire.

- **Offre indicative** : Une offre affichée sur AssurMatch avant confirmation par le courtier
  partenaire : son prix, ses garanties et ses conditions peuvent encore être ajustés. *(Voir aussi :
  Prix indicatif)*

- **Offre sponsorisée (nouveau)** : Une offre dont le courtier partenaire a un partenariat
  commercial avec AssurMatch, signalée par un badge orange. Cela ne modifie ni son prix indicatif ni
  ses garanties, et elle ne peut jamais occuper la première position d'un classement du seul fait d'être sponsorisée. *(Voir aussi :
  Score indicatif)*

- **Période de validité (nouveau)** : La durée pendant laquelle une offre affichée sur AssurMatch
  reste valable avant d'être retirée ou mise à jour. À ne pas confondre avec la durée du contrat
  d'assurance lui-même. *(Voir aussi : Prise d'effet)*

- **Plafond de garantie** : Le montant maximal que l'assureur rembourse pour un sinistre couvert par
  une garantie donnée. *(Voir aussi : Garantie, Indemnisation)*

- **Prime** : Le montant payé par l'assuré à l'assureur, généralement chaque mois ou chaque année,
  en échange des garanties du contrat. *(Voir aussi : Surprime)*

- **Prise d'effet** : La date à partir de laquelle les garanties d'un contrat s'appliquent
  réellement. *(Voir aussi : Période de validité)*

- **Prix indicatif** : Un prix estimé à partir des informations disponibles au moment de la
  comparaison, sans valeur contractuelle. Il est systématiquement confirmé par le courtier
  partenaire. *(Voir aussi : Devis)*

- **Rapatriement (nouveau)** : Le retour organisé et pris en charge de l'assuré vers son pays de
  résidence, en cas de problème médical grave pendant un déplacement couvert par une assurance
  voyage. *(Voir aussi : Assistance)*

- **Renouvellement** : La reconduction d'un contrat d'assurance à l'échéance, avec ou sans
  changement des conditions.

- **Résiliation** : La fin, anticipée ou à échéance, d'un contrat d'assurance, à l'initiative de
  l'assuré ou de l'assureur selon les conditions prévues `[à vérifier juridiquement pour les délais
  applicables]`.

- **Responsabilité civile** : La garantie, souvent obligatoire, qui couvre les dommages causés par
  l'assuré à un tiers `[à vérifier juridiquement pour son caractère obligatoire et le montant
  minimal]`. Exemple : un accrochage causé à un autre véhicule relève de la responsabilité civile
  auto. *(Voir aussi : Tiers, Tous risques)*

- **Score indicatif** : Une note calculée à partir de plusieurs critères (prix, niveau de garantie,
  franchise, rapidité, souplesse de paiement, qualité de l'information) pour aider à comparer des
  offres. Une offre sponsorisée ne peut jamais occuper la première position d'un classement basé sur
  ce score du seul fait d'être sponsorisée. *(Voir aussi : Offre sponsorisée)*

- **Sinistre** : Un événement couvert par une garantie (accident, vol, incendie...) qui déclenche une
  demande d'indemnisation auprès de l'assureur. *(Voir aussi : Indemnisation, Franchise)*

- **Souscription** : L'acte par lequel l'assuré accepte définitivement un contrat d'assurance auprès
  d'un courtier ou d'un assureur. AssurMatch n'intervient jamais dans la souscription elle-même.
  *(Voir aussi : Courtier, Contrat d'assurance)*

- **Souscripteur** : La personne qui signe le contrat d'assurance et s'engage à payer la prime ;
  elle est souvent, mais pas toujours, la même personne que l'assuré.

- **Surprime** : Un supplément ajouté à la prime de base, généralement lié à un risque aggravé (par
  exemple un historique de sinistres). *(Voir aussi : Prime, Bonus-malus)*

- **Tiers** : Toute personne autre que l'assuré et l'assureur, par exemple une victime d'un accident
  causé par l'assuré. *(Voir aussi : Responsabilité civile)*

- **Tiers étendu / Tiers plus (nouveau)** : Un niveau de garantie intermédiaire entre le tiers simple
  et le tous risques : il ajoute des garanties choisies (vol, incendie, bris de glace) à la
  responsabilité civile de base, sans couvrir tous les dommages au véhicule en cas de responsabilité.
  *(Voir aussi : Garantie, Tous risques)*

- **Tous risques (nouveau)** : Le niveau de garantie le plus complet pour une assurance auto : il
  couvre les dommages causés à autrui et les dommages au véhicule assuré, y compris lorsque le
  conducteur est responsable. Exemple : un choc contre un poteau sans tiers impliqué peut être
  couvert en tous risques, pas en tiers simple. *(Voir aussi : Tiers étendu / Tiers plus,
  Responsabilité civile)*

- **Valeur à neuf / valeur vénale (nouveau)** : Deux façons de calculer l'indemnisation d'un bien
  endommagé ou volé : la valeur à neuf correspond au prix d'un bien équivalent neuf, la valeur
  vénale à son prix de revente au moment du sinistre, généralement plus faible. Exemple : un
  véhicule de cinq ans volé est le plus souvent indemnisé à sa valeur vénale, sauf offre incluant
  une garantie valeur à neuf. *(Voir aussi : Indemnisation)*

---

## F. Notes d'implémentation transverses

- Chaînes protégées globales (charte §5) réutilisées telles quelles dans les 3 pages : « Comparer
  les offres », « Demander un devis », « Être rappelé par un courtier agréé » (cette dernière
  n'apparaît pas dans ces 3 pages mais ne doit pas être reformulée si un futur CTA la réutilise
  ici).
- Aucune donnée chiffrée réelle (délai moyen, taux de satisfaction, nombre de demandes traitées)
  n'est utilisée : la FAQ Q11 répond honnêtement sans inventer de délai, conformément à charte §6.
- L'étiquette de transparence IA (D-IA) est citée mot pour mot dans FAQ Q3 : « Réponse générée
  automatiquement par un outil d'IA. Aide à la lecture, pas un conseil. » — à vérifier qu'elle
  correspond exactement au composant existant d'étiquette IA côté assistant de lecture avant mise en
  ligne (composant hors périmètre de cette fiche).
- FAQ Q15 (« Comment modifier ou supprimer mes données ? ») reprend le contenu déjà présent dans
  `apps/public/app/content/legal/privacy.ts:65-73` (section « Vos droits ») : garder les deux textes
  cohérents si l'un des deux change.
- Le format `date`/`FCFA` suit charte §2.7-2.8 : dates en toutes lettres à l'implémentation
  (`formatDate`, déjà en place), montants d'exemple toujours suivis de `[exemple]` dans ce livrable
  et jamais affichés comme un vrai prix côté produit.
- Aucun fichier hors `specs/050-public-editorial-rewrite/content/03-guides-faq-lexique.md` n'a été
  modifié pour produire cette fiche.

---

## G. Récapitulatif marqueurs et décisions

- `[à vérifier juridiquement]` : 13 occurrences (caractère obligatoire de la RC auto et de la RC en
  général, code CIMA, carte brune CEDEAO, montant minimal visa Schengen, délai légal de déclaration
  de sinistre, fausse déclaration, délais de carence et de résiliation, règles de calcul de la
  franchise, étendue de la RC selon le produit).
- `[à confirmer]` : 3 occurrences (nom exact du produit affiché sur la carte guide sans appel API
  supplémentaire, disponibilité de guides filtrés par produit, moyen de versement Mobile Money selon
  l'assureur).
- `[à mesurer]` : 1 occurrence (délai moyen avant rappel, FAQ Q11).
- `[exemple]` : montants FCFA illustratifs dans le guide franchise et le lexique (« Franchise »).

Décisions produit prises dans cette fiche, à valider :
1. Pas de filtre à onglets par produit sur l'index des guides tant que moins de 3 guides partagent
   un même produit ; un badge produit suffit pour l'instant (A.1, bloc 2).
2. `comprendre-la-franchise`, `responsabilite-civile` et `declarer-un-sinistre` restent des guides
   transversaux (pas de `productKey`), car leur sujet dépasse un seul produit.
3. Convention technique de 200 mots/minute pour le temps de lecture calculé (B.2), ajustable sans
   impact éditorial.
4. FAQ Q13 (« plusieurs devis ») et Q12 (« un seul courtier ou plusieurs ») sont gardées comme deux
   questions distinctes plutôt que fusionnées, car elles répondent à deux intentions de recherche
   différentes (mécanisme vs action possible).
