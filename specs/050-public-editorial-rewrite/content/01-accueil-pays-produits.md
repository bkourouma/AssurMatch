# 01 — Accueil, pays et produits

Ce fichier applique la charte éditoriale `00-charte-editoriale.md` (format de fiche section 8) et
respecte la constitution AssurMatch, sections I, II et VIII. Périmètre : Web Publique Client
uniquement (`apps/public`). Aucun autre fichier du dépôt n'est modifié par ce livrable.

## Arborescence des pages couvertes (routes FR / EN)

```
/                                                           fr: /                          en: /en
/countries                                                  fr: /pays                      en: /en/countries
  -> pays "waitlist"    (même route, variante liste d'attente)
/countries/[countryCode]                                    fr: /pays/{countryCode}         en: /en/countries/{countryCode}
  -> availability = waitlist : variante "liste d'attente"
  -> availability = open | pilot : variante "pays ouvert"
/countries/[countryCode]/products/[productKey]              fr: /pays/{countryCode}/produits/{productKey}
                                                              en: /en/countries/{countryCode}/products/{productKey}
```

Routes voisines citées pour le fil d'Ariane et les liens sortants (non traitées ici) :
`/countries/[countryCode]/brokers` (fr `/pays/{countryCode}/courtiers`),
`/countries/[countryCode]/products/[productKey]/offers` (fr `.../offres`), `.../quote` (fr
`.../devis`), `/how-it-works` (fr `/comment-ca-marche`), `/regulatory-status` (fr
`/statut-reglementaire`), `/guides` (fr `/guides`).

---

## Accueil

- Route FR / EN : `/` / `/en`
- Objectif prioritaire (une phrase) : faire comprendre en un écran que l'on compare d'abord des offres
  indicatives et que l'on est ensuite accompagné par un courtier autorisé, sans jamais laisser croire
  qu'AssurMatch vend, signe ou encaisse.
- Appel à l'action principal / secondaire : principal = soumettre le sélecteur pays + produit
  (« Comparer les offres ») ; secondaire, un par section = « Voir le parcours en détail »,
  « Consulter notre statut réglementaire », « Voir tous les guides ».
- Namespace i18n existant : `Home.*` (dont `Home.preview.*`), `Layout.entrySelector.*` (pas de nouveau
  namespace).
- Statut : réécriture

### Structure (dans l'ordre)

1. Hero — composant : `Hero` (`apps/public/app/components/ui/hero.tsx`)
   - Kicker : « Comparaison indicative, pays par pays »
   - Titre : « Comparez d'abord. Soyez accompagné ensuite. »
     (reprend la promesse D-Signature retenue pour le bandeau de signature ; sur le hero elle sert de
     promesse directe plutôt que de slogan de marque — voir note plus bas sur la cohérence avec le
     bandeau final)
   - Sous-titre : « AssurMatch compare des offres indicatives et vous met en relation avec un courtier
     autorisé. Nous ne vendons pas d'assurance, nous ne signons pas de contrat et nous ne recevons pas
     votre prime. » (phrase « Moyenne » de la charte section 4, mot pour mot)
   - Corps / microcopie :
     - Ligne de pays pré-sélectionné : « Pays pré-sélectionné : {country}. Vous pouvez en changer à
       tout moment, rien n'est redirigé automatiquement. »
     - Variante sans pré-sélection : « Aucun pays n'est pré-sélectionné pour l'instant. Choisissez le
       vôtre dans la liste, vous pourrez en changer à tout moment. »
     - Sélecteur (`EntrySelector`) : titre « Choisissez votre pays et votre produit » ; champ Pays
       (liste des pays ouverts et pilotes uniquement — un pays en liste d'attente n'apparaît pas ici,
       il n'a ni comparaison ni devis) ; champ Produit (filtré sur le pays choisi).

     Note d'implémentation : ce formulaire reste opérable sans JavaScript.
   - Boutons : bouton de soumission du sélecteur = « Comparer les offres » (libellé normalisé, charte
     section 5 ; déjà conforme dans le code, `Layout.entrySelector.submit`)
   - Données affichées (source) : liste des pays ouverts/pilotes et leurs produits vient de
     `GET /countries` et `GET /countries/:code/products` (`listPublicProducts`, `readVisitorCountry`) ;
     aucune donnée inventée.
   - États :
     - normal : sélecteur affiché, pays visiteur pré-rempli si disponible et non en liste d'attente.
     - vide (aucun pays sélectionnable) : `Notice` info : « Le sélecteur de pays et de produit est
       momentanément indisponible. Vous pouvez parcourir la liste des pays. »

2. Aside du hero — composant : `OfferPreview` (`apps/public/app/components/home/offer-preview.tsx`)
   - Kicker : aucun (bloc décoratif, `aria-hidden="true"`, jamais lu par un lecteur d'écran)
   - Titre : aucun titre propre ; carte de tête avec :
     - Nom de produit : « Assurance auto `[exemple]` »
     - Ligne partenaire : « Courtier partenaire autorisé » (rôle, pas une donnée)
     - Badge : « Offre indicative »
   - Sous-titre : néant
   - Corps / microcopie :
     - Trois garanties génériques (noms de garanties réels du catalogue, pas des valeurs inventées) :
       « Responsabilité civile », « Vol et incendie », « Assistance »
     - Bloc score : libellé « Score indicatif » au-dessus d'une jauge purement visuelle, sans chiffre
       ni pourcentage affiché, pour ne jamais laisser croire à un vrai score `[exemple]`
     - Ligne prix : libellé « Prix indicatif », valeur « À confirmer » (littéral, pas un montant)
   - Boutons : aucun, le bloc n'est pas interactif
   - Données affichées (source) : aucune, contenu 100 % éditorial et marqué comme tel
   - États : néant, bloc statique masqué en dessous de 1024 px (déjà le comportement CSS)

3. Chiffres réels — composant : `Section` + `Stat` (D-Chiffres)
   - Kicker : « En chiffres »
   - Titre : « AssurMatch aujourd'hui »
   - Sous-titre : « Chiffres issus des activations publiques de la plateforme. »
   - Corps / microcopie : trois compteurs : « Pays ouverts », « Courtiers partenaires actifs »,
     « Offres validées » ; sous les compteurs : « Chiffres arrêtés au {date}. » puis « Ces chiffres
     sont indicatifs et décrivent l'état des activations publiques, pas une donnée auditée. »
   - Boutons : aucun
   - Données affichées (source) : `GET /public-stats` exclusivement (`getPublicStats`). Aucun chiffre
     saisi à la main.
   - États :
     - succès avec au moins une valeur non nulle : bloc affiché.
     - appel en échec : bloc entièrement masqué (déjà implémenté).
     - **appel en succès mais toutes les valeurs valent zéro : bloc entièrement masqué** — règle
       D-Chiffres explicite non couverte par le code actuel, voir notes d'implémentation.

4. Comment ça marche — composant : `Section` + cartes d'étape numérotées
   - Kicker : « Le parcours »
   - Titre : « Comment ça marche »
   - Sous-titre : « Trois étapes, sans engagement, et une transmission uniquement après votre
     consentement explicite. »
   - Corps / microcopie (trois étapes réelles, pas une liste de trois de confort) :
     1. « Comparez » : « Vous comparez des offres indicatives par pays et par produit, avec leurs
        garanties, leur prix indicatif et un score expliqué. »
     2. « Demandez un devis » : « Vous remplissez une demande de devis et vous donnez votre
        consentement explicite avant toute transmission. »
     3. « Le courtier confirme » : « Un courtier partenaire autorisé pour ce pays et ce produit reprend
        votre demande, confirme le devis et les conditions, puis vous accompagne. »
        (renommé depuis « Souscrivez auprès du courtier » : le verbe seul, sans complément de délai,
        évite toute ambiguïté avec le vocabulaire interdit lié à la souscription)
   - Boutons : « Voir le parcours en détail » -> `/how-it-works`
   - Données affichées (source) : aucune, contenu éditorial fixe
   - États : néant

5. Notre rôle (fait / ne fait pas) — composant : `Section` + `PlatformStatusNotice` + deux listes
   - Kicker : « Transparence »
   - Titre : « Notre rôle »
   - Sous-titre : « Ce qu'AssurMatch fait, et ce qu'AssurMatch ne fait pas. »
   - Corps / microcopie :
     - `PlatformStatusNotice` (chaîne protégée mot pour mot, voir notes) : « AssurMatch est une
       plateforme technique de comparaison indicative et de mise en relation avec des courtiers
       partenaires autorisés. »
     - Phrase de détail : « AssurMatch ne vend pas d'assurance, n'émet ni contrat ni attestation,
       n'encaisse aucune prime et ne donne aucun conseil personnalisé engageant. Le courtier partenaire
       autorisé pour votre pays et votre produit reste seul responsable du devis et des conditions. »
     - Colonne « Ce qu'AssurMatch fait » : compare des offres indicatives pays par pays et produit par
       produit ; explique les garanties, le prix indicatif et le score affiché ; transmet la demande à
       un courtier partenaire autorisé après consentement explicite ; signale chaque offre sponsorisée
       par un badge orange visible.
     - Colonne « Ce qu'AssurMatch ne fait pas » : ne vend pas d'assurance ; n'émet ni contrat ni
       attestation ; n'encaisse aucune prime ; ne donne aucun conseil personnalisé engageant.
   - Boutons : « Consulter notre statut réglementaire » -> `/regulatory-status`
   - Données affichées (source) : aucune, positionnement fixe (Constitution I et II)
   - États : néant

6. Guides pédagogiques — composant : `Section` + `GuideCard`
   - Kicker : « Guides »
   - Titre : « Comprendre avant de comparer »
   - Sous-titre : « Des explications simples sur les garanties et le prix indicatif, sans conseil
     personnalisé engageant. »
   - Corps / microcopie : trois guides mis en avant, incluant les nouveaux guides D-Guides —
     « Comprendre la franchise », « La responsabilité civile, simplement », « Déclarer un sinistre : les
     bons réflexes » : chaque carte affiche son temps de lecture calculé (jamais saisi) et « Mis à jour
     le {date} ».
   - Boutons : « Lire » (par carte), « Voir tous les guides » -> `/guides`
   - Données affichées (source) : `listGuides(locale)` (contenu éditorial de
     `apps/public/app/content/guides`), trois premiers guides seulement.
   - États : bloc masqué si aucun guide disponible.

7. Bandeau de signature — composant : `Section` (tone `navy`)
   - Kicker : « AssurMatch »
   - Titre : « Comparer d'abord. Être accompagné ensuite. » `[à valider par la marque]` (remplacement
     D-Signature de « Le bon courtier, pour un meilleur avenir », superlatif retiré)
   - Sous-titre : « Comparez des offres indicatives, puis laissez un courtier partenaire autorisé
     confirmer le devis et les conditions. »
   - Corps / microcopie : notice finale : « Offre indicative. Le prix et les conditions sont confirmés
     par le courtier partenaire. » (phrase « Courte » de la charte section 4) suivie de « Vous ne payez
     rien à AssurMatch. Ce sont les courtiers partenaires qui paient un abonnement ou les demandes
     qu'ils reçoivent. » (phrase « Rémunération » de la charte section 4, ajoutée ici pour répondre
     explicitement à la consigne de rappeler qu'AssurMatch ne vend pas, ne signe pas et n'encaisse pas
     de prime)
   - Boutons : « Comparer les offres » -> `/countries`
   - Données affichées (source) : aucune
   - États : néant

### Notes d'implémentation

- `apps/public/app/[locale]/page.tsx:82-86` : renommer l'étape 3 de « Souscrivez auprès du courtier » à
  « Le courtier confirme » et ajuster `Home.steps.broker.title` dans `messages/fr.json` en conséquence.
- `apps/public/app/[locale]/page.tsx:72-79` (fonction `statValue`) : ajouter la règle D-Chiffres
  manquante — masquer tout le bloc `stats` quand `stats.status === "success"` mais que les trois
  compteurs retenus valent tous 0, pas seulement quand ils sont `undefined`. Aujourd'hui seul un
  compteur individuellement non fini est retiré, un triplet de zéros reste affiché.
- `apps/public/app/[locale]/page.tsx:229-246` et `messages/fr.json` clé `Home.signature` : remplacer
  « Le bon courtier, pour un meilleur avenir » par la nouvelle signature `[à valider par la marque]`
  avant publication ; vérifier qu'aucun test ne fixe l'ancienne chaîne (aucune occurrence trouvée dans
  `apps/public/tests/*.spec.ts` ni `backend/tests/guardrails/content/public-localized-wording.spec.ts`).
- Chaîne protégée mot pour mot : `apps/public/app/components/site/platform-status-notice.tsx:8-9`
  fixe en dur les sous-chaînes « plateforme technique » et « comparaison indicative » (Constitution I).
  Ne pas y toucher au-delà de la ponctuation.
- `Home.preview.*` (`messages/fr.json`) : le produit affiché dans `OfferPreview` est actuellement
  « Assurance auto » sans marqueur ; ajouter `[exemple]` dans le contenu source si le composant doit un
  jour afficher ce marqueur à l'écran, ou documenter dans un commentaire de code que ce nom est fixe et
  ne représente aucune offre réelle (le composant est déjà `aria-hidden`, donc le risque de confusion
  reste faible).
- `[à confirmer]` : aucun.
- `[à vérifier juridiquement]` : aucun sur cette page (aucun fait réglementaire cité).

---

## Liste des pays et variante liste d'attente

- Route FR / EN : `/pays` / `/en/countries` (liste) ; `/pays/{countryCode}` /
  `/en/countries/{countryCode}` quand `availability = waitlist` (variante liste d'attente de la même
  route que la page pays ouverte).
- Objectif prioritaire (une phrase) : orienter chaque visiteur vers l'état réel de son pays — ouvert,
  pilote, ou pas encore ouvert — sans jamais laisser croire à une couverture qui n'existe pas.
- Appel à l'action principal / secondaire : liste = principal « Voir ce pays » par carte, aucun
  secondaire de page. Variante liste d'attente = principal « Être informé de l'ouverture »
  (formulaire), secondaire « Voir ce pays » vers un pays déjà ouvert.
- Namespace i18n existant : `Countries.*`, `Waitlist.*`.
- Statut : réécriture

### Structure (dans l'ordre)

1. Hero de la liste — composant : `Hero` + `Breadcrumb`
   - Kicker : « Pays couverts »
   - Titre : « Pays couverts par AssurMatch »
   - Sous-titre : « Les pays et produits visibles dépendent des activations publiques. Choisissez votre
     pays pour voir les produits comparables et les courtiers partenaires autorisés. »
   - Corps / microcopie : fil d'Ariane Accueil > Pays
   - Boutons : aucun sur le hero
   - Données affichées (source) : `GET /countries` (`listCountryDirectory`)
   - États :
     - erreur : `EmptyState` — titre « Liste des pays indisponible », description « Le service public
       est temporairement indisponible. Réessayez dans quelques minutes. », bouton retour à l'accueil.
     - vide : `EmptyState` — titre « Aucun pays public actif », description « Aucun pays n'est
       publiquement activé pour le moment. »

2. Groupe « Pays ouverts » : composant : `Section` + liste de cartes pays
   - Kicker : « {n} pays référencés » (pluriel automatique)
   - Titre : « Pays ouverts »
   - Sous-titre : « La comparaison indicative et la demande de devis sont disponibles. »
   - Corps / microcopie : par pays — drapeau, nom, badge « Ouvert », pastilles « Comparaison
     indicative » / « Demande de devis » selon activation, devise si connue
   - Boutons : la carte entière est un lien « Voir ce pays » (texte visuellement caché pour lecteur
     d'écran)
   - Données affichées (source) : `listCountryDirectory`, champs `comparisonEnabled`, `quoteEnabled`,
     `currency`
   - États : groupe absent si aucun pays ouvert

3. Groupe « Pays pilotes » : même composant
   - Titre : « Pays pilotes »
   - Sous-titre : « Ouverture progressive avec un nombre limité de courtiers partenaires. »
   - Badge : « Pilote »
   - Reste identique au groupe précédent (mêmes pastilles, même lien)

4. Groupe « Pas encore ouverts » : même composant, mène vers la variante liste d'attente
   - Titre : « Pas encore ouverts »
   - Sous-titre : « Ces pays ne sont pas encore ouverts. Vous pouvez demander à être informé de leur
     ouverture. »
   - Badge : « Pas encore ouvert »
   - Lien de carte : « Être informé de l'ouverture » (texte caché différent du lien « Voir ce pays »)

5. Bandeau bas de page — composant : `Section` compact + `Notice`
   - Corps / microcopie : « Une ouverture de pays dépend de la présence de courtiers partenaires
     autorisés et d'offres validées. »
   - États : affiché uniquement si au moins un pays est référencé

6. Hero de la variante liste d'attente — composant : `Hero` (même route que la page pays, branche
   `availability = waitlist`)
   - Kicker : « Pas encore ouvert »
   - Titre : « {country} : AssurMatch n'est pas encore ouvert »
   - Sous-titre : « Aucune offre indicative n'est comparable et aucune demande de devis ne peut être
     transmise pour ce pays tant qu'il n'est pas ouvert. »
   - Aside : carte d'identité pays (drapeau, nom, badge « Pas encore ouvert », pastilles de capacité si
     connues)
   - États : page non indexée (`noindex`) tant que le pays n'est pas ouvert

7. Formulaire liste d'attente — composant : `WaitlistForm`
   - Kicker : « Être informé de l'ouverture » (légende du formulaire)
   - Corps / microcopie d'introduction : « Un pays n'ouvre qu'une fois des courtiers partenaires
     autorisés référencés et des offres validées disponibles. Laissez-nous votre adresse e-mail : vous
     serez informé de l'ouverture publique de {country}. » puis `Notice` info « Aucun parcours de devis
     n'est proposé depuis cette page. » puis `PlatformStatusNotice`.
   - Champs :
     - Adresse e-mail (obligatoire) — indice : « Utilisée uniquement pour vous prévenir de l'ouverture
       de ce pays. »
     - Produit souhaité (facultatif) — indice « Facultatif. », option par défaut « Sans préférence »
     - Case de consentement (jamais précochée) : « J'accepte d'être informé par e-mail de l'ouverture
       publique de ce pays. »
     - Champ piège anti-robot invisible « Ne remplissez pas ce champ » (visuellement caché, honeypot)
   - Boutons : « Être informé de l'ouverture » (soumission), état en cours « Enregistrement en cours. »
   - Données affichées (source) : aucune donnée réelle affichée, uniquement microcopie de formulaire
   - États :
     - vide (champ e-mail manquant) : erreur sur le champ : « Indiquez une adresse e-mail valide. »
     - vide (consentement non coché) : erreur sur la case : « Votre accord est nécessaire avant tout
       enregistrement. »
     - chargement : bouton désactivé, libellé « Enregistrement en cours. »
     - succès (première inscription) : `Notice` succès — titre « Inscription enregistrée »,
       description « Vous serez informé par e-mail de l'ouverture publique de ce pays. Aucune demande
       de devis n'a été transmise. »
     - **doublon (adresse déjà inscrite pour ce pays)** : **exactement le même écran de succès que la
       première inscription**, mot pour mot. Le système ne révèle jamais à l'extérieur qu'une adresse
       était déjà enregistrée (choix délibéré du backend, voir notes d'implémentation) ; il n'existe
       pas de texte de doublon spécifique et il ne doit pas en exister un.
     - erreur (échec technique de l'enregistrement) : `Notice` erreur : « Inscription impossible pour
       le moment. »

8. Pays déjà ouverts (bloc de reroutage) — composant : `Section` (tone muted) + liste de cartes pays
   - Titre : « Pays déjà ouverts »
   - Sous-titre : « Vous pouvez comparer des offres indicatives dans ces pays. »
   - Corps / microcopie : jusqu'à 8 pays ouverts ou pilotes, même gabarit de carte que le groupe 2/3
   - États : bloc absent si aucun pays ouvert ou pilote

### Notes d'implémentation

- `apps/public/app/[locale]/countries/page.tsx:44-48` : groupes déjà corrects (open / pilot /
  waitlist) ; pas de changement de structure, uniquement de texte.
- `apps/public/app/[locale]/countries/[countryCode]/page.tsx:335-417` (`WaitingCountry`) : le
  comportement « doublon = même succès » est déjà implémenté côté backend, voir
  `backend/src/modules/waitlist/waitlist.module.ts:98-113` — un enregistrement existant déclenche
  `PUBLIC_SITE_AUDIT_ACTIONS.waitlistDuplicateIgnored` puis renvoie la même réponse de succès que
  pour une première inscription. Ne rien changer à cette logique, seulement confirmer qu'aucune future
  évolution de copy n'introduise un message de doublon visible.
- `Waitlist.form.website` (`messages/fr.json`) : le champ honeypot doit rester invisible visuellement
  mais garder son label pour les lecteurs d'écran qui ignorent le CSS ; vérifié par
  `apps/public/tests/public-brokers.spec.ts:35-36` sur un autre formulaire du même type
  (`am-visually-hidden`), à répliquer ici si ce n'est pas déjà le cas.
- `[à confirmer]` : aucun.
- `[à vérifier juridiquement]` : aucun (aucune autorité ni numéro d'agrément cité sur cette page).

---

## Page pays ouverte

- Route FR / EN : `/pays/{countryCode}` / `/en/countries/{countryCode}` (branche
  `availability = open | pilot`).
- Objectif prioritaire (une phrase) : confirmer que le pays est couvert, présenter ses produits
  comparables et ses courtiers partenaires, et orienter vers un produit précis.
- Appel à l'action principal / secondaire : principal = « Comparer les offres » par produit ; secondaire
  = « Voir la fiche produit » et « Demander un devis » (quand activé).
- Namespace i18n existant : `Country.*`, `Countries.*` (pastilles partagées).
- Statut : réécriture

### Structure (dans l'ordre)

1. Hero pays — composant : `Hero` + `Breadcrumb` + `CountryIdentityCard`
   - Kicker : « Fiche pays »
   - Titre (variante Côte d'Ivoire) : « Assurance en Côte d'Ivoire »
   - Titre (variante Sénégal, dormante : le Sénégal est en liste d'attente, cette variante ne
     s'affiche que le jour où il passe en `open` ou `pilot`) : « Assurance au Sénégal »
   - Sous-titre (Côte d'Ivoire) : « Comparez des offres indicatives d'assurance auto, santé,
     habitation et voyage en Côte d'Ivoire, puis faites confirmer le devis et les garanties par un
     courtier autorisé par l'autorité compétente `[à vérifier juridiquement]`. »
   - Sous-titre (Sénégal) : « Comparez des offres indicatives d'assurance auto, santé, habitation et
     voyage au Sénégal, puis faites confirmer le devis et les garanties par un courtier autorisé par
     l'autorité compétente `[à vérifier juridiquement]`. »
   - Corps / microcopie : notice pilote, affichée uniquement si `availability = pilot` : « Ce pays est
     en phase pilote : le nombre de courtiers partenaires et d'offres comparables y est encore
     limité. »
   - Aside `CountryIdentityCard` : drapeau, nom du pays, badge « Ouvert » ou « Pilote », pastilles
     « Comparaison indicative » / « Demande de devis » selon activation, devise (« FCFA » pour la
     Côte d'Ivoire)
   - Boutons : aucun bouton direct sur le hero, l'action se fait dans le bloc Produits
   - Données affichées (source) : `listCountryDirectory`
   - États : néant (la page 404 avant ce point si le pays n'existe pas dans l'annuaire)

2. Produits comparables — composant : `Section` + liste de cartes produit
   - Kicker : aucun (titre direct)
   - Titre : « Produits comparables »
   - Sous-titre : « Chaque produit donne accès aux offres indicatives et, lorsque l'activation le
     permet, à une demande de devis. »
   - Corps / microcopie : par produit — icône, nom, badges « Comparaison activée » / « Comparaison non
     activée », « Devis activé » / « Devis non activé » ; si non activée, une phrase d'explication
     dédiée : « La comparaison publique n'est pas activée pour ce produit dans ce pays. » ou « La
     demande de devis n'est pas disponible pour ce produit dans ce pays. »
   - Boutons (par produit, selon activation) : « Comparer les offres » (si comparaison activée), « Voir
     la fiche produit » (toujours), « Demander un devis » (si devis activé)
   - Données affichées (source) : `GET /countries/:code/products` (`listPublicProducts`)
   - États :
     - erreur : `EmptyState` : « Produits indisponibles » / « Le catalogue public est temporairement
       indisponible pour ce pays. »
     - vide : `EmptyState` : « Aucun produit public actif » / « Aucune demande de devis ne peut être
       transmise tant qu'un produit n'est pas activé publiquement pour ce pays. »

3. Courtiers partenaires — composant : `Section` (tone muted) + `BrokerBlock`
   - Titre : « Courtiers partenaires »
   - Sous-titre : « Chaque courtier partenaire est identifié par son numéro de licence et son autorité
     de délivrance. »
   - Corps / microcopie : jusqu'à 3 courtiers affichés — raison sociale, numéro de licence, autorité de
     délivrance, ville (si connue), produits couverts (noms résolus depuis le catalogue), badge
     « Agréé »
   - Boutons : « Voir tous les courtiers partenaires » -> `/pays/{countryCode}/courtiers`
   - Données affichées (source) : `GET /countries/:code/partners` (`listCountryPartners`)
   - États : vide — `EmptyState` « Aucun courtier partenaire publié » / « Aucun courtier partenaire
     n'est publiquement référencé pour ce pays pour le moment. »

4. Contact local — composant : `Section` + `PlatformStatusNotice` + bouton WhatsApp / appel
   - Titre : « Contact local »
   - Sous-titre : « Un courtier partenaire autorisé pour ce pays peut reprendre votre demande. »
   - Corps / microcopie : `PlatformStatusNotice`, puis bouton WhatsApp « Écrire sur WhatsApp » et lien
     d'appel « Appeler {phone} » **uniquement si un numéro est publié** — aucun numéro WhatsApp ni
     adresse physique par pays n'existe aujourd'hui dans l'annuaire public `[à confirmer]`.
   - Boutons : conditionnels, voir ci-dessus
   - Données affichées (source) : champs optionnels `whatsapp` / `phone` de l'annuaire pays, absents
     aujourd'hui
   - États : bloc de contact direct entièrement masqué tant qu'aucun numéro n'est publié (déjà le
     comportement du code)

5. Notice finale — composant : `Notice` (tone indicative)
   - Corps / microcopie : « Offre indicative, prix indicatif à confirmer par le courtier partenaire.
     Aucune offre expirée ou non validée n'est affichée comme disponible. »

### Notes d'implémentation

- `apps/public/app/[locale]/countries/[countryCode]/page.tsx:155-172` (`OpenCountry`) : le titre est
  aujourd'hui généré par le gabarit `Country.title = "Assurance en {country}"`, ce qui produit déjà
  « Assurance en Côte d'Ivoire » et, à vérifier, « Assurance en Sénégal » plutôt que « Assurance au
  Sénégal » selon la règle de genre. Le gabarit générique doit rester tel quel pour tous les pays futurs,
  mais si un texte figé par pays est souhaité (comme proposé ci-dessus pour la Côte d'Ivoire et le
  Sénégal), il faudra une clé par pays plutôt qu'un seul gabarit `{country}` : décision produit non
  prise, à trancher avant implémentation.
- `apps/public/app/[locale]/countries/[countryCode]/page.tsx:307-332` (`CountryContact`) : lit des
  champs `whatsapp` / `phone` non exposés par `PublicCountryDirectoryItem` aujourd'hui ; tant que le
  backend ne les publie pas, ce bloc de contact direct reste invisible. C'est un suivi backend, pas un
  changement de ce fichier.
- Autorité de régulation : aucune source vérifiée dans le dépôt ne nomme l'autorité de tutelle par
  pays (charte section 6 : « numéro d'agrément et autorité de tutelle de chaque pays, les faits CIMA
  sont marqués `[à vérifier juridiquement]` »). J'ai gardé une formulation neutre « l'autorité
  compétente » plutôt que de nommer une autorité précise (CIMA, ASACI, DA/Sénégal...) pour éviter
  d'inventer un fait réglementaire.
- `[à confirmer]` : 1 (numéro WhatsApp / adresse physique par pays, déjà marqué dans la charte section
  6 et repris ici).
- `[à vérifier juridiquement]` : 2 (autorité compétente Côte d'Ivoire, autorité compétente Sénégal).

---

## Page produit

- Route FR / EN : `/pays/{countryCode}/produits/{productKey}` /
  `/en/countries/{countryCode}/products/{productKey}`
- Objectif prioritaire (une phrase) : expliquer précisément ce que couvre le produit dans ce pays, ce
  qu'il faut préparer, comment le score est calculé, puis orienter vers la comparaison ou la demande de
  devis.
- Appel à l'action principal / secondaire : principal = « Comparer les offres » ; secondaire =
  « Demander un devis ».
- Namespace i18n existant : `Product.*`, `OfferCards.criterionLabels.*`, `Journey.*`, `VisitorAi.*`
  (contenu éditorial `apps/public/app/content/products.ts`).
- Statut : réécriture

Note (spec 051) : seule la Côte d'Ivoire est ouverte ; le Sénégal, le Mali et la Guinée sont annoncés
avec une liste d'attente et n'ont pas de page produit publique. Les variantes « Sénégal » ci-dessous
restent des exemples de règle de genre, dormants tant que le Sénégal n'est pas ouvert.

### Structure (dans l'ordre)

1. Fil d'Ariane — composant : `Breadcrumb`
   - Corps : Accueil > Pays > {Pays} > {Produit}

2. Hero produit — composant : `Hero`
   - Kicker : « Fiche produit »
   - Titre (variante auto, Côte d'Ivoire) : « Assurance auto en Côte d'Ivoire »
   - Titre (variante auto, Sénégal) : « Assurance auto au Sénégal »
   - Titre (variante voyage, Côte d'Ivoire) : « Assurance voyage en Côte d'Ivoire »
   - Titre (variante voyage, Sénégal) : « Assurance voyage au Sénégal »
   - Titre (gabarit générique, autres produits — moto, santé, habitation) : « {Produit} en {Pays} »
     (ex. « Assurance moto en Côte d'Ivoire », « Assurance santé au Sénégal »), en reprenant la règle
     de genre du pays (« en » Côte d'Ivoire, « au » Sénégal)
   - Sous-titre : « Comparez des offres indicatives puis faites reprendre votre demande par un courtier
     partenaire autorisé. »
   - Corps / microcopie : bandeau combiné (`JourneyHeroNotice`) : « AssurMatch est une plateforme
     technique de comparaison indicative et de mise en relation avec des courtiers partenaires
     autorisés. » suivi de « Offre indicative, prix indicatif, à confirmer par le courtier partenaire. »
   - Aside : icône produit, nom du produit, pays, pastille « {n} offres indicatives publiées »
   - Boutons : « Comparer les offres » (principal) et « Demander un devis » (secondaire)
   - Données affichées (source) : `GET /countries/:code/products/:key`, `GET /countries/:code/offers`
     pour le compteur d'offres
   - États : bandeau d'indisponibilité si la fiche produit détaillée échoue mais que le produit existe
     au catalogue : « Fiche produit indisponible » / « Le détail de ce produit est temporairement
     indisponible. Les offres indicatives restent consultables. »

3. Ce que couvre ce produit — composant : `Section`
   - Titre : « Ce que couvre ce produit »
   - Corps / microcopie : résumé du produit (texte API), liste des garanties principales (nom +
     détail optionnel), liste des exclusions principales
   - Données affichées (source) : `product.summary`, `product.guarantees`, `product.exclusions`
   - États : bloc entièrement absent si aucune des trois données n'existe

4. Documents à préparer — composant : `Section` (tone muted)
   - Titre : « Documents à préparer »
   - Sous-titre (documents issus des offres) : « Ces documents sont ceux demandés par les offres
     publiées pour ce produit. »
   - Sous-titre (repli éditorial) : « Liste indicative des pièces généralement demandées pour ce
     produit. »
   - Corps / microcopie — variante auto (Côte d'Ivoire et Sénégal, mêmes pièces, mêmes usages
     régionaux) :
     - Une pièce d'identité en cours de validité (CNI ou passeport)
     - Le permis de conduire du conducteur principal
     - La carte grise ou le certificat d'immatriculation du véhicule
     - Un justificatif de domicile de moins de trois mois
     - Le relevé d'information ou l'attestation d'assurance précédente, si le véhicule était déjà
       assuré
     - La carte brune CEDEAO en cours de validité, si le véhicule doit circuler dans un autre pays de
       la sous-région `[à vérifier juridiquement]` (pièce régionale, condition d'usage à confirmer)
   - Corps / microcopie — variante voyage (Côte d'Ivoire et Sénégal) :
     - Une pièce d'identité ou un passeport en cours de validité
     - Le billet ou l'itinéraire de voyage
     - Le justificatif de réservation (hébergement, séjour), lorsqu'il existe
     - La liste des personnes à couvrir
     - Les dates précises du séjour
     - Le visa de destination (par exemple un visa Schengen), lorsque le pays de destination l'exige
       `[à vérifier juridiquement]`
   - Données affichées (source) : documents effectivement demandés par un échantillon d'offres publiées
     (`getPublicOffer(...).requiredDocuments`), sinon repli sur le contenu éditorial de
     `apps/public/app/content/products.ts`
   - États :
     - vide (aucune donnée, même éditoriale) : « Le courtier partenaire responsable de votre demande
       vous précisera les documents à fournir. »

5. Score indicatif expliqué — composant : `Section` compact (panneau `am-j-panel`)
   - Titre : « Comment le score indicatif est calculé »
   - Sous-titre : « Le score compare uniquement les offres affichées entre elles, sur des critères
     objectifs et selon la priorité que vous choisissez. »
   - Corps / microcopie : les **sept** critères du score (charte section 6), dans cet ordre :
     1. Niveau de garantie
     2. Prix
     3. Franchise
     4. Rapidité de traitement
     5. Flexibilité de paiement
     6. Qualité des informations
     7. Vos préférences
   - Corps / microcopie (bas de bloc) : « Le score reste indicatif : il n'est ni un conseil personnalisé
     ni un classement officiel, et la sponsorisation n'a aucun effet sur son calcul. »
   - Données affichées (source) : liste fixe des critères (contrat de score,
     `packages/shared/contracts/quote.contracts.ts`), libellés depuis `OfferCards.criterionLabels.*`
   - États : néant, bloc toujours affiché

6. FAQ contextuelle — composant : `Section` (tone muted) + accordéons `<details>`
   - Titre : « Questions fréquentes »
   - Corps / microcopie — variante auto (6 questions, valables Côte d'Ivoire et Sénégal, précisions
     locales marquées) :
     1. « Quelle est la différence entre une formule au tiers et une formule tous risques ? » : Une
        formule au tiers couvre les dommages que vous causez à autrui. Une formule tous risques y
        ajoute les dommages subis par votre propre véhicule. Le détail exact des garanties figure sur
        chaque offre indicative et reste à confirmer par le courtier partenaire.
     2. « À quoi sert la franchise ? » : La franchise est la part du sinistre qui reste à votre charge.
        Une franchise élevée fait généralement baisser la cotisation, et inversement. Le montant
        affiché sur une offre est indicatif.
     3. « Le prix affiché est-il celui que je paierai ? » : Non. Le prix affiché est un prix indicatif,
        à confirmer par le courtier partenaire après examen de votre situation, de votre véhicule et de
        votre historique.
     4. « La responsabilité civile est-elle obligatoire ? » : Oui, la couverture des dommages causés à
        autrui est une obligation légale pour circuler `[à vérifier juridiquement]` ; le détail exact de
        l'obligation dépend de la réglementation de chaque pays.
     5. « Que se passe-t-il si je change de véhicule en cours de contrat ? » : Le courtier partenaire
        met à jour le contrat en fonction du nouveau véhicule déclaré ; le prix et les garanties peuvent
        changer en conséquence.
     6. « Puis-je comparer une offre au tiers et une offre tous risques dans le même tableau ? » : Oui,
        le comparateur affiche les deux types de formules côte à côte ; le niveau de garantie fait
        partie des critères du score.
   - Corps / microcopie — variante voyage (6 questions, valables Côte d'Ivoire et Sénégal) :
     1. « L'assistance médicale à l'étranger est-elle toujours incluse ? » : Non. Elle figure dans les
        garanties de l'offre lorsqu'elle est incluse. Vérifiez la ligne correspondante sur chaque offre
        indicative.
     2. « Puis-je souscrire une fois parti ? » : La plupart des offres demandent une prise d'effet avant
        le départ. Le courtier partenaire confirme les conditions applicables à votre situation.
     3. « Le visa de destination est-il vérifié par AssurMatch ? » : Non. AssurMatch ne vérifie aucun
        document de voyage ; c'est le courtier partenaire qui vous précise les pièces nécessaires à la
        souscription.
     4. « Un séjour prolongé au-delà de la date prévue reste-t-il couvert ? » : Cela dépend des
        conditions de l'offre choisie ; le courtier partenaire confirme si une prolongation est possible
        et à quelles conditions.
     5. « Les sports à risque (plongée, ski) sont-ils couverts ? » : Certaines offres excluent ou
        limitent ces activités ; la liste des exclusions de chaque offre indicative le précise.
     6. « Que couvre l'assistance rapatriement ? » : Lorsqu'elle est incluse, elle couvre en général le
        retour organisé en cas d'accident ou de maladie grave pendant le séjour ; le détail exact reste
        à confirmer par le courtier partenaire.
   - Données affichées (source) : contenu éditorial `productContent(locale, productKey)`
     (`apps/public/app/content/products.ts`), FAQ balisée en JSON-LD (`faqJsonLd`)
   - États : bloc absent si aucune question éditoriale n'existe pour ce produit

7. Chemin de la prochaine étape — composant : `PublicJourneyActions`
   - Titre : « Poursuivre votre parcours »
   - Corps / microcopie : trois actions : « Comparer les offres », « Demander un devis », « Être
     rappelé par un courtier agréé » (libellé normalisé charte section 5 ; voir note ci-dessous sur
     l'écart avec le libellé actuel du code)
   - Corps / microcopie (bas de bloc) : « Votre demande n'est transmise qu'après votre consentement
     explicite, à un courtier partenaire autorisé pour ce pays et ce produit. »
   - Données affichées (source) : liens fixes vers `/offers`, `/quote` du même pays/produit

8. Bandeau d'information (D-Cookies) — composant : `Notice` (tone info, non fermable, ce n'est pas
   une bannière cookies)
   - Corps / microcopie : « Rien n'est transmis tant que vous n'avez pas donné votre accord. »
   - Emplacement : juste au-dessus du bloc « Chemin de la prochaine étape », avant tout lien vers le
     formulaire de devis, pour que le visiteur le lise avant de cliquer sur « Demander un devis »
   - Données affichées (source) : aucune
   - États : toujours visible, ne se ferme jamais (ce n'est pas un consentement à accepter, seulement
     une information)

9. Assistant de lecture facultatif (D-IA) — composant : `VisitorAiAssistant` (mode `product` puis mode
   `faq`)
   - Titre de section : « Assistance facultative »
   - Sous-titre : « Une aide à la compréhension, sans conseil personnalisé. Elle ne conditionne jamais
     la suite de votre parcours. »
   - Corps / microcopie par bloc :
     - Titre du bloc « quel type d'assurance » : « Assistant de lecture : quel type d'assurance ? »
       (renommé depuis « Assistant IA d'aide à la compréhension... », le mot IA reste sur l'étiquette de
       transparence, pas dans le titre courant, conformément à D-IA)
     - Champ « Votre question » avec indice de confidentialité implicite (« ne saisissez pas de données
       personnelles »)
     - Bouton : « Demander une orientation indicative » (bloc produit) / « Poser ma question » (bloc
       FAQ)
     - Étiquette de transparence obligatoire, affichée en permanence sur le bloc : « Réponse générée
       automatiquement par un outil d'IA. Aide à la lecture, pas un conseil. » (texte D-IA, à aligner
       avec le libellé actuel, voir notes)
     - Sous le bouton : « Facultatif : cette assistance ne conditionne jamais l'envoi de votre demande. »
   - Boutons : voir ci-dessus
   - Données affichées (source) : `GET` de disponibilité par pays/produit/type d'assistance ; réponse
     via file d'attente + sondage (`requestVisitorAi`, `readVisitorAi`)
   - États :
     - non disponible pour ce pays/produit : bloc entièrement absent (pas de message d'indisponibilité
       visible)
     - en cours : bouton en chargement, libellé « Assistance en cours... », squelette de trois lignes
       en attente de réponse
     - réponse reçue : texte de réponse affiché, avec mention de secours si la réponse vient du mode
       dégradé : « Réponse générée par l'assistant de secours (mode simplifié). »
     - refusée (garde-fou déclenché) : « L'assistant IA n'a pas pu produire de réponse conforme pour
       cette demande. Un courtier partenaire pourra vous répondre après votre demande de devis. »
     - échec technique : « Assistant indisponible pour le moment. »
     - délai dépassé : « L'assistant de lecture met trop de temps à répondre. Réessayez plus tard. »

10. Notice finale — composant : `Notice` (tone indicative)
    - Corps / microcopie : « Les offres expirées ou non validées ne sont pas affichées comme
      disponibles. Le prix indicatif reste à confirmer par le courtier partenaire. »

### Notes d'implémentation

- `apps/public/app/[locale]/countries/[countryCode]/products/[productKey]/page.tsx:44-51` : le tableau
  `SCORE_CRITERIA` ne liste que six critères (`price`, `guaranteeLevel`, `deductible`,
  `processingSpeed`, `paymentFlexibility`, `informationQuality`) et omet le septième critère du contrat
  de score, la préférence du visiteur. La clé de traduction existe déjà —
  `OfferCards.criterionLabels.userPreferences = "Vos préférences"` (`messages/fr.json`) — mais n'est
  jamais utilisée sur cette page. À ajouter `{ key: "userPreferences", icon: "sliders" }` (ou icône
  équivalente disponible) à la fin du tableau, lignes 44-51, et la ligne correspondante s'affichera
  automatiquement dans la boucle des lignes 286-293 sans autre changement.
- `apps/public/app/[locale]/countries/[countryCode]/products/[productKey]/page.tsx:279-296` (bloc
  score) : la boucle déjà générique s'applique telle quelle une fois le septième critère ajouté au
  tableau ci-dessus.
- Libellé « Être rappelé par un courtier agréé » : la charte section 5 fixe ce libellé exact, mais le
  code actuel affiche « Être rappelé par un courtier partenaire »
  (`apps/public/app/components/public-journey.tsx:70`, clé `Journey.callback`). Les deux formulations
  ne sont pas équivalentes (« agréé » implique un agrément vérifié, « partenaire » décrit seulement la
  relation commerciale) : à trancher avant de changer la clé, car cela touche un vocabulaire déjà
  utilisé ailleurs dans le parcours de devis.
- D-IA, étiquette de transparence : la décision fixe le texte « Réponse générée automatiquement par un
  outil d'IA. Aide à la lecture, pas un conseil. » Le code actuel affiche deux textes différents —
  `Common.aiGenerated = "généré par IA"` (étiquette courte sur `AiBox`) et
  `Common.aiDisclaimer = "Assistance indicative d'aide à la compréhension, sans conseil personnalisé. Un
  courtier partenaire autorisé reste seul responsable du devis et des conditions."` — plus un troisième
  texte dans `VisitorAi.note`. Aucun des trois ne reprend le texte D-IA mot pour mot aujourd'hui : une
  décision d'implémentation est nécessaire pour savoir lequel de ces emplacements porte la nouvelle
  phrase fixe (probablement `Common.aiDisclaimer`, affiché en permanence dans `AiBox`).
- `VisitorAi.modes.product.title` (`messages/fr.json`) affiche aujourd'hui « Assistant IA d'aide à la
  compréhension : quel type d'assurance ? », ce qui emploie « IA » dans un titre courant plutôt que
  seulement sur l'étiquette de transparence. La décision D-IA demande de parler de « l'assistant de
  lecture » dans le texte courant ; ce titre est donc à revoir en même temps que l'étiquette
  ci-dessus.
- `apps/public/app/content/products.ts:41-152` : les FAQ existantes comptent 3 questions pour `auto` et
  2 pour `voyage`, contre 6 proposées ici pour chacun ; à compléter dans ce fichier de contenu (FR et
  EN, lignes 41-66 pour `auto`, 133-152 pour `voyage`, plus le bloc `en` correspondant) sans changer la
  forme `ProductFaqEntry`.
- Pas de bandeau D-Cookies existant dans le code (aucun composant `Cookies*` côté produit trouvé, la
  seule page `cookies` existante est institutionnelle) : le bloc 8 ci-dessus est une **nouvelle**
  section à créer, distincte du `JourneyHeroNotice` déjà présent dans le hero.
- Chaînes protégées mot pour mot, présentes dans ce périmètre : « Comparer les offres » et « Demander
  un devis » (`backend/tests/guardrails/content/public-localized-wording.spec.ts:13-14`, vérifié sur
  `apps/public/app/components/public-journey.tsx`, `apps/public/app/components/quote-form.tsx` et la
  page de suivi de demande) — ne pas modifier ces deux libellés.
- `[à confirmer]` : aucun nouveau sur cette page (les documents et la FAQ restent génériques, sans
  chiffre ni délai inventé).
- `[à vérifier juridiquement]` : 3 (carte brune CEDEAO pour l'auto, visa de destination pour le voyage,
  obligation légale de responsabilité civile dans la FAQ auto).

---

## Récapitulatif des marqueurs de ce livrable

- `[à confirmer]` : 1 (contact local par pays, page pays ouverte).
- `[à vérifier juridiquement]` : 5 (autorité compétente Côte d'Ivoire, autorité compétente Sénégal sur
  la page pays ; carte brune CEDEAO, visa de destination, obligation légale RC sur la page produit).
- `[exemple]` : 1 (nom de produit dans `OfferPreview`, accueil).
- `[à valider par la marque]` : 1 (nouvelle signature « Comparer d'abord. Être accompagné ensuite. »,
  reprise de la décision D-Signature déjà actée dans le brief).
