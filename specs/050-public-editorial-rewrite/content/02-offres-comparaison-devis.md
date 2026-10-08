# 02 — Offres, comparaison et devis

Ce fichier applique la charte éditoriale (`00-charte-editoriale.md`) et le format de fiche de sa
section 8 à cinq pages du parcours public : liste des offres, détail d'une offre, comparaison côte
à côte, demande de devis et confirmation/suivi. Les quatre phrases de positionnement (charte §4) et
les libellés d'action normalisés (charte §5) sont repris tels quels ; ils ne sont pas reproduits en
entier à chaque occurrence, seule la première apparition les cite in extenso.

Sources vérifiées avant rédaction : `packages/shared/contracts/quote.contracts.ts`,
`apps/public/app/lib/public-api.ts`, `apps/public/app/components/offer-cards.tsx`,
`apps/public/app/components/quote-form.tsx`, `apps/public/app/components/forms/offer-comparison-bar.tsx`,
`apps/public/app/components/forms/consent-withdrawal.tsx`, `apps/public/app/[locale]/.../offers/page.tsx`,
`apps/public/app/[locale]/offers/[offerId]/page.tsx`, `apps/public/app/[locale]/compare/page.tsx`,
`apps/public/app/[locale]/.../quote/page.tsx`, `apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx`,
`apps/public/messages/fr.json` (namespaces `Offers`, `OfferCards`, `OfferDetail`, `Compare`, `QuoteForm`,
`QuoteRequest`, `Journey`, `Forms`, `Api`), `apps/public/i18n/routing.ts`,
`backend/src/modules/offers/offer-publication-policy.ts`, `backend/src/modules/offers/public-offer-catalog.service.ts`,
`backend/src/modules/quote-requests/quote-submission.service.ts`.

Point important vérifié dans le contrat : la « popularité » (tri `popularity_desc`) est définie dans
`backend/src/modules/offers/public-offer-catalog.service.ts:23` comme « le nombre de demandes de
devis qui ont sélectionné cette offre » — ce n'est ni une note d'avis ni un chiffre de satisfaction.
Le microcopy ci-dessous reprend cette définition exacte, jamais « offre la plus populaire » ou « la
plus appréciée ».

---

## Liste des offres

- Route FR / EN : `/pays/[countryCode]/produits/[productKey]/offres` /
  `/countries/[countryCode]/products/[productKey]/offers`
- Objectif prioritaire (une phrase) : permettre au visiteur de comparer des offres indicatives
  filtrées et triées, puis d'en sélectionner jusqu'à 4 pour un comparatif côte à côte ou d'en choisir
  une pour une demande de devis.
- Appel à l'action principal / secondaire : principal « Demander un devis » (par offre) ; secondaire
  « Comparer la sélection (2 à 4 offres) ».
- Namespace i18n existant : `Offers.*`, `OfferCards.*`, `Common.comparisonBar.*` — restructuré (pas
  nouveau).
- Statut : restructuration.

### Structure (dans l'ordre)

**1. En-tête — composant : `Hero` + `JourneyHeroNotice`**
- Kicker : `{product} · {country}` (ex. « Auto · Côte d'Ivoire »).
- Titre : « Comparer les offres ».
- Sous-titre : « Chaque offre est indicative : le prix indicatif et les conditions restent à
  confirmer par le courtier partenaire responsable. »
- Corps / microcopie : bandeau `JourneyHeroNotice` inchangé, deux phrases fixes :
  « AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des
  courtiers partenaires autorisés. » et « Offre indicative, prix indicatif, à confirmer par le
  courtier partenaire. »
- Boutons : aucun dans le bloc d'en-tête.
- Données affichées (source) : nom du pays et du produit (`GET /countries/directory`,
  `GET /countries/:code/products`).
- États : —

**2. Bloc filtres (D-Filtres) — composant : panneau `<details>` dans `offers/page.tsx`**

Quatre filtres principaux, toujours visibles, jamais repliés :

| Filtre | Libellé | Texte d'aide | Libellés des options |
| --- | --- | --- | --- |
| `minGuaranteeLevel` | Niveau de garantie minimum | Niveau déclaré par le courtier partenaire, de 1 (garantie de base) à 5 (garantie la plus complète parmi les offres publiées). | « Tous » (valeur vide), puis « 1/5 », « 2/5 », « 3/5 », « 4/5 », « 5/5 » |
| `guarantee` | Garantie incluse | Filtre les offres qui incluent cette garantie précise ; les libellés viennent des garanties publiées sur les offres affichées pour ce produit. | « Toutes » (valeur vide), puis une option par garantie réellement présente dans les offres chargées (ex. « Bris de glace », « Assistance 0 km ») |
| `paymentFlexibility` | Rythme de paiement | Fréquence à laquelle le courtier partenaire peut vous proposer de régler la prime. | « Toutes », « annuel », « semestriel », « trimestriel », « mensuel » |
| `minPrice` / `maxPrice` | Budget indicatif : de / à | Ce montant est indicatif : le prix exact dépend des informations que vous donnerez au courtier partenaire. | Deux champs numériques, en FCFA, sans valeur par défaut |

Lien « Plus de filtres » (texte, pas un bouton) ouvre un second groupe repliable pour les filtres
secondaires :

| Filtre | Libellé | Texte d'aide |
| --- | --- | --- |
| `maxDeductible` | Franchise maximale | Montant maximum qui reste à votre charge en cas de sinistre, avant l'intervention de l'assureur. |
| `maxProcessingDays` | Délai de traitement maximum (jours) | Délai moyen annoncé par le courtier partenaire pour traiter une demande, en jours. |
| `insurer` | Assureur | Nom de l'assureur qui porte le risque, tel qu'indiqué par le courtier partenaire. |
| `broker` | Courtier partenaire | Nom du courtier partenaire responsable de l'offre. |

Boutons :
- Ouvrir/fermer le second groupe : libellé exact « Plus de filtres » (repli : « Moins de filtres »).
- Appliquer : « Appliquer les filtres ».
- Réinitialiser : « Effacer les filtres » (libellé normalisé, charte §5 — remplace « Réinitialiser »
  utilisé aujourd'hui).
- Badge de comptage sur le résumé du panneau : « {count, plural, one {# filtre actif} other {# filtres
  actifs}} », compte uniquement les filtres réellement renseignés (les 4 principaux + les secondaires,
  jamais le tri).

Le tri (D-Tri) quitte le panneau de filtres et reste dans la barre de résultats (point 3) pour ne pas
être réinitialisé par un « Effacer les filtres ».

Sélecteur « Ce qui compte le plus pour vous » (`priority`) : reste séparé du tri, alimente le critère
« Vos préférences » du score. Option par défaut « Aucune priorité », puis « Le prix », « Le niveau de
garantie », « La rapidité de traitement », « La franchise », « La flexibilité de paiement ».

**3. Barre de résultats — composant : ligne au-dessus de la liste**
- Compteur de résultats, libellé exact : `{count, plural, one {# offre indicative affichée} other
  {# offres indicatives affichées}}` (garde la formulation « offre(s) indicative(s) », jamais « offre(s) »
  seule).
- Tri (D-Tri), libellé « Trier par », avec une phrase d'explication par option (affichée en `title`/texte
  d'aide sous le sélecteur) :

  | Option | Libellé | Explication en une ligne |
  | --- | --- | --- |
  | `score_desc` (par défaut) | Score indicatif (par défaut) | Combine niveau de garantie, prix, franchise, rapidité, flexibilité de paiement, qualité des informations et vos préférences en un score sur 100. |
  | `price_asc` | Prix indicatif croissant | Du prix indicatif le plus bas au plus élevé parmi les offres affichées. |
  | `coverage_desc` | Garanties (niveau décroissant) | Du niveau de garantie déclaré le plus élevé au plus bas. |
  | `speed_asc` | Rapidité | Du délai moyen de traitement le plus court au plus long. |
  | `popularity_desc` | Popularité | Du nombre de demandes de devis reçues le plus élevé au plus bas pour cette offre. |
  | `updated_desc` | Mise à jour récente | De la date de mise à jour la plus récente à la plus ancienne. |

  Conformément à D-Tri, « Sponsorisées d'abord » et « Nom » disparaissent de la liste des options
  visiteur. Une offre sponsorisée garde son badge orange « Sponsorisée » quel que soit le tri choisi et
  son score n'est jamais modifié par la sponsorisation.
- Bouton de mise à jour du tri (repli sans JavaScript) : « Mettre à jour ».

**4. Barre de sélection comparaison (D-Comparaison) — composants : case à cocher de chaque carte +
`OfferComparisonBar`**

| État | Ce qui est visible | Texte |
| --- | --- | --- |
| 0 sélection | Barre flottante absente. Chaque carte affiche la case « Ajouter à la comparaison ». | — |
| 1 sélection | Barre flottante toujours absente (elle exige 2 offres minimum) ; un texte d'assistance apparaît près du compteur de résultats, en zone `aria-live` polie. | « 1 offre sélectionnée. Sélectionnez au moins une autre offre indicative (2 à 4 au total) pour lancer la comparaison. » |
| 2 à 4 sélections | Barre flottante visible en bas d'écran. | Compteur : `{count, plural, one {# offre sélectionnée} other {# offres sélectionnées}}` ; bouton : « Comparer la sélection (2 à 4 offres) » |
| 4 sélections (maximum atteint) | Barre flottante avec mention du maximum ; les cases non cochées des autres cartes passent à l'état désactivé. | Barre : « 4 offres sélectionnées (maximum atteint). » Case désactivée, texte d'aide au survol/`aria-describedby` : « Maximum de 4 offres atteint. Retirez une offre de la sélection pour en ajouter une autre. » |

Chaque case garde son nom accessible complet : « Ajouter à la comparaison, {nom de l'offre} » / une
fois cochée « Retirer de la comparaison, {nom de l'offre} » (libellé normalisé charte §5 : « Ajouter à
la comparaison / Retirer de la comparaison »).

**5. Liste des cartes d'offre — composant : `OfferCard`**

Phrase d'aide au-dessus de la liste : « Cochez 2 à 4 offres puis comparez-les côte à côte. »

Anatomie complète d'une carte, dans l'ordre d'affichage, avec libellé, microcopie/infobulle et source :

1. **Nom de l'offre** — titre de carte. Source : `offer.name` (texte backend).
2. **Badge « Sponsorisée »** (si `isSponsored`) — juste à côté du nom, jamais isolé ailleurs sur la
   carte. Infobulle exacte : « Placement payant du courtier partenaire, signalé et sans effet sur le
   score indicatif. » Texte du badge : « Sponsorisée » ou « Sponsorisée ({mention du courtier} : `sponsorLabel`) ».
3. **Assureur porteur du risque** — ligne d'identité avec icône, texte caché aux lecteurs d'écran
   « Assureur ». Source : `offer.insurerName`. Si absent : « non renseigné ».
4. **Courtier partenaire responsable** — même ligne d'identité, icône « poignée de main », texte caché
   « Courtier partenaire responsable ». Source : `offer.partnerName` (repli `offer.brokerName`). Le
   numéro d'agrément n'est pas disponible à ce niveau de donnée (la liste d'offres ne le transporte
   pas, voir Notes d'implémentation) : une micro-mention sous le nom du courtier renvoie vers le détail
   — « Agrément affiché sur la fiche de l'offre » — plutôt que d'inventer un numéro.
5. **Prix indicatif + période** — bloc dédié. Libellé : « Prix indicatif ». Montant : « à partir de
   {montant} FCFA » ou, si absent, « prix à confirmer ». Période/complément sous le montant :
   texte backend (`indicativePriceLabel`, ex. « par an »). Sous le tout, mention compacte non
   masquable : « prix indicatif, à confirmer par le courtier partenaire ».
6. **Franchise** — mini-statistique avec icône pièces. Libellé « Franchise ». Valeur en FCFA ou « non
   renseigné ».
7. **Plafond de garantie** — mini-statistique avec icône bouclier. Libellé « Plafond de garantie ».
8. **Délai moyen de traitement** — mini-statistique avec icône horloge. Libellé « Délai moyen de
   traitement ». Valeur : « {jours} jour(s) » ou « non renseigné ».
9. **Paiement** — mini-statistique avec icône calendrier. Libellé « Flexibilité de paiement ». Valeur :
   « annuel », « semestriel », « trimestriel » ou « mensuel ».
10. **Garanties incluses / non incluses** — liste de pastilles, 6 au premier niveau, puis « + {n}
    garanties » si plus. Icône coche verte = incluse (texte cascade « Incluse : {garantie} ») ; icône
    tiret neutre = non incluse (« Non incluse : {garantie} »). Le détail (`guarantee.detail`) apparaît en
    infobulle quand il existe.
11. **Score /100 avec barre et « Pourquoi ce score ? »** — pastille de score en haut de carte (taille
    « lg »), texte accessible « Score indicatif : {total} sur 100 ». Sous la liste de garanties, une
    zone dépliable dont le déclencheur devient (changement proposé, voir Notes d'implémentation) :
    « Pourquoi ce score de {total}/100 ? » — remplace le texte actuel « Score indicatif : {total}/100 »
    qui ne pose pas la question explicitement. Le contenu déplié montre, par critère
    (niveau de garantie, prix, franchise, rapidité de traitement, flexibilité de paiement, qualité des
    informations, vos préférences) : le poids en %, les points obtenus sur 100 et une explication en
    texte backend. Colonnes de tableau : « Critère », « Poids », « Points », « Explication ».
12. **Date de mise à jour, visible au premier niveau** — ligne courte sous les mini-statistiques,
    hors du tiroir « Voir plus » (changement, voir Notes d'implémentation). Libellé « Dernière mise à
    jour » + date au format `24 septembre 2026`.
13. **Validité** — sur la même ligne ou juste en dessous, ajoutée à la carte (nouveauté, voir Notes
    d'implémentation). Libellé « Valable jusqu'au {date} ». N'apparaît que pour des offres déjà
    filtrées comme publiquement disponibles : une offre expirée n'est jamais listée (charte §6, décision
    produit confirmée par `offer-publication-policy.ts:14`).
14. **Mention de bas de carte** — texte backend obligatoire (`offer.disclaimer`), jamais retiré.
15. **Actions** — zone de navigation nommée « Actions {nom de l'offre} », trois actions dans l'ordre :
    - « Voir le détail » (secondaire) → fiche détail de l'offre.
    - « Demander un devis » (principal) → formulaire de devis avec cette offre présélectionnée.
    - Case « Ajouter à la comparaison / Retirer de la comparaison » (décrite au point 4), positionnée en
      haut de carte à côté du score, pas en bas avec les deux boutons — elle reste une sélection, pas une
      navigation.

**Deux cartes d'exemple entièrement remplies [exemple]**

Carte A — offre standard :
- Nom : « Auto Tiers Étendu [exemple] »
- Assureur porteur du risque : « Assurance Atlantique [exemple] »
- Courtier partenaire responsable : « Courtage Lagune [exemple] »
- Prix indicatif : « à partir de 65 000 FCFA [exemple] », période « par an [exemple] »
- Franchise : « 50 000 FCFA [exemple] »
- Plafond de garantie : « 5 000 000 FCFA [exemple] »
- Délai moyen de traitement : « 3 jour(s) [exemple] »
- Paiement : « trimestriel [exemple] »
- Garanties incluses : « Responsabilité civile [exemple] », « Bris de glace [exemple] », « Assistance
  0 km [exemple] » ; non incluses : « Vol [exemple] », « Incendie [exemple] »
- Score : « 78/100 [exemple] », dont niveau de garantie 22/30 [exemple], prix 18/20 [exemple], franchise
  12/15 [exemple], rapidité 10/10 [exemple], flexibilité de paiement 8/10 [exemple], qualité des
  informations 5/10 [exemple], vos préférences 3/5 [exemple]
- Dernière mise à jour : « 12 septembre 2026 [exemple] »
- Valable jusqu'au : « 31 décembre 2026 [exemple] »
- Sponsorisée : non

Carte B — offre sponsorisée :
- Nom : « Auto Tous Risques Sérénité [exemple] »
- Badge : « Sponsorisée (Assurance Baobab [exemple]) »
- Assureur porteur du risque : « Assurance Baobab [exemple] »
- Courtier partenaire responsable : « Courtage Deux-Plateaux [exemple] »
- Prix indicatif : « à partir de 140 000 FCFA [exemple] », période « par an [exemple] »
- Franchise : « 30 000 FCFA [exemple] »
- Plafond de garantie : « 12 000 000 FCFA [exemple] »
- Délai moyen de traitement : « 5 jour(s) [exemple] »
- Paiement : « mensuel [exemple] »
- Garanties incluses : « Responsabilité civile [exemple] », « Vol [exemple] », « Incendie [exemple] »,
  « Bris de glace [exemple] », « Assistance 0 km [exemple] », « Véhicule de remplacement [exemple] » (+
  1 garantie)
- Score : « 71/100 [exemple] » — le score n'est pas modifié par la sponsorisation, seulement affiché à
  côté du badge.
- Dernière mise à jour : « 3 septembre 2026 [exemple] »
- Valable jusqu'au : « 15 novembre 2026 [exemple] »

**6. États**
- Chargement (squelette) : le contenu visuel du squelette reste décoratif (`aria-hidden`), donc un
  texte séparé doit porter l'annonce ; il n'existe pas encore de squelette sur cette page (voir Notes
  d'implémentation). Texte à ajouter, visible uniquement des technologies d'assistance : « Chargement
  des offres indicatives en cours. » Le squelette visuel reprend la forme d'une carte (bandeau titre,
  quatre statistiques, liste de garanties).
- Erreur (le catalogue public échoue) : titre « Offres indisponibles », description « Le catalogue
  public est temporairement indisponible pour ce produit. » (ou le message renvoyé par l'API quand il
  existe). Pas de bouton de réessai automatique : le visiteur recharge la page.
- Aucune offre pour ce produit/pays (le catalogue répond correctement mais est vide, sans filtre actif) :
  titre « Aucune offre indicative pour ces critères », description « Modifiez vos filtres ou élargissez
  votre recherche. Une offre sponsorisée est affichée uniquement avec sa mention. » Bouton : « Effacer
  les filtres ».
- Aucun résultat pour ces filtres (le catalogue contient des offres mais aucune ne correspond aux
  filtres actifs) : même bloc que ci-dessus ; la distinction entre « rien pour ce produit » et « rien
  avec ces filtres » se fait aujourd'hui avec le même texte (voir Notes d'implémentation — une variante
  pourrait préciser « pour ces filtres » quand `activeFilters > 0`).
- Comparateur désactivé par indicateur (`public_comparator_enabled`, `country_comparison_enabled` ou
  `product_comparison_enabled` à faux) : la page n'affiche ni cases de sélection ni barre de
  comparaison ; un bandeau remplace le bloc filtres. Titre : « Comparaison indisponible pour ce
  produit ». Description : « La comparaison des offres n'est pas activée pour {product} en {country}
  pour le moment. Vous pouvez tout de même demander un devis. » Bouton : « Demander un devis ».
- Pays ou produit non ouvert (`country_public_enabled` ou `product_public_enabled` à faux) : la page
  n'affiche aucune offre ni aucun filtre. Titre : « {product} n'est pas encore ouvert en {country} ».
  Description : « Ce produit n'est pas encore disponible publiquement dans ce pays. » Bouton : « Voir
  les pays ouverts ».

### Notes d'implémentation

- Les 4 filtres principaux et le groupe « Plus de filtres » n'existent pas encore comme deux blocs
  séparés : aujourd'hui tous les filtres sont dans une seule grille
  (`apps/public/app/[locale]/countries/[countryCode]/products/[productKey]/offers/page.tsx:194-283`).
  À restructurer en deux `<fieldset>` avec le second replié par défaut.
- Le tri par défaut doit devenir `score_desc` (D-Tri) ; aujourd'hui le défaut est `updated_desc` à la
  fois côté page (`offers/page.tsx:39-49` et `sortOptionOf`, ligne 71-73) et côté contrat
  (`packages/shared/contracts/quote.contracts.ts:52,76`, `.default("updated_desc")`). Les options
  `name_asc` et `sponsored_explicit` doivent disparaître de `sortOptions`
  (`offers/page.tsx:38-49`) et, idéalement, du schéma partagé pour l'interface visiteur (le
  back-office peut garder un tri différent).
- Libellé de réinitialisation à renommer de « Réinitialiser » (`fr.json` clé `Offers.reset`) en
  « Effacer les filtres » (libellé normalisé et protégé par la charte §5).
- La barre de comparaison (`apps/public/app/components/ui/comparison-bar.tsx:14`) ne s'affiche
  aujourd'hui qu'à partir de 2 sélections et ne gère ni l'état « 1 sélection » ni le blocage à 4 : les
  cases à cocher des offres (`apps/public/app/components/offer-cards.tsx:372-379`) n'ont aucune
  limite. Implémenter le comptage et le verrouillage des cases restantes côté client (le formulaire
  reste fonctionnel sans JavaScript, seule l'UX de blocage est une amélioration progressive).
- La date de mise à jour et la validité ne sont pas visibles au premier niveau de la carte
  aujourd'hui : `updatedAt` n'apparaît que dans `OfferCriteria` avec `variant="card"`, rendue à
  l'intérieur du tiroir `<details className="am-j-more">` (`offer-cards.tsx:396-404`) ; `validUntil`
  n'apparaît pas du tout dans `OfferSummary` au sens du contrat (`quote.contracts.ts:95-117` n'a pas
  de `validUntil` — seul `offerDetailSchema` l'ajoute, `quote.contracts.ts:119-121`). Deux options :
  soit ajouter `validUntil` à `offerSummarySchema` côté backend, soit retirer ce champ de l'anatomie de
  carte et le garder réservé à la fiche détail — décision produit à confirmer avant implémentation
  `[à confirmer]`.
- Le libellé du déclencheur de score passe de « Score indicatif : {total}/100 » à « Pourquoi ce score
  de {total}/100 ? » : clé `OfferCards.scoreSummary` (`fr.json`), composant `ScoreBreakdown`
  (`offer-cards.tsx:64`).
- La donnée de licence/agrément du courtier n'existe pas dans `OfferSummary`
  (`quote.contracts.ts:95-117`) : seule la fiche détail la résout via `listCountryPartners` et une
  correspondance par nom (`apps/public/app/[locale]/offers/[offerId]/page.tsx:74-90`). La carte ne
  peut donc pas afficher un numéro d'agrément sans appel supplémentaire par offre ; le choix retenu
  est la micro-mention de renvoi vers le détail plutôt que d'inventer une donnée.
- Aucun `loading.tsx` n'existe pour cette route aujourd'hui (vérifié par recherche de fichiers) : le
  squelette de chargement est une nouvelle addition.
- Il n'existe pas aujourd'hui de vérification de `comparisonEnabled`/`quoteEnabled` avant le rendu de
  la page liste (`offers/page.tsx` appelle `listPublicOffers` sans lire `PublicProductSummary` que
  `resolveNames` a pourtant déjà chargé, `offers/page.tsx:76-86` puis 126). Utiliser ce champ déjà
  disponible pour distinguer l'état « comparateur désactivé » plutôt que de laisser la liste vide sans
  explication.
- Chaîne protégée par test (à garder mot pour mot si elle est modifiée) : « Comparer les offres » et
  « Demander un devis » sont vérifiées par
  `backend/tests/guardrails/content/public-localized-wording.spec.ts:14-15` (recherchées dans
  `quote-form.tsx`, `quote-requests/[publicReference]/page.tsx` et `fr.json`) ; cette page-ci n'est pas
  directement lue par ce test mais utilise les mêmes libellés de bouton, à garder identiques.
- `[à confirmer]` : faut-il distinguer « aucune offre pour ce produit » de « aucun résultat pour ces
  filtres » avec deux textes différents, ou garder un seul texte comme aujourd'hui ? Proposition ci-dessus
  à valider.

---

## Détail d'offre

- Route FR / EN : `/offres/[offerId]` / `/offers/[offerId]`
- Objectif prioritaire (une phrase) : donner la vue complète d'une offre indicative (garanties,
  limites, exclusions, documents, courtier responsable) pour permettre une demande de devis éclairée.
- Appel à l'action principal / secondaire : principal « Demander un devis » ; secondaire « Comparer
  les offres ».
- Namespace i18n existant : `OfferDetail.*`, `OfferCards.*` — réécriture.
- Statut : réécriture.

### Structure (dans l'ordre)

**1. En-tête — composant : `Hero`**
- Kicker : « Offre indicative ».
- Titre : nom de l'offre (ou « Détail de l'offre indicative » si l'offre n'a pas pu être chargée).
- Sous-titre : « Garanties, limites, validité et courtier partenaire responsable d'une offre
  indicative. »
- Corps / microcopie : pastille de score (si présente) + badge « Sponsorisée » (si présent), puis
  bandeau `JourneyHeroNotice` (deux phrases fixes, voir page précédente).
- Boutons : aucun dans l'en-tête.
- Données affichées (source) : `GET /offers/:offerId`.
- États : décrits au point 6.

**2. Bloc critères — composant : section principale**
- Titre de bloc : « Critères comparés ».
- Ligne d'identité : assureur porteur du risque + courtier partenaire responsable (mêmes icônes et
  textes cachés que la carte).
- Résumé court de l'offre (`shortDescription`) et résumé des garanties (`guaranteeSummary`), tous deux
  en texte backend.
- Quatre statistiques : franchise, plafond, délai moyen de traitement, paiement (mêmes libellés que la
  carte).
- Liste des garanties incluses / non incluses, sans limite d'affichage ici (contrairement à la carte).
- Zone dépliable « Tous les critères et le détail du score » : reprend l'intégralité des critères
  (prix indicatif, courtier, assureur, niveau de garantie, franchise, plafond, délai, paiement, mise à
  jour) puis, si un score existe, le détail « Pourquoi ce score de {total}/100 ? » (même composant que
  la carte).
- Ligne de petit texte : « Validité jusqu'au {date}. » + si une source est connue, « Source :
  {source}. »

**3. Bloc exclusions — composant : section, affiché seulement si `exclusionsSummary` existe**
- Titre : « Exclusions principales ».
- Corps : texte backend intégral (`exclusionsSummary`), affiché sans troncature.

**4. Bloc documents — composant : section, affiché seulement si `requiredDocuments` n'est pas vide**
- Titre : « Documents requis ».
- Liste à puces, une icône « document validé » par ligne, texte backend intégral par document (ex.
  « La carte grise et le permis du conducteur principal [exemple] »).

**5. Bloc mentions du partenaire — composant : section « Mentions de l'offre »**
- Titre : « Mentions de l'offre ».
- Liste à puces des `publicDisclaimers` (texte backend, jamais réécrit — au minimum « offre indicative »
  et « prix à confirmer par le courtier partenaire », imposés par le schéma
  `adminOfferUpsertSchema.publicDisclaimers`).
- Sous la liste, bandeau non masquable : « Validité, garanties principales, limites et responsabilité
  du courtier partenaire. La sponsorisation est indiquée lorsqu'elle existe. »

**6. Aside prix et actions — composant : carte latérale**
- Bloc prix : même composant `OfferPrice` que la carte (montant, période, mention indicative non
  masquable).
- Boutons, dans l'ordre : « Demander un devis » (taille large, principal) puis « Comparer les offres »
  (secondaire) — tous deux visibles seulement si la page connaît le pays et le produit (arrivée depuis
  la liste). Sans ce contexte : bouton unique « Voir les pays ouverts ».

**7. Bloc courtier responsable — composant : `BrokerBlock` variant complet**
- Titre : « Courtier partenaire responsable ».
- Si le courtier est retrouvé dans l'annuaire public du pays : nom affiché, numéro d'agrément, autorité
  émettrice, ville, statut « autorisé » — toutes données réelles issues de `GET
  /countries/:code/partners`, jamais inventées.
- Si le contexte pays est inconnu ou que le courtier n'est pas retrouvé dans l'annuaire : le nom seul
  est affiché (« non renseigné » si même le nom manque). Pas de numéro d'agrément affiché sans source.
- Lien : « Voir les courtiers partenaires » (vers l'annuaire du pays), affiché seulement si le pays est
  connu.

### 8. États

| État | Titre | Description | Action |
| --- | --- | --- | --- |
| Offre expirée | « Offre expirée » | « La période de validité de cette offre est terminée : elle n'est plus affichée comme disponible. Comparez les offres actuellement publiées. » | « Comparer les offres » |
| Offre non validée | « Offre en attente de validation » | « Cette offre n'a pas encore été validée pour publication et n'est pas affichée publiquement pour le moment. » | « Comparer les offres » |
| Courtier partenaire non éligible | « Offre temporairement indisponible » | « Le courtier partenaire responsable de cette offre n'est pas, pour le moment, autorisé pour ce pays ou ce produit. L'offre n'est pas affichée publiquement. » | « Comparer les offres » |
| Offre introuvable (identifiant inconnu) | « Offre introuvable » | « Cette offre n'existe pas ou son lien est incorrect. » | « Voir les pays ouverts » |

Les trois premiers états partagent un même bouton mais des titres et descriptions distincts, pour ne
jamais laisser croire que l'offre a disparu par erreur technique quand la raison est réglementaire
(expiration, validation ou éligibilité du partenaire) — voir Notes d'implémentation pour ce que l'API
distingue déjà aujourd'hui côté serveur.

### Notes d'implémentation

- Aujourd'hui, `GET /offers/:offerId` répond par une seule erreur générique
  (`"Offer is not publicly available"`, `backend/src/modules/offers/public-offer-catalog.service.ts:135`)
  quelle que soit la raison ; la raison réelle (`offer_not_validated`, `offer_expired`,
  `offer_not_active`, `offer_not_started`, ou une raison d'inéligibilité du partenaire renvoyée par
  `evaluatePartnerEligibility`, `public-offer-catalog.service.ts:20,256`) n'est journalisée que côté
  audit (`public-offer-catalog.service.ts:126-134`) et n'atteint jamais le visiteur. Distinguer les
  trois messages ci-dessus suppose d'exposer une catégorie de raison (pas le détail brut) dans la
  réponse d'erreur publique, sans exposer d'information sensible sur le partenaire (Constitution VIII,
  « sans exposer d'informations sensibles »). Aujourd'hui la page affiche un seul état « Offre
  indisponible » (`apps/public/app/[locale]/offers/[offerId]/page.tsx:121-135`, clé
  `OfferDetail.unavailable`). `[à confirmer]` : l'équipe doit valider qu'exposer même une catégorie
  générale (« expirée » vs « non publiée » vs « partenaire indisponible ») ne crée pas de risque de
  fuite d'information sur un partenaire précis avant l'implémentation.
- L'état « introuvable » existe déjà et correspond au comportement actuel quand `offer` est `null`
  (`offer-detail/page.tsx:121-135`) ; son texte peut rester séparé des trois autres sans changement de
  code, seul le texte change.
- Le renvoi « Comparer les offres » suppose de connaître le pays/produit de l'offre manquante pour
  cibler la bonne liste ; sans ce contexte, garder le renvoi générique actuel (« Voir les pays
  ouverts »).

---

## Comparaison côte à côte

- Route FR / EN : `/comparer` / `/compare`
- Objectif prioritaire (une phrase) : aligner 2 à 4 offres indicatives critère par critère pour une
  décision éclairée, sans jamais désigner une « meilleure » offre.
- Appel à l'action principal / secondaire : principal « Voir le détail » (par offre) ; secondaire « Voir
  les pays ouverts ».
- Namespace i18n existant : `Compare.*` — restructuration (repli mobile).
- Statut : restructuration.

### Structure (dans l'ordre)

**1. En-tête — composant : `Hero`**
- Kicker : « Comparaison indicative ».
- Titre (état d'entrée, sans sélection) : « Choisissez les offres à comparer ».
- Titre (sélection valide) : « Comparer les offres côte à côte ».
- Sous-titre (entrée) : « Choisissez un pays et un produit, puis cochez 2 à 4 offres indicatives :
  leurs critères s'alignent ensuite ligne par ligne. »
- Sous-titre (sélection valide) : « Les critères sont alignés ligne par ligne. Le prix indicatif reste
  à confirmer par le courtier partenaire responsable. »
- Corps : sélecteur pays/produit en état d'entrée uniquement ; bandeau `JourneyHeroNotice` dans tous les
  cas.

**2. État d'entrée (aucune sélection) — composant : section « Comment comparer »**
- Titre : « Comment comparer ».
- Sous-titre : « Trois étapes, sans création de compte. »
- Trois étapes numérotées :
  1. « 1. Choisissez le pays et le produit » — « La comparaison porte sur un seul pays et un seul
     produit à la fois. »
  2. « 2. Cochez 2 à 4 offres indicatives » — « Chaque offre affiche son prix indicatif, ses garanties
     et son score expliqué. »
  3. « 3. Lisez le tableau côte à côte » — « Les critères sont alignés ligne par ligne, les mentions de
     sponsorisation restent visibles. »
- Si aucun pays n'est sélectionnable (tous en liste d'attente) : bouton « Voir les pays ouverts ».

**3. État de sélection invalide (1 offre, ou plus de 4, ou offres de pays/produits différents) —
composant : `EmptyState`**
- Titre : « Sélection incomplète ».
- Description : « Sélectionnez entre 2 et 4 offres indicatives du même pays et du même produit pour les
  comparer. »
- Action : « Voir les pays ouverts ».
- Ce texte reste identique que la sélection contienne 1 offre, 5 offres ou un mélange de produits : dans
  les trois cas la cause est « ce n'est pas une sélection comparable », pas la peine de multiplier les
  messages.

**4. Tableau desktop — composant : `<table>` avec lignes critère par critère**

Bandeau au-dessus du tableau, non masquable : texte backend `compared.disclaimer`, qui porte la mention
« indicatif, à confirmer par le courtier partenaire » (ou équivalent backend). Sous le bandeau, texte
d'aide : « Faites défiler le tableau horizontalement pour voir toutes les offres. » (desktop seulement ;
disparaît dans la mise en page mobile décrite au point 5).

En-tête de colonne par offre : nom de l'offre, score (pastille compacte), badge « Sponsorisée » si
sponsorisée.

Lignes, dans l'ordre, chacune avec une courte explication (affichée en info-bulle ou sous le libellé de
ligne) :

| Ligne | Libellé | Explication courte |
| --- | --- | --- |
| Prix | Prix indicatif | Montant de départ annoncé par le courtier partenaire ; le prix final dépend des informations transmises au moment du devis. |
| Franchise | Franchise | Montant qui reste à votre charge en cas de sinistre, avant l'intervention de l'assureur. |
| Plafond | Plafond de garantie | Montant maximum remboursé par l'assureur pour cette offre. |
| Garanties (une ligne par garantie) | {nom de la garantie} | Incluse ou non incluse pour chaque offre comparée ; le détail, quand il existe, est repris tel quel. |
| Délai | Délai moyen de traitement | Délai annoncé par le courtier partenaire pour traiter une demande liée à cette offre. |
| Paiement | Flexibilité de paiement | Fréquence à laquelle la prime peut être réglée. |
| Score | Score indicatif | Score sur 100 calculé uniquement entre les offres affichées ici, selon vos critères. |
| Conditions et exclusions | Conditions et exclusions | Résumé des exclusions principales, quand l'offre en publie un. |
| Validité | Valable jusqu'au | Date de fin de validité de l'offre ; une offre expirée n'apparaît jamais dans ce tableau. |
| Mise à jour | Dernière mise à jour | Date de la dernière modification connue de l'offre par le courtier partenaire. |
| Courtier | Courtier partenaire responsable | Courtier qui reprendra la demande de devis pour cette offre. |
| Assureur | Assureur porteur du risque | Compagnie qui porterait le risque si le courtier confirme le devis. |

Mention de mise en valeur (surlignage de cellule) : la valeur la plus favorable d'une ligne numérique
(prix le plus bas, franchise la plus basse, plafond le plus haut, délai le plus court) est légèrement
mise en valeur, avec un texte caché aux lecteurs d'écran qui reprend exactement la règle appliquée,
jamais un jugement global :
- Prix : « prix le plus bas parmi les offres comparées »
- Franchise : « franchise la plus basse parmi les offres comparées »
- Plafond : « plafond le plus élevé parmi les offres comparées »
- Délai : « délai le plus court parmi les offres comparées »

Le mot « meilleur »/« meilleure » n'apparaît jamais dans ces mentions, conformément à la charte §3 et à
la Constitution VIII.

**5. Mise en page mobile (< 768 px) — composant : `D-Comparaison`, une carte par critère**

Sous 768 px, le tableau devient une série de cartes, une par critère (pas de défilement horizontal) :
- Titre de carte : le libellé du critère (ex. « Prix indicatif »).
- Sous-titre de carte : la même explication courte que dans le tableau desktop.
- Une ligne par offre empilée dans la carte : nom de l'offre (avec badge « Sponsorisée » si concerné)
  et sa valeur pour ce critère, avec la même mise en valeur (texte, pas seulement une couleur) que sur
  desktop.

**6. Cartes de score détaillé — composant : section « Scores indicatifs »**
- Une carte par offre comparée : nom, pastille de score en grand, badge sponsorisée, détail « Pourquoi
  ce score ? », bouton « Voir le détail » vers la fiche complète.

**7. Actions par offre**
- Sur chaque colonne/carte : « Voir le détail » (vers la fiche de l'offre).
- En bas de page : « Voir les pays ouverts » (retour à la découverte).

**8. État d'échec technique (le service de comparaison répond en erreur)**
- Titre : « Comparaison indisponible ».
- Description : « La comparaison de ces offres n'est pas disponible pour le moment. » (ou message
  renvoyé par l'API).
- Action : « Voir les pays ouverts ».

### Notes d'implémentation

- Le repli mobile en carte par critère (D-Comparaison) n'existe pas aujourd'hui : la page actuelle
  affiche uniquement un tableau HTML avec indication de défilement horizontal
  (`apps/public/app/[locale]/compare/page.tsx:194-228`, classes `am-table-wrap`, texte
  `Compare.scrollHint`). Sous 768 px, ce même tableau doit être remplacé par la mise en page carte par
  critère décrite ci-dessus, en CSS ou en rendu conditionnel ; le texte `scrollHint` devient alors
  desktop uniquement.
- La mise en valeur (prix le plus bas, etc.) n'existe pas dans le rendu actuel : les cellules du
  tableau affichent la valeur brute sans comparaison (`compare/page.tsx:213-226`, fonction `cell`). À
  ajouter côté rendu (le calcul peut rester côté client à partir de `compared.rows`, sans appel API
  supplémentaire).
- Chaîne protégée : aucune des chaînes de cette page n'est actuellement listée dans les gardes-fous
  (`public-institutional.spec.ts`, `public-brokers.spec.ts`, `public-localized-wording.spec.ts`), mais
  le mot « meilleur » reste interdit par la Constitution VIII quel que soit le test.
- `[à confirmer]` : faut-il garder un texte unique pour toute sélection invalide (1, 5, ou pays/produits
  mélangés) comme aujourd'hui, ou distinguer « trop d'offres » de « pas assez » ? Le texte proposé garde
  la version actuelle unique, plus simple à maintenir et déjà conforme.

---

## Demande de devis

- Route FR / EN : `/pays/[countryCode]/produits/[productKey]/devis` /
  `/countries/[countryCode]/products/[productKey]/quote`
- Objectif prioritaire (une phrase) : recueillir le besoin, les coordonnées et le consentement explicite
  du visiteur pour transmettre sa demande à un courtier partenaire autorisé.
- Appel à l'action principal / secondaire : principal « Envoyer ma demande » (étape finale) ; pas
  d'appel secondaire sur la page elle-même (le CTA d'entrée depuis les autres pages est « Demander un
  devis »).
- Namespace i18n existant : `QuoteForm.*` — restructuration en 4 étapes réelles (D-Devis).
- Statut : restructuration.

Le formulaire progressif en 4 étapes (D-Devis) : **1. Votre besoin → 2. Vos coordonnées → 3.
Vérification et consentement → envoi → page de confirmation**, avec repli sans JavaScript sur une seule
page (les trois premières étapes deviennent trois sections empilées d'un seul formulaire, sans écran de
récapitulatif séparé puisque rien n'a encore été masqué). Chaque champ dit pourquoi il est demandé,
conformément à D-Devis.

### Structure (dans l'ordre)

**0. En-tête et indicateur de progression — composant : `Hero` + `ProgressBar`**
- Kicker : `{product} · {country}`.
- Titre : « Demander un devis ».
- Sous-titre : « Votre demande n'est transmise qu'après votre consentement explicite, à un courtier
  partenaire autorisé pour ce pays et ce produit. »
- Bandeau `TechnicalRoleNotice` : « AssurMatch est une plateforme technique de comparaison indicative et
  de mise en relation avec des courtiers partenaires autorisés. »
- Barre de progression, 4 étapes : « Votre besoin », « Vos coordonnées », « Vérification et
  consentement », « Confirmation ». Texte d'étape : « Étape {current} sur {total} ».

**1. Étape 1 — Votre besoin**
- Titre d'étape : « Votre besoin ».
- Intro : « Ces informations viennent du courtier partenaire concerné par ce produit ; elles nous
  aident à orienter votre demande vers le bon type d'offre. Elles ne remplacent pas l'analyse du
  courtier. »
- Si une offre est présélectionnée (venue de la liste ou de la fiche détail), notice au-dessus des
  champs : « Offre indicative présélectionnée : {nom du courtier partenaire responsable}, agrément
  {numéro d'agrément} [source : `GET /countries/:code/partners`]. Ce courtier confirmera le devis et les
  conditions. » — voir aussi le bloc « courtier responsable » de l'étape 3, qui répète cette identité
  juste avant le consentement (D-Devis).
- Si aucune offre n'est présélectionnée : « Votre demande sera transmise à un courtier partenaire
  autorisé pour {product} en {country} (ou jusqu'à 3 courtiers partenaires si vous cochez la case
  correspondante à l'étape suivante). Le nom du courtier retenu apparaîtra sur votre page de suivi. »
- Champs dynamiques du produit : chaque champ vient du backend (`quoteForm.fields`, texte en français
  fourni par le back-office). Cette fiche écrit uniquement l'habillage, pas le contenu des champs :
  - Introduction de la grille de champs : « Les champs suivants dépendent du produit choisi. » (pas de
    texte si le produit ne déclare aucun champ dynamique — l'étape 1 est alors réduite à la notice
    d'offre/de routage ci-dessus).
  - Espace réservé libellé vide (`select`) : « Choisir ».
  - Repère visuel obligatoire : « facultatif » (texte discret, `Forms.optional`) affiché après le
    libellé de tout champ non obligatoire ; « obligatoire » n'est jamais écrit en toutes lettres à côté
    d'un champ requis, l'astérisque suffit (le composant `Field` gère déjà cette convention).
  - Message d'erreur générique de champ obligatoire : « Ce champ est obligatoire. »
  - Exemple de champ dynamique fourni par le backend, pour l'auto en Côte d'Ivoire, à vérifier par
    l'équipe produit avant implémentation : « Marque et modèle du véhicule [exemple] » (texte, requis,
    sensibilité « personal ») avec aide « Permet au courtier partenaire de vérifier que l'offre choisie
    correspond bien à votre véhicule [exemple]. »
- Boutons : « Continuer » (vers l'étape 2). Repli sans JavaScript : pas de bouton, l'étape suivante est
  simplement la section suivante de la même page.

**2. Étape 2 — Vos coordonnées**
- Titre d'étape : « Vos coordonnées ».
- Intro : « Ces informations permettent au courtier partenaire de vous répondre. Elles ne sont
  transmises qu'après votre consentement, à l'étape suivante. »
- Champ Nom :
  - Libellé : « Nom ».
  - Texte d'aide (pourquoi) : « Facultatif : permet au courtier partenaire de vous nommer dans sa
    réponse plutôt que d'écrire "Madame, Monsieur". »
  - Pas de message d'erreur dédié (champ facultatif).
- Champ Adresse e-mail :
  - Libellé : « Adresse e-mail ».
  - Texte d'aide (pourquoi) : « Le courtier partenaire vous écrit à cette adresse pour préciser votre
    devis ; vous y recevrez aussi la confirmation de votre demande. »
  - Message d'erreur : « Adresse email invalide. » (champ obligatoire : « Ce champ est obligatoire. » si
    vide).
- Champ Téléphone :
  - Libellé : « Téléphone ».
  - Texte d'aide (pourquoi) : « Le courtier partenaire vous appelle à ce numéro pour finaliser votre
    devis. Indicatif pays compris, exemple : +225 07 00 00 00 00 [exemple]. »
  - Message d'erreur : « Numéro de téléphone invalide. » (champ obligatoire : « Ce champ est
    obligatoire. » si vide).
- Boutons : « Revenir à l'étape précédente » (secondaire) et « Vérifier ma demande » (principal, mène à
  l'étape 3 — libellé normalisé charte §5, remplace un simple « Continuer » pour cette transition
  précise puisqu'elle ouvre le récapitulatif). Repli sans JavaScript : aucun bouton, section suivante
  directement affichée.

**3. Étape 3 — Vérification et consentement**
- Titre d'étape : « Vérification et consentement ».
- Intro : « Vérifiez les informations ci-dessous avant d'envoyer votre demande. Vous pouvez encore les
  modifier. »
- **Récapitulatif éditable par section** (mode avec JavaScript uniquement ; en repli sans JavaScript,
  cette section n'existe pas, les champs des étapes 1 et 2 restant visibles et modifiables juste
  au-dessus) :
  - Bloc « Votre besoin » : reprend les réponses saisies à l'étape 1, avec un lien « Modifier » qui
    ramène à l'étape 1 sans perdre les autres réponses.
  - Bloc « Vos coordonnées » : reprend nom/e-mail/téléphone, avec un lien « Modifier » qui ramène à
    l'étape 2.
  - Chaque bloc de récapitulatif affiche le libellé du champ (texte backend pour les champs
    dynamiques) suivi de la valeur saisie ; un champ facultatif laissé vide affiche « non renseigné ».
- **Bloc courtier partenaire responsable, avant la case de consentement (D-Devis, les deux cas)** :
  - Cas avec offre présélectionnée : « {nom du courtier partenaire}, agrément {numéro d'agrément}
    [{autorité émettrice}], confirmera le devis et les conditions de cette offre. » Données réelles
    issues de l'annuaire public du pays, jamais inventées ; si l'agrément n'est pas résolu, le nom seul
    est affiché.
  - Cas sans offre présélectionnée : « Votre demande sera transmise à un courtier partenaire autorisé
    pour {product} en {country} (ou jusqu'à 3 courtiers partenaires si la case ci-dessous est cochée).
    Le nom du courtier retenu apparaîtra sur votre page de suivi après l'envoi. »
- **Bandeau de transmission**, non masquable, juste au-dessus des cases de consentement : « Rien n'est
  transmis tant que vous n'avez pas coché la case de consentement et envoyé votre demande. » (phrase de
  positionnement « Transmission », charte §4 — reprend l'actuel bandeau `IndicativeOfferNotice`, à
  vérifier qu'il porte bien ce texte exact et pas seulement la phrase « indicative »).
- **Texte de consentement (habillage uniquement — le texte lui-même vient du backend, versionné, ne pas
  le réécrire ici)** :
  - Titre du bloc : « Consentement ».
  - Phrase d'intro avant le texte : « Lisez le texte ci-dessous avant de cocher la case. »
  - Emplacement du texte backend (`consentTextId`, `version`, `contentHash` du contrat
    `publicConsentTextSchema`) : bloc de texte encadré, scrollable si long, jamais résumé ni reformulé.
  - Case à cocher de consentement, libellé exact actuel à conserver : « J'accepte que ma demande soit
    transmise à un courtier partenaire éligible pour ce pays et ce produit. »
  - Message d'erreur si la case n'est pas cochée à l'envoi : « Le consentement est obligatoire avant
    toute transmission. »
- **Case multi-courtiers** : « Facultatif : j'accepte d'être rappelé par plusieurs courtiers partenaires
  éligibles (jusqu'à 3). Sans cette case, votre demande n'est transmise qu'à un seul courtier. »
  (inchangé, conforme à D-Devis).
- **Bouton d'envoi final** : « Envoyer ma demande » (libellé normalisé charte §5, remplace l'actuel
  « Demander un devis » utilisé comme texte de bouton final — ce dernier reste le CTA d'entrée sur les
  autres pages, pas le bouton de soumission).
- **État d'envoi en cours** : bouton désactivé avec indicateur de chargement, texte d'état : « Envoi en
  cours. »

**4. Erreurs d'envoi**

| Cas | Message |
| --- | --- |
| Validation (champs invalides côté serveur) | « La demande de devis ne peut pas être envoyée avec ces informations. » |
| Trop de demandes (anti-abus) | « Trop de demandes. Réessayez plus tard. » |
| Produit fermé entre le chargement du formulaire et l'envoi | « Ce produit n'accepte plus de demandes de devis pour le moment. » — nouveau message, voir Notes d'implémentation. |
| Réseau / API indisponible | « API publique temporairement indisponible. » |
| Demande dupliquée (une demande récente similaire existe déjà) | Texte backend intégral, déjà rédigé par le service : « Une demande récente similaire existe déjà ; aucun courtier partenaire n'est notifié une seconde fois. » — affiché comme confirmation, pas comme échec (aucune donnée n'est reperdue, le visiteur reçoit tout de même un écran de fin). |

### Notes d'implémentation

- Le formulaire actuel n'est pas paginé : les trois blocs (coordonnées, besoin, consentement) sont
  affichés en une seule fois dans l'ordre coordonnées → besoin → consentement
  (`apps/public/app/components/quote-form.tsx:215-268`), avec un seul bouton d'envoi. Passer à 4 vraies
  étapes suppose : réordonner en besoin → coordonnées → vérification/consentement (D-Devis), ajouter une
  navigation par étape côté client, et construire l'écran de récapitulatif (aujourd'hui inexistant). Le
  repli sans JavaScript décrit ci-dessus est proche du comportement actuel (sections empilées), à
  réordonner seulement.
- Le bloc « courtier partenaire responsable avant consentement » n'existe pas aujourd'hui : la seule
  notice actuelle est générique (« Offre indicative présélectionnée : le courtier partenaire responsable
  confirmera le devis et les conditions. », clé `QuoteForm.preselected`,
  `apps/public/app/components/quote-form.tsx:213`), sans nom ni agrément. La page de devis
  (`apps/public/app/[locale]/countries/[countryCode]/products/[productKey]/quote/page.tsx`) ne récupère
  ni l'offre présélectionnée ni son courtier : il faut y ajouter un appel `getPublicOffer(selectedOfferId)`
  et, comme sur la fiche détail, une résolution via `listCountryPartners` pour obtenir le nom et
  l'agrément avant de les transmettre au formulaire.
- Le libellé du bouton d'envoi final doit passer de « Demander un devis » (actuel, clé `QuoteForm.submit`,
  `quote-form.tsx:282-284`) à « Envoyer ma demande » pour respecter le tableau des libellés normalisés
  (charte §5, qui distingue le CTA d'entrée du bouton d'envoi). Attention : « Demander un devis » reste
  protégé par `public-localized-wording.spec.ts:15` et doit continuer à apparaître ailleurs dans
  `quote-form.tsx` (par exemple comme CTA d'entrée du récapitulatif ou comme libellé de la barre de
  progression) pour que le test garde une occurrence valide.
- Le message backend de demande dupliquée (`quote-submission.service.ts:447`,
  « Une demande récente similaire existe déjà ; aucun courtier partenaire n'est notifié une seconde
  fois. ») est déjà renvoyé dans `response.publicMessage`
  (`apps/public/app/lib/public-api.ts:257-264`) mais n'est actuellement pas affiché à l'écran : l'écran
  de succès (`quote-form.tsx:170-206`) ignore `result.message` et affiche toujours le texte fixe
  « Demande reçue ». À corriger pour que ce message atteigne réellement le visiteur (via `BackendText`,
  car c'est un texte serveur).
- Le cas « produit fermé entre le chargement et l'envoi » n'a pas de message dédié aujourd'hui : la
  réponse d'erreur générique de l'API (`api_422` ou autre) retombe sur `QuoteForm` la clé
  `Api.quoteRejected` (`apps/public/app/lib/public-api.ts:250-252`). `[à confirmer]` : ajouter un
  `messageKey` dédié côté backend pour ce cas précis, ou accepter le message générique de validation.
- Chaîne protégée : « Demander un devis » est vérifiée par
  `public-localized-wording.spec.ts:9,15` dans `quote-form.tsx` — à garder mot pour mot quelque part
  dans ce fichier même après le renommage du bouton final.
- `[à confirmer]` : l'exemple de champ dynamique (« Marque et modèle du véhicule ») est une supposition
  raisonnable pour l'auto, à valider ou remplacer par un champ réellement publié par l'équipe produit.
- `[à mesurer]` : aucune durée de remplissage du formulaire n'est communiquée (charte §6) ; ne pas
  écrire « le formulaire prend environ 3 minutes » tant qu'aucune mesure réelle n'existe.

---

## Confirmation et suivi

- Route FR / EN : `/demandes-de-devis/[publicReference]` / `/quote-requests/[publicReference]`
- Objectif prioritaire (une phrase) : confirmer l'envoi de la demande, permettre l'ajout de documents
  optionnels et le retrait du consentement, sans jamais promettre de délai.
- Appel à l'action principal / secondaire : principal « Retirer mon consentement » (si le visiteur le
  souhaite) ; secondaire « Voir les pays ouverts ».
- Namespace i18n existant : `QuoteRequest.*` — réécriture ciblée (retrait de consentement, états de
  jeton).
- Statut : réécriture.

### Structure (dans l'ordre)

**1. En-tête et confirmation — composant : `Hero` + bloc référence**
- Kicker : « Demande de devis ».
- Titre : « Demande reçue {référence} ».
- Sous-titre : « Votre demande sera traitée par un courtier partenaire identifié lorsque le routage est
  possible. »
- Bandeau : `IndicativeOfferNotice` (« Offre indicative, prix indicatif, à confirmer par le courtier
  partenaire. »).
- Barre de progression, étape 4 sur 4 atteinte : « Votre besoin », « Vos coordonnées », « Vérification
  et consentement », « Confirmation ».
- Bloc référence : libellé « Référence publique », valeur affichée en chiffres/lettres tabulaires,
  bouton « Copier la référence » (confirmation au clic : « Référence copiée »).
- Bloc « Prochaines étapes » (ce qui se passe ensuite, sans promesse de délai) :
  1. « Votre demande est enregistrée sous la référence ci-dessus : conservez-la pour tout échange. »
  2. « Un courtier partenaire autorisé reprend votre demande lorsque le routage est possible pour ce
     pays et ce produit. »
  3. « Vous pouvez ajouter des documents optionnels ou retirer votre consentement depuis cette page. »
- Aucun délai de réponse n'est promis (charte §6) : bandeau complémentaire « Si aucun courtier
  partenaire éligible n'est disponible, aucune promesse de rappel n'est faite. »

**2. Documents optionnels — composant : section « Documents optionnels »**
- Titre : « Documents optionnels ».
- Introduction implicite (pas de phrase supplémentaire nécessaire, le titre + les lignes suffisent).
- Une ligne par document déjà envoyé : « {libellé} ({nom de fichier}, {taille} Ko) : {état} », complétée
  de « - transmis au courtier partenaire » si déjà partagé.
- États de vérification d'un document, avec icône dédiée :
  | État | Icône/ton | Texte |
  | --- | --- | --- |
  | En attente | horloge, neutre | « vérification en cours » |
  | Sain | document validé, succès | « vérifié » |
  | Infecté | triangle d'alerte, danger | « refusé (fichier non sain, mis en quarantaine) » |
  | Échec de vérification | rafraîchir, avertissement | « vérification à relancer » |
- Aucun document envoyé : « Aucun document ajouté. »
- Ajout de document désactivé pour ce produit : « L'ajout de documents n'est pas disponible pour ce
  produit. »
- Formulaire d'ajout (si activé) : composant existant `QuoteDocumentUpload`, dont les messages
  d'erreur/succès viennent de l'API :
  - Succès : « Document reçu. Il sera vérifié puis transmis au courtier partenaire responsable de votre
    demande. »
  - Trop volumineux : « Fichier trop volumineux (5 Mo maximum). »
  - Refusé (format ou quota) : « Document refusé : format PDF, JPEG ou PNG, 5 Mo maximum, 5 documents
    par demande. »
  - Trop d'envois : « Trop d'envois. Réessayez plus tard. »
  - Fonction désactivée : « L'ajout de documents n'est pas disponible pour ce produit. »

**3. Retrait de consentement — composant : `ConsentWithdrawal`**
- Titre de section : « Retirer mon consentement ».
- Sous-titre de section : « Vous pouvez retirer à tout moment le consentement donné lors de votre
  demande. »
- Texte d'explication (avant tout clic) : « Retirer votre consentement annule votre demande de devis :
  le courtier partenaire est informé qu'il ne doit plus vous contacter au sujet de cette demande, et vos
  réponses ne lui sont plus transmises. Cette action est définitive pour cette demande ; vous pourrez
  toujours en déposer une nouvelle. »
- Bouton d'ouverture : « Retirer mon consentement ».
- **Dialogue de confirmation (affiché dans la page, jamais une boîte `confirm()` du navigateur)** :
  - Question, en évidence : « Confirmez-vous le retrait de votre consentement pour la demande
    {référence} ? »
  - Bouton de confirmation : « Confirmer le retrait ».
  - Bouton d'annulation : « Annuler ».
  - État d'envoi : « Retrait en cours. »
- **Succès (première demande de retrait)** : titre « Consentement retiré », description « Votre demande
  de devis est annulée et le courtier partenaire a été informé. Il ne doit plus vous contacter au sujet
  de cette demande. »
- **Déjà retiré (le visiteur revient sur une demande déjà annulée)** : titre « Consentement déjà
  retiré », description « Votre demande a déjà été annulée ; le courtier partenaire en avait déjà été
  informé. » — texte à aligner sur la phrase déjà renvoyée par le service
  (`quote-submission.service.ts:342`, à afficher via texte backend plutôt que réécrit en dur, voir Notes
  d'implémentation).
- **Erreur** : « Le retrait de consentement n'a pas pu être enregistré avec ce lien. »
- **Lien de suivi manquant** (visiteur arrivé sans jeton) : « Le retrait de consentement nécessite le
  lien de suivi reçu à la fin de votre demande. »

**4. État de jeton manquant ou invalide (page atteinte sans `token` valide, ou avec un `token`
malformé)**
- Documents : notice « Le lien de suivi transmis à la fin de votre demande permet d'ajouter des
  documents optionnels. »
- Retrait de consentement : notice « Le retrait de consentement nécessite le lien de suivi reçu à la fin
  de votre demande. »
- Si un jeton est présent mais que l'API ne retrouve aucun document (référence/jeton incorrects) :
  titre « Documents indisponibles » (état vide), description : message renvoyé par l'API ou, à défaut,
  « Le lien de suivi transmis à la fin de votre demande permet d'ajouter des documents optionnels. »
- Aucune information sur l'existence ou non de la référence n'est révélée par un message différent :
  un jeton incorrect et une référence inconnue produisent le même texte (cohérent avec le choix backend
  de renvoyer le même message pour les deux cas, `quote-submission.service.ts:67`).

**5. Sortie de page**
- Bouton final : « Voir les pays ouverts » (secondaire).

### Notes d'implémentation

- Le message « déjà retiré » existe déjà côté backend
  (`backend/src/modules/quote-requests/quote-submission.service.ts:337-343`, réponse avec
  `alreadyWithdrawn: true` et le message « Votre demande a deja ete annulee; le courtier partenaire en
  avait ete informe. ») et remonte déjà jusqu'à `submitPublic`/`withdrawQuoteConsent`
  (`apps/public/app/lib/public-api.ts:517-526`, qui renvoie `publicMessage: serverMessage ?? successText`).
  Mais le composant `ConsentWithdrawal` ignore ce message et affiche toujours le texte fixe
  `labels.successDescription` (`apps/public/app/components/forms/consent-withdrawal.tsx:57-63`), donc
  le visiteur ne voit jamais la distinction entre un premier retrait et un retrait déjà fait. Corriger
  en affichant `result.message` (texte backend, via `BackendText`) à la place du texte fixe, ou en
  gardant le texte fixe uniquement comme repli si le backend n'a rien renvoyé.
- Il n'existe pas aujourd'hui de distinction visuelle entre « jeton absent » et « jeton présent mais
  invalide » : la page vérifie seulement que le paramètre `token` correspond à un format attendu
  (`apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx:74-76`) puis tente l'appel ; en
  cas d'échec, l'état vide générique `unavailable` s'affiche (`page.tsx:194-202`, clé
  `QuoteRequest.unavailable`). Le texte proposé au point 4 reste compatible avec ce comportement actuel
  sans changement de code, seul le texte peut être affiné si l'équipe veut distinguer davantage les deux
  cas `[à confirmer]`.
- Chaîne protégée : « Demander un devis » et « Comparer les offres » doivent rester identifiables mot
  pour mot quelque part dans cette page (`public-localized-wording.spec.ts:9,14-15`, qui lit directement
  `quote-requests/[publicReference]/page.tsx`) ; aujourd'hui elles n'y apparaissent qu'indirectement via
  la barre de progression (`quote.steps.*`, qui ne contient pas ces libellés) — à vérifier lors de
  l'implémentation que le test passe toujours (par exemple via le bouton « Voir les pays ouverts » vers
  `/countries`, qui ne suffit pas : il faudra probablement garder un lien explicite « Comparer les
  offres » ou « Demander un devis » sur cette page, par exemple dans le bloc « Prochaines étapes » ou en
  pied de page).
- `[à confirmer]` : le texte « déjà retiré » ci-dessus doit être validé pour cohérence avec le message
  backend existant (accents et orthographe : le backend écrit aujourd'hui sans accents, `deja`, `ete` —
  probablement une contrainte d'encodage à vérifier côté backend, hors périmètre de ce fichier).

---

## Récapitulatif des marqueurs

- `[à confirmer]` : 6 occurrences (données de carte à trancher — `validUntil` sur `OfferSummary` ;
  distinction fine « aucune offre » vs « aucun résultat pour ces filtres » ; catégorie de raison
  d'indisponibilité d'une offre exposée publiquement ; exemple de champ dynamique du formulaire de
  devis ; message dédié « produit fermé » ; distinction fine des états de jeton sur la page de suivi).
- `[à vérifier juridiquement]` : aucune occurrence (aucune mention d'autorité de tutelle ou d'agrément
  n'est affirmée comme fait dans ce fichier ; les numéros d'agrément affichés viennent toujours de
  l'annuaire public existant, jamais inventés ici).
- Décisions produit prises dans ce fichier faute d'arbitrage existant, à valider par l'équipe : le
  passage du tri par défaut à `score_desc` et la suppression de `name_asc`/`sponsored_explicit` de
  l'interface visiteur (application directe de D-Tri, déjà tranchée) ; le déplacement de la date de
  mise à jour hors du tiroir « Voir plus » de la carte (application directe de la demande du brief) ;
  le renommage du bouton d'envoi final en « Envoyer ma demande » avec maintien de « Demander un devis »
  ailleurs dans le même fichier pour ne pas casser le garde-fou de test.
