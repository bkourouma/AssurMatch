# 04 : Confiance et légal

Périmètre de ce fichier : `how-it-works`, `regulatory-status`, la nouvelle page « Notre engagement »
(décision D-Engagement), les quatre pages légales (`privacy`, `cookies`, `terms`, `legal-notice`) et
`contact`. Une fiche par page, format charte §8. Sources lues : les fichiers cités dans chaque bloc
« Notes d'implémentation », `apps/public/tests/public-institutional.spec.ts`,
`.specify/memory/constitution.md` sections I, II et VIII, et le code backend cité pour vérifier ce qui
est réellement implémenté (consentement, limitation de débit, absence de donnée personnelle dans les
URL, retrait de consentement).

---

## Comment ça marche

- Route FR / EN : `/comment-ca-marche` / `/how-it-works`
- Objectif prioritaire (une phrase) : faire comprendre en une minute qui fait quoi entre le visiteur,
  AssurMatch, le courtier partenaire et l'assureur, avant que le visiteur ne compare des offres.
- Appel à l'action principal / secondaire : Comparer les offres (`/pays`) / Voir le statut
  réglementaire (`/statut-reglementaire`)
- Namespace i18n existant : `HowItWorks.*`
- Statut : restructuration

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Le parcours
   - Titre : Comment ça marche
   - Sous-titre : Trois étapes, sans aucun engagement avant la confirmation du courtier partenaire
     responsable.
   - Corps / microcopie : aucun
   - Boutons : Comparer les offres → `/pays`
   - Données affichées (source) : aucune
   - États : aucun

2. Les trois étapes — composant : `Reveal` + `Card` (liste ordonnée `am-timeline`)
   - Kicker : aucun
   - Titre de section : Les trois étapes
   - Sous-titre de section : De la comparaison indicative à la reprise de votre demande par un
     courtier partenaire autorisé.
   - Corps / microcopie (une carte par étape, ancre stable entre parenthèses) :
     1. **Comparez** (`#comparez`) : choisissez un pays et un produit d'assurance pour afficher les
        offres indicatives disponibles auprès des courtiers partenaires autorisés. Chaque offre
        indique son prix indicatif, ses garanties principales et, si elle est sponsorisée, un badge
        orange qui la signale sans lui donner la première position du seul fait d'être sponsorisée.
     2. **Demandez un devis** (`#demandez`) : sélectionnez une ou plusieurs offres qui vous
        intéressent et demandez un devis. Un court formulaire recueille vos coordonnées et les
        informations utiles au courtier, avec un consentement explicite avant tout envoi. La demande
        est transmise au courtier partenaire responsable de votre pays et de votre produit, jamais
        publiée ni revendue.
     3. **Finalisez avec le courtier** (`#souscrivez`) : le courtier partenaire vous recontacte pour
        confirmer les conditions exactes, ajuster le prix indicatif si nécessaire et finaliser la
        souscription en dehors d'AssurMatch. AssurMatch n'intervient à aucun moment dans la signature
        du contrat ni dans le paiement de la prime.
   - Boutons : aucun bouton par étape ; le CTA de la page reste unique (en-tête et pied de page).
   - Données affichées (source) : identifiants d'étape stables (`comparez`, `demandez`, `souscrivez`)
     utilisés comme ancres.
   - États : aucun

   Qui fait quoi, à chaque étape (tableau des responsabilités, ajout par rapport à l'existant) :

   | Étape | Visiteur | AssurMatch | Courtier partenaire | Assureur |
   | --- | --- | --- | --- | --- |
   | 1. Comparez | Choisit un pays et un produit, consulte les offres indicatives | Affiche les offres transmises par les courtiers, calcule le score indicatif, signale les offres sponsorisées par un badge | Fournit ses offres et leurs conditions au moment de la mise à jour | Fixe le produit et les garanties que le courtier propose |
   | 2. Demandez un devis | Sélectionne une ou plusieurs offres, remplit le formulaire, donne son consentement explicite | Transmet la demande au courtier partenaire responsable du pays et du produit, sans la publier ni la revendre | Reçoit la demande qualifiée | N'intervient pas à cette étape |
   | 3. Finalisez avec le courtier | Échange avec le courtier, fournit les documents demandés, décide de souscrire ou non | N'intervient plus : ne reçoit ni ne transmet de document de souscription | Confirme le prix, les garanties exactes et les conditions ; recueille la signature | Valide le contrat et émet l'attestation, via le courtier |

3. Ce qu'AssurMatch ne fait pas — composant : `Card` (section `tone="muted"`,
   `id="ce-que-nous-ne-faisons-pas"`)
   - Kicker : Périmètre
   - Titre : Ce qu'AssurMatch ne fait pas
   - Sous-titre : aucun
   - Corps / microcopie : Pour que le rôle de chacun reste clair, AssurMatch :
     - ne vend pas d'assurance ;
     - n'émet aucun contrat ni attestation ;
     - ne collecte aucune prime ;
     - ne donne aucun conseil personnalisé engageant ;
     - ne décide jamais à la place du visiteur.
   - Boutons : aucun
   - Données affichées (source) : aucune
   - États : aucun

4. Aller plus loin — composant : `Card` (liste `am-linkcards`)
   - Kicker : Aller plus loin
   - Titre : Pour aller plus loin
   - Sous-titre : Le cadre réglementaire d'AssurMatch et les pays déjà ouverts.
   - Corps / microcopie :
     - Carte 1 : Voir le statut réglementaire → Rémunération, classement des offres, offres
       sponsorisées et prix indicatif.
     - Carte 2 : Voir les pays disponibles → Les pays ouverts et les produits proposés par les
       courtiers partenaires autorisés.
   - Boutons : Consulter (un par carte)
   - Données affichées (source) : aucune
   - États : aucun

### Notes d'implémentation

- Contenu source : `apps/public/app/content/institutional.ts:20-100` (`howItWorksFr` / `howItWorksEn`),
  rendu par `apps/public/app/[locale]/how-it-works/page.tsx:33-136`.
- Le tableau des responsabilités (fin du bloc 2) est un ajout : il n'existe pas dans le composant
  actuel. Purement éditorial, il peut se rendre en HTML natif sous la liste `am-timeline`, sans
  dépendance à une donnée API.
- Sur la 3e étape : je ne renomme aucun fichier hors de ce livrable. Le code garde aujourd'hui
  l'ancre `id="souscrivez"` et le titre « Souscrivez auprès du courtier »
  (`apps/public/app/content/institutional.ts:39-45`). « Finalisez avec le courtier » est la
  reformulation proposée pour l'implémentation ; même sens exact : la souscription se fait
  uniquement avec le courtier, jamais sur AssurMatch, et l'ancre `#souscrivez` est conservée.
- Chaînes protégées par `apps/public/tests/public-institutional.spec.ts:4-18` (à garder mot pour mot,
  telles qu'elles apparaissent dans le test, sans accent ajouté ni retiré) : « Ce qu'AssurMatch ne
  fait pas », « ne vend pas d'assurance », « n'émet aucun contrat ni attestation », « ne collecte
  aucune prime », « ne donne aucun conseil personnalisé engageant » ; la page doit continuer à
  contenir les identifiants `content.notDone` et `getHowItWorksContent`.
- `[à confirmer]` sur cette fiche : aucun.

---

## Statut réglementaire

- Route FR / EN : `/statut-reglementaire` / `/regulatory-status`
- Objectif prioritaire (une phrase) : donner, en langage clair, les quatre réponses réglementaires
  cherchées par un visiteur ou un régulateur : qui paie AssurMatch, comment les offres sont classées,
  comment repérer une offre sponsorisée, ce que veut dire « prix indicatif ».
- Appel à l'action principal / secondaire : Comparer les offres (`/pays`) / Nous écrire (`/contact`)
- Namespace i18n existant : `RegulatoryStatus.*`
- Statut : réécriture

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Transparence
   - Titre : Statut réglementaire
   - Sous-titre : Comment AssurMatch est rémunéré, comment les offres sont classées, et ce que
     signifie un prix indicatif.
   - Boutons : aucun
   - États : aucun

2. Navigation dans la page — composant : `nav` (`am-inpagenav`)
   - Quatre liens d'ancrage, dans cet ordre fixe : Comment AssurMatch est rémunéré (`#remuneration`),
     Comment les offres sont classées (`#classement`), Comment les offres sponsorisées sont
     signalées (`#offres-sponsorisees`), Ce que signifie « prix indicatif » (`#prix-indicatif`).

3. Rémunération — composant : `Section` + `Card` (`id="remuneration"`)
   - Titre : Comment AssurMatch est rémunéré
   - Résumé en une phrase : vous ne payez rien à AssurMatch ; ce sont les courtiers partenaires qui
     paient.
   - Corps / microcopie :
     - AssurMatch est rémunéré par les courtiers partenaires, jamais par le visiteur : le visiteur ne
       paie rien pour comparer des offres ou demander un devis.
     - Le modèle économique combine des frais de mise en service, un abonnement mensuel selon le plan
       du courtier partenaire (Starter, Pro ou Enterprise) et des frais par demande qualifiée
       transmise (lead qualifié).
     - AssurMatch ne perçoit aucune commission sur la prime d'assurance et ne collecte jamais la prime
       elle-même.
   - Comment vérifier : les formules et leurs tarifs par pays sont publics, sur la page Tarifs
     courtiers.
   - Données affichées (source) : formules Starter / Pro / Enterprise, tarification courtiers par
     pays.

4. Classement — composant : `Section` + `Card` (`id="classement"`, tone muted)
   - Titre : Comment les offres sont classées
   - Résumé en une phrase : le tri par défaut suit un score, jamais le fait d'être sponsorisée.
   - Corps / microcopie :
     - Le tri par défaut d'une liste d'offres repose sur un score indicatif tenant compte du prix, du
       niveau de garantie, de la franchise et du délai de traitement annoncé.
     - Une offre sponsorisée ne peut jamais occuper la première position du classement du seul fait
       d'être sponsorisée : elle reste soumise aux mêmes critères de tri que les autres offres et n'est distinguée que par son badge.
     - Le visiteur peut aussi trier par prix croissant, garanties (niveau décroissant), rapidité,
       popularité ou mise à jour récente.
   - Comment vérifier : sur une liste d'offres, changez de tri (prix, garanties, rapidité) ; l'ordre
     suit le critère choisi, et une offre sponsorisée monte ou descend exactement comme une offre non
     sponsorisée.
   - Données affichées (source) : score sur 100 et détail par critère (contrat
     `packages/shared/contracts/quote.contracts.ts`).

5. Offres sponsorisées — composant : `Section` + `Card` (`id="offres-sponsorisees"`)
   - Titre : Comment les offres sponsorisées sont signalées
   - Résumé en une phrase : un badge orange, jamais un avantage de classement ni de prix.
   - Corps / microcopie :
     - Une offre sponsorisée porte toujours un badge orange visible, distinct du badge vert utilisé
       pour d'autres informations. Ce badge n'est jamais utilisé pour un fond de page ni pour un
       bouton principal.
     - Être sponsorisée ne change ni le prix indicatif affiché, ni les garanties de l'offre : cela
       signale uniquement un partenariat commercial avec AssurMatch.
   - Comment vérifier : le badge orange est visible sur la carte de l'offre et sur sa fiche détaillée ;
     une offre sponsorisée n'est jamais placée en première position du seul fait d'être sponsorisée
     (voir `#classement`).
   - Données affichées (source) : indicateur de sponsorisation de l'offre.

6. Prix indicatif — composant : `Section` + `Card` (`id="prix-indicatif"`, tone muted)
   - Titre : Ce que signifie « prix indicatif »
   - Résumé en une phrase : une estimation, jamais un prix contractuel.
   - Corps / microcopie :
     - Le prix affiché à côté de chaque offre est une estimation calculée à partir des informations
       disponibles au moment de la comparaison. Il n'a pas de valeur contractuelle.
     - Le prix définitif, les garanties exactes et les conditions de souscription sont confirmés par
       le courtier partenaire responsable, après examen de la demande.
     - C'est pourquoi chaque prix affiché est systématiquement accompagné de la mention « prix
       indicatif, à confirmer par le courtier partenaire ».
   - Comment vérifier : comparez le prix indicatif affiché avec celui confirmé par le courtier sur
     votre page de suivi de demande ; un écart est normal, l'un est une estimation et l'autre une
     confirmation.
   - Données affichées (source) : prix indicatif, date de mise à jour (contrat
     `packages/shared/contracts/quote.contracts.ts`).

7. Cadre régional — composant : `Notice` (`tone="info"`, ajout)
   - Titre : Cadre régional
   - Corps / microcopie : en Côte d'Ivoire, l'activité d'intermédiation en assurance est
     encadrée par la réglementation de la Conférence interafricaine des marchés d'assurances (CIMA) et
     par les autorités nationales de contrôle `[à vérifier juridiquement]`. AssurMatch n'est pas
     elle-même un intermédiaire d'assurance réglementé : ce sont les courtiers partenaires référencés
     qui détiennent l'agrément requis pour exercer `[à vérifier juridiquement]`. Le numéro d'agrément
     et l'autorité de tutelle de chaque courtier partenaire sont `[à confirmer]`, pays par pays.

8. Pied de page — composant : `Section`
   - Corps / microcopie : vous avez une question que cette page ne couvre pas ?
   - Boutons : Comparer les offres (principal) / Nous écrire (secondaire, → `/contact`)

### Notes d'implémentation

- Contenu source : `apps/public/app/content/institutional.ts:102-174` (`regulatoryStatusFr` /
  `regulatoryStatusEn`), rendu par `apps/public/app/[locale]/regulatory-status/page.tsx:57-113`.
- Ancres stables à garder telles quelles : `id: "remuneration"`, `id: "classement"`,
  `id: "offres-sponsorisees"`, `id: "prix-indicatif"`
  (`apps/public/app/content/institutional.ts:104,113,121,129`) ; ces identifiants restent sans accent
  dans le code, ce sont des ancres d'URL, pas de la prose.
- Ajouts par rapport à l'existant : résumé « en une phrase » et ligne « comment vérifier » par
  section, bloc « Cadre régional » (CIMA), CTA de pied de page. Le bloc de navigation d'ancrage
  existant (`apps/public/app/[locale]/regulatory-status/page.tsx:88-101`) garde sa structure.
- Chaînes protégées par `apps/public/tests/public-institutional.spec.ts:20-41` (à garder mot pour
  mot, avec les accents tels qu'ils figurent dans le test) : « AssurMatch est rémunéré par les
  courtiers partenaires, jamais par le visiteur », « Une offre sponsorisée ne peut jamais occuper la
  première position du classement », « Une offre sponsorisée porte toujours un badge orange visible » ;
  la page doit continuer à contenir `content.remuneration`, `content.ranking`,
  `content.sponsoredOffers`, `content.indicativePrice`, `getRegulatoryStatusContent` et les quatre
  `id` cités ci-dessus.
- `[à confirmer]` : 1 (numéro d'agrément et autorité de tutelle par courtier et par pays).
- `[à vérifier juridiquement]` : 2 (cadre CIMA applicable, statut d'AssurMatch comme
  non-intermédiaire réglementé).

---

## Notre engagement

- Route FR / EN : `/notre-engagement` / `/our-commitment` (nouvelle route, décision D-Engagement)
- Objectif prioritaire (une phrase) : donner au visiteur cinq engagements vérifiables, avec pour
  chacun un moyen concret de les vérifier lui-même, plutôt qu'une promesse de confiance abstraite.
- Appel à l'action principal / secondaire : Comparer les offres (`/pays`) / Nous écrire (`/contact`)
- Namespace i18n existant : nouveau, proposition `Commitment.*`
- Statut : nouvelle page

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Notre engagement
   - Titre : Notre engagement
   - Sous-titre : Cinq engagements, ce qu'ils veulent dire concrètement, et comment les vérifier
     vous-même.
   - Corps / microcopie : AssurMatch compare des offres indicatives et vous met en relation avec un
     courtier autorisé. Nous ne vendons pas d'assurance, nous ne signons pas de contrat et nous ne
     recevons pas votre prime.
   - Boutons : Comparer les offres → `/pays`

2. Engagement 1 : Transparence — composant : `Card`
   - Engagement : nous disons ce que nous savons, ce que nous ne savons pas et ce qui reste à
     confirmer.
   - Ce que ça veut dire concrètement : chaque offre affiche un prix indicatif marqué comme tel.
     Chaque contenu généré par l'assistant de lecture porte la mention « Réponse générée
     automatiquement par un outil d'IA. Aide à la lecture, pas un conseil. ». Une information que
     nous n'avons pas encore (délai de réponse moyen, nombre de demandes traitées) n'est pas
     remplacée par un chiffre inventé : elle est absente de la page, ou marquée à confirmer.
   - Comment vérifier : cherchez la mention « prix indicatif, à confirmer par le courtier partenaire »
     sous chaque prix, et l'étiquette de l'assistant de lecture sous chaque réponse générée par IA.
   - Limite : le contenu descriptif d'une offre (garanties, exclusions) provient du courtier
     partenaire ou de l'assureur ; AssurMatch l'affiche tel que transmis et ne le vérifie pas ligne à
     ligne `[à confirmer]`.

3. Engagement 2 : Indépendance du score — composant : `Card`
   - Engagement : payer pour être visible ne change jamais le score d'une offre.
   - Ce que ça veut dire concrètement : le tri par défaut d'une liste d'offres repose sur un score qui
     tient compte du prix, du niveau de garantie, de la franchise et du délai de traitement annoncé.
     Une offre sponsorisée suit exactement le même calcul que les autres ; elle ne peut jamais occuper
     la première position du classement du seul fait d'être sponsorisée, et elle est toujours signalée
     par un badge orange visible.
   - Comment vérifier : sur une liste d'offres, changez le tri (prix, garanties, rapidité) et observez
     qu'une offre sponsorisée peut monter ou descendre exactement comme une offre non sponsorisée.
   - Limite : le classement reste indicatif ; il ne remplace pas l'examen du courtier partenaire, qui
     peut ajuster le prix ou les conditions après étude de la demande.

4. Engagement 3 : Sécurité des données — composant : `Card`
   - Engagement : vos données ne circulent que là où c'est nécessaire, et vous pouvez reprendre la
     main.
   - Ce que ça veut dire concrètement (uniquement ce qui est réellement en place aujourd'hui) :
     - votre consentement est enregistré avec sa date et la version du texte de consentement que vous
       avez accepté `[à confirmer : affichage public de cette version, le champ existe côté
       technique]` ;
     - un nombre trop élevé de demandes envoyées en peu de temps depuis la même origine est
       automatiquement limité, pour réduire les abus et les demandes frauduleuses ;
     - aucune information personnelle (nom, e-mail, téléphone) n'apparaît dans l'adresse de la page de
       suivi d'une demande : cette page utilise une référence, pas vos coordonnées ;
     - une demande de devis n'est transmise qu'au courtier partenaire (ou, si vous cochez
       explicitement l'option multi-courtiers, jusqu'à trois courtiers partenaires) responsable de
       votre pays et de votre produit ; elle n'est ni publiée ni revendue ;
     - vous pouvez retirer votre consentement à tout moment depuis la page de suivi de votre demande.
   - Comment vérifier : depuis la page de suivi d'une demande, vérifiez que son adresse ne contient ni
     votre nom ni votre e-mail, et repérez l'option de retrait du consentement.
   - Limite : le chiffrement des données au repos, les certifications de sécurité et la procédure de
     notification en cas d'incident ne sont pas décrits ici `[à confirmer]` : cette page ne présente
     que ce qui est vérifiable par le visiteur lui-même.

5. Engagement 4 : Rémunération par les courtiers — composant : `Card`
   - Engagement : nous sommes payés par les courtiers partenaires, jamais par vous.
   - Ce que ça veut dire concrètement : le modèle économique combine des frais de mise en service, un
     abonnement mensuel selon le plan du courtier partenaire (Starter, Pro ou Enterprise) et des frais
     par demande qualifiée transmise. AssurMatch ne perçoit aucune commission sur la prime d'assurance
     et ne la collecte jamais.
   - Comment vérifier : les formules et leurs tarifs par pays sont publiés sur la page Tarifs
     courtiers.
   - Limite : un courtier qui paie un abonnement plus élevé peut sponsoriser davantage d'offres ; cela
     ne change ni leur score ni leur position par défaut (voir Engagement 2).

6. Engagement 5 : Rien à payer pour le visiteur — composant : `Card`
   - Engagement : comparer des offres et demander un devis ne vous coûte rien.
   - Ce que ça veut dire concrètement : vous ne payez rien à AssurMatch. Le prix de l'assurance est
     fixé par l'assureur et confirmé par le courtier. AssurMatch ne demande jamais de coordonnées
     bancaires et ne propose aucun paiement en ligne.
   - Comment vérifier : aucune étape du parcours de comparaison ou de demande de devis ne demande un
     numéro de carte ou un identifiant Mobile Money.
   - Limite : le prix de l'assurance que vous payez à l'assureur, lui, n'est pas gratuit ; seule la
     mise en relation via AssurMatch l'est.

7. Ce que nous ne ferons pas — composant : `Card` (tone muted)
   - Corps / microcopie : pour que ces engagements restent vérifiables, AssurMatch :
     - ne vendra jamais vos données à un tiers à des fins commerciales ;
     - ne changera jamais le score d'une offre parce qu'elle est sponsorisée ;
     - ne vous demandera jamais de payer pour comparer ou demander un devis ;
     - n'affichera aucun témoignage tant qu'il n'aura pas été vérifié ;
     - ne promettra jamais un délai de réponse qui n'a pas été mesuré.

8. Si quelque chose ne va pas — composant : `Card`
   - Corps / microcopie : si l'un de ces engagements ne vous semble pas respecté, écrivez-nous depuis
     la page Contact en choisissant « Visiteur » : décrivez l'offre ou la demande concernée, nous vous
     répondons par e-mail `[à confirmer : délai de traitement d'une réclamation]`. Pour une question
     relative à vos données personnelles, la page Confidentialité détaille vos droits et l'autorité de
     contrôle compétente.
   - Boutons : Nous écrire → `/contact`

9. Date de mise à jour — composant : `p` (même gabarit que les pages légales)
   - Corps / microcopie : Dernière mise à jour : `[à confirmer, date de publication réelle]`

### Notes d'implémentation

- Page entièrement nouvelle (décision D-Engagement du brief), à lier depuis le pied de page,
  l'accueil et la page de consentement du formulaire de devis.
- Faits « sécurité des données » vérifiés dans le code avant rédaction, pour ne rien inventer :
  version de consentement enregistrée (`backend/prisma/schema.prisma:1451,1481,1507`, champ
  `consentVersion` sur trois flux distincts) ; limitation de débit sur les demandes publiques
  (`backend/src/modules/quote-requests/public-quote-rate-limit.service.ts`,
  `backend/src/modules/common/guards/rate-limit.guard.ts`) ; garde-fou anti-abus
  (`backend/src/modules/common/abuse/public-abuse-guard.service.ts`) ; garde-fou dédié à l'absence de
  donnée personnelle dans les clés Redis (`backend/tests/guardrails/content/redis-pii-keys.spec.ts`) ;
  page de suivi adressée par référence publique, sans donnée personnelle dans l'URL
  (`apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx`, route
  `/demandes-de-devis/[publicReference]`) ; retrait de consentement couvert par
  `backend/tests/unit/quote-requests/consent-withdrawal.spec.ts`, déjà documenté en langage visiteur
  dans `apps/public/app/content/legal/privacy.ts:69-71` ; donnée transmise au seul courtier
  responsable, jamais revendue (`apps/public/app/content/legal/privacy.ts:52` et
  `apps/public/app/content/institutional.ts:35-36`).
- Le champ `consentVersion` existe en base pour trois flux (demande de devis, candidature courtier, et
  un troisième identifié dans le schéma) ; son affichage public (numéro de version visible par le
  visiteur) n'a pas été trouvé dans le rendu des pages publiques lues, d'où le `[à confirmer]` ciblé
  sur ce point précis plutôt que sur l'existence du champ.
- Aucun élément de chiffrement au repos, de certification de sécurité ou de procédure d'incident n'a
  été trouvé dans le périmètre lu : ces points restent `[à confirmer]` plutôt que déduits ou inventés.
- `[à confirmer]` sur cette fiche : 4 (affichage public de la version de consentement, délai de
  traitement d'une réclamation, chiffrement/certifications/procédure d'incident regroupés en un seul
  point, date de dernière mise à jour).
- `[à vérifier juridiquement]` : 0.
- Décision produit manquante : le namespace i18n `Commitment.*` et la route `/notre-engagement` /
  `/our-commitment` ne sont déclarés nulle part dans `apps/public/i18n/routing.ts` à ce jour ; les
  ajouter est une tâche d'implémentation technique, distincte de ce livrable éditorial.

---

## Confidentialité

- Route FR / EN : `/confidentialite` / `/privacy` (et par pays : `/pays/[code]/confidentialite` /
  `/countries/[code]/privacy`)
- Objectif prioritaire (une phrase) : dire en clair quelles données AssurMatch traite, pourquoi, et
  comment un visiteur reprend la main dessus.
- Appel à l'action principal / secondaire : aucun CTA de conversion sur une page légale ; lien
  contextuel vers Nous écrire (`/contact`) pour toute question hors parcours de devis.
- Namespace i18n existant : `Legal.*` (partagé par les quatre pages légales) + contenu propre dans
  `apps/public/app/content/legal/privacy.ts`
- Statut : restructuration (ajout d'un résumé, réécriture des intitulés en langage clair ; le fond
  légal des sections n'est pas inventé)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero` (`size="sm"`)
   - Kicker : Informations légales
   - Titre : Politique de confidentialité
   - Sous-titre : Les données personnelles traitées par AssurMatch, leurs finalités et vos droits.
   - Méta : Dernière mise à jour : 19 septembre 2026 (source : `page.updatedAt`)

2. L'essentiel en 5 lignes — composant : `Notice` (`tone="info"`, nouveau bloc, juste sous la méta et
   avant le sommaire)
   - Titre : L'essentiel en 5 lignes
   - Corps / microcopie :
     1. Nous collectons vos données seulement quand vous demandez un devis ou nous écrivez.
     2. Elles servent à vous mettre en relation avec le bon courtier partenaire, jamais à être
        revendues.
     3. Une demande de devis part vers le courtier responsable de votre pays et de votre produit,
        jamais publiée.
     4. Vous pouvez retirer votre consentement à tout moment depuis la page de suivi de votre demande.
     5. Pour toute autre question sur vos données, la page Contact permet d'écrire à l'équipe
        AssurMatch.

3. Sommaire — composant : `nav` (`am-legal-toc`), affiché dès que la page a plus d'une section
   (c'est le cas ici).

4. Sections (intitulé technique conservé pour l'`id`, intitulé affiché réécrit en clair) :
   - **Qui gère vos données** (`responsable-traitement`) : les données personnelles décrites ici sont
     traitées par la société éditrice d'AssurMatch. Son identité complète est listée dans la section
     « À compléter avant mise en ligne » en bas de cette page.
   - **Ce que nous collectons** (`donnees-collectees`) : selon les pages utilisées, AssurMatch peut
     collecter l'identité et les coordonnées communiquées dans une demande de devis ou un message de
     contact (nom, e-mail, téléphone) ; le pays et le produit d'assurance sélectionnés ; les réponses
     au formulaire de demande de devis propre à ce produit ; les documents facultatifs joints à une
     demande de devis (pièces justificatives demandées par le courtier partenaire) ; le consentement
     donné, ou retiré, et sa date.
   - **Pourquoi nous les utilisons** (`finalites`) : mettre en relation le visiteur avec le ou les
     courtiers partenaires autorisés pertinents pour son pays et son produit ; transmettre la demande
     de devis et permettre son suivi ; produire, lorsque le visiteur le demande, une assistance
     indicative générée par l'assistant de lecture (résumé de besoin, aide à la compréhension),
     toujours signalée comme telle et sans conseil personnalisé engageant ; prévenir les demandes en
     doublon ou frauduleuses ; établir la facturation entre AssurMatch et les courtiers partenaires
     (frais par lead qualifié), sans jamais transmettre de coordonnées bancaires du visiteur ni lui
     facturer quoi que ce soit.
   - **Pourquoi nous avons le droit de les utiliser** (`base-legale`) `[à vérifier juridiquement]` :
     la transmission d'une demande de devis repose sur le consentement explicite du visiteur, recueilli
     par une case à cocher non pré-cochée avant tout envoi. La prévention de la fraude et des doublons
     repose sur l'intérêt légitime d'AssurMatch et de ses courtiers partenaires à ne traiter que des
     demandes réelles.
   - **Qui reçoit vos données** (`destinataires`) : les données d'une demande de devis sont
     transmises au courtier partenaire (ou, si le visiteur l'accepte explicitement, aux courtiers
     partenaires) responsable du pays et du produit concernés. L'hébergeur technique du site, listé
     dans les mentions légales, héberge les données mais n'y accède pas pour ses propres finalités.
     Les données ne sont jamais vendues à des tiers à des fins commerciales.
   - **Combien de temps nous les gardons** (`duree-conservation`) : les données sont conservées pour
     la durée strictement nécessaire aux finalités décrites ci-dessus, puis supprimées ou anonymisées.
     Les durées précises par catégorie de donnée sont listées dans la section « À compléter avant mise
     en ligne ».
   - **Vos droits** (`droits`) : chaque visiteur dispose d'un droit d'accès, de rectification et
     d'effacement de ses données, ainsi que du droit de retirer son consentement à tout moment. Pour
     une demande de devis déjà transmise, le retrait de consentement s'effectue directement depuis la
     page de suivi de cette demande (lien reçu après l'envoi). Pour toute autre demande relative à ses
     données, ou en l'absence de lien de suivi, le visiteur peut écrire via la page Contact.
   - **Où porter réclamation** (`autorite-controle`) `[à vérifier juridiquement]` : le visiteur
     dispose du droit d'introduire une réclamation auprès de l'autorité de protection des données
     personnelles compétente. Le nom de cette autorité, qui dépend du pays du visiteur, est listé dans
     la section « À compléter avant mise en ligne ».

5. Variantes pays — composant : `Notice` (`tone="info"`, uniquement sur les pages
   `/pays/[code]/confidentialite`)
   - Côte d'Ivoire (CI) : une variante existe. Elle remplace la section `autorite-controle` par un
     texte spécifique nommant l'autorité ivoirienne compétente, dont le nom exact reste
     `[à confirmer]`. Le bandeau affiche : « Vous consultez la version de cette page applicable en
     Côte d'Ivoire. » avec un bouton « Voir la version générale ».
   - Sénégal (SN) : aucune variante n'existe aujourd'hui. Le bandeau affiche : « Aucune particularité
     locale n'est encore enregistrée pour Sénégal : le texte général ci-dessous s'applique. »
   - Tout autre pays ouvert sans variante reçoit le même bandeau que le Sénégal.

6. À compléter avant mise en ligne — composant : `Notice` (`tone="indicative"`)
   - Responsable du traitement (raison sociale, adresse) `[à confirmer]`
   - Délégué ou déléguée à la protection des données (contact) `[à confirmer]`
   - Autorité de contrôle compétente `[à confirmer]`
   - Durées de conservation précises par catégorie de donnée `[à confirmer]`

### Notes d'implémentation

- Contenu source : `apps/public/app/content/legal/privacy.ts:1-177`, rendu par
  `apps/public/app/content/legal-page-view.tsx:40-127` via
  `apps/public/app/[locale]/privacy/page.tsx` (page globale) et
  `apps/public/app/[locale]/countries/[countryCode]/privacy/page.tsx` (variante pays).
  `getLegalPage("privacy", locale, countryCode)` fusionne la variante section par section (`id`),
  voir `apps/public/app/content/legal/index.ts:47-61`.
  Variante Côte d'Ivoire : `apps/public/app/content/legal/countries/CI.ts:38-61`. Registre des pays
  avec variante : `apps/public/app/content/legal/countries/index.ts:5-7` (seul `CI` y figure
  aujourd'hui).
  Consentement et retrait déjà documentés dans le contenu source (`privacy.ts:44,69-71`) et vérifiés
  côté backend par `backend/tests/unit/quote-requests/consent-withdrawal.spec.ts`.
- Ajout par rapport à l'existant : le bloc « L'essentiel en 5 lignes », les intitulés affichés en
  langage clair (l'`id` de chaque section, utilisé pour les ancres et par `mergeSections`, ne change
  pas), le paragraphe « Variantes pays » qui explicite pour le visiteur ce que fait déjà le composant
  `countryNotice` de `LegalPageView`.
- Chaîne structurelle protégée par `apps/public/tests/public-institutional.spec.ts:43-65` (à garder,
  sans accent, tel qu'écrit dans le code source) : `const SLUG = "privacy" as const` dans la page
  globale, au moins un appel à `getLegalPage(` par page globale et par page pays, et
  `hasCountryLegalOverride` dans la page pays.
- `[à confirmer]` : 5 (les 4 placeholders existants + le nom de l'autorité ivoirienne dans la
  variante).
- `[à vérifier juridiquement]` : 2 (base légale, autorité de contrôle).

---

## Cookies

- Route FR / EN : `/cookies` / `/cookies` (et par pays : `/pays/[code]/cookies` /
  `/countries/[code]/cookies`)
- Objectif prioritaire (une phrase) : montrer qu'un seul cookie, strictement nécessaire, est utilisé,
  sans bandeau à accepter.
- Appel à l'action principal / secondaire : aucun ; lien contextuel vers Nous écrire si le visiteur a
  une question.
- Namespace i18n existant : `Legal.*` + `apps/public/app/content/legal/cookies.ts`
- Statut : restructuration (ajout d'un résumé, intitulés déjà en grande partie clairs, contenu
  factuel conservé)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero` (`size="sm"`)
   - Kicker : Informations légales
   - Titre : Cookies
   - Sous-titre : Le seul cookie utilisé par AssurMatch aujourd'hui, et pourquoi.
   - Méta : Dernière mise à jour : 19 septembre 2026

2. L'essentiel en 5 lignes — composant : `Notice` (`tone="info"`)
   1. AssurMatch utilise un seul cookie, appelé `am_pays`.
   2. Il retient uniquement le pays que vous avez choisi, pendant 180 jours.
   3. Il ne contient aucune donnée personnelle : juste un code pays à deux lettres.
   4. Le site ne dépose aujourd'hui aucun cookie de publicité ni de mesure d'audience.
   5. Ce cookie est strictement nécessaire : il ne demande pas de bandeau de consentement.

3. Sommaire — composant : `nav` (`am-legal-toc`), la page compte trois sections.

4. Sections :
   - **Le cookie que nous utilisons** (`cookie-fonctionnel`) : AssurMatch dépose aujourd'hui un seul
     cookie, nommé `am_pays`. Il mémorise le pays choisi par le visiteur pour que la navigation reste
     cohérente d'une page à l'autre, sans avoir à le resélectionner à chaque visite. Ce cookie est
     conservé 180 jours, s'applique à l'ensemble du site et n'est transmis à aucun autre site. Il ne
     contient aucune donnée personnelle identifiante : uniquement un code pays à deux lettres.
   - **Ce que nous ne faisons pas** (`pas-de-suivi`) : le site ne dépose aujourd'hui aucun cookie de
     mesure d'audience, de publicité ou de suivi entre sites. Aucune donnée de navigation n'est
     partagée avec un tiers à des fins de ciblage. Si cela devait changer, cette page serait mise à
     jour et un bandeau de consentement serait affiché avant le dépôt de tout cookie non strictement
     nécessaire.
   - **Comment le désactiver** (`gestion`) : le cookie `am_pays` étant strictement nécessaire au
     fonctionnement du sélecteur de pays, il ne requiert pas de consentement préalable. Il peut
     néanmoins être supprimé à tout moment depuis les réglages du navigateur. Sans lui, AssurMatch
     retente une détection du pays à chaque visite à partir d'informations techniques de connexion, ou
     demande simplement au visiteur de choisir son pays.

5. Variantes pays — composant : `Notice` (`tone="info"`, pages pays uniquement)
   - Aucun pays, y compris la Côte d'Ivoire, ne dispose aujourd'hui d'une variante de cette page :
     `apps/public/app/content/legal/countries/CI.ts` ne couvre que `legal-notice` et `privacy`. Le
     bandeau affiche donc systématiquement : « Aucune particularité locale n'est encore enregistrée
     pour {pays} : le texte général ci-dessous s'applique. »

6. À compléter avant mise en ligne : cette page n'a pas de placeholder. `page.placeholders` est vide
   dans `cookies.ts`, donc le bloc « À compléter » ne s'affiche pas (comportement du composant
   partagé, inchangé).

### Notes d'implémentation

- Contenu source : `apps/public/app/content/legal/cookies.ts:1-69`, même chaîne de rendu que la page
  Confidentialité (`legal-page-view.tsx`, `legal/index.ts`).
- Cohérence avec la décision D-Cookies du brief : le site n'utilise qu'un cookie fonctionnel, il n'y a
  pas de bandeau cookies ; cette fiche ne modifie pas ce choix, elle le rend seulement plus lisible.
- Ajout : le bloc « L'essentiel en 5 lignes » et la note explicite sur l'absence de variante pays.
- Chaîne structurelle protégée par `apps/public/tests/public-institutional.spec.ts:43-65` : idem
  fiche Confidentialité, avec `SLUG = "cookies"`.
- `[à confirmer]` : 0.
- `[à vérifier juridiquement]` : 0 (page purement descriptive d'un choix technique déjà fait).

---

## Conditions générales d'utilisation (CGU)

- Route FR / EN : `/cgu` / `/terms` (et par pays : `/pays/[code]/cgu` / `/countries/[code]/terms`)
- Objectif prioritaire (une phrase) : poser clairement le rôle d'intermédiaire technique d'AssurMatch
  et les engagements réciproques avec le visiteur.
- Appel à l'action principal / secondaire : aucun ; lien contextuel vers Statut réglementaire pour le
  détail du classement et de la rémunération.
- Namespace i18n existant : `Legal.*` + `apps/public/app/content/legal/terms.ts`
- Statut : restructuration (ajout d'un résumé, intitulés réécrits en langage clair, fond légal
  conservé)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero` (`size="sm"`)
   - Kicker : Informations légales
   - Titre : Conditions générales d'utilisation
   - Sous-titre : Les règles d'usage du site AssurMatch par les visiteurs.
   - Méta : Dernière mise à jour : 19 septembre 2026

2. L'essentiel en 5 lignes — composant : `Notice` (`tone="info"`)
   1. Vous ne payez rien à AssurMatch pour comparer des offres, et aucun compte n'est demandé.
   2. AssurMatch compare des offres indicatives et vous met en relation avec un courtier partenaire
      autorisé.
   3. Aucun contrat d'assurance n'est signé sur AssurMatch : la souscription se fait avec le courtier.
   4. Vous vous engagez à donner des informations exactes et un consentement éclairé avant tout envoi.
   5. AssurMatch n'est pas partie au contrat d'assurance et n'est pas responsable des décisions du
      courtier.

3. Sommaire — composant : `nav` (`am-legal-toc`), la page compte sept sections.

4. Sections :
   - **Ce que couvrent ces conditions** (`objet`) : les présentes conditions générales d'utilisation
     régissent l'accès et l'usage du site AssurMatch par tout visiteur. Le site permet de comparer des
     offres d'assurance indicatives par pays et par produit, puis de demander un devis transmis à un
     ou plusieurs courtiers partenaires autorisés.
   - **Utiliser le site ne coûte rien** (`acces-au-service`) : l'accès au site et la comparaison
     d'offres sont gratuits pour le visiteur et ne nécessitent pas la création d'un compte. Aucun
     contrat d'assurance n'est conclu sur le site : la souscription, lorsqu'elle a lieu, se fait auprès
     du courtier partenaire responsable, en dehors d'AssurMatch.
   - **Le rôle d'AssurMatch, en une phrase** (`role-plateforme`) `[à vérifier juridiquement]` :
     AssurMatch est un intermédiaire technique de comparaison et de mise en relation. AssurMatch ne
     vend pas d'assurance, n'émet aucun contrat ni attestation, ne collecte aucune prime et ne délivre
     aucun conseil personnalisé engageant. Les règles de classement des offres et le modèle de
     rémunération d'AssurMatch sont détaillés sur la page Statut réglementaire.
   - **Ce que nous vous demandons** (`obligations-visiteur`) : le visiteur s'engage à fournir des
     informations exactes lors d'une demande de devis, à ne pas soumettre de demandes en doublon ou
     frauduleuses, et à donner son consentement en connaissance de cause avant toute transmission de
     ses données à un courtier partenaire.
   - **Le caractère indicatif des offres** (`offres-indicatives`) : chaque prix affiché est un prix
     indicatif, à confirmer par le courtier partenaire. Chaque offre affichée est une offre indicative.
     Un contenu généré par l'assistant de lecture est toujours signalé comme tel et accompagné d'un
     rappel : il s'agit d'une aide à la compréhension, sans conseil personnalisé engageant.
   - **Qui est responsable de quoi** (`responsabilite`) `[à vérifier juridiquement]` : AssurMatch
     n'est pas partie au contrat d'assurance éventuellement conclu entre le visiteur et le courtier
     partenaire, et n'est donc pas responsable des décisions commerciales ou contractuelles de ce
     dernier. AssurMatch met en œuvre des moyens raisonnables pour assurer la disponibilité du site,
     sans garantie d'absence totale d'interruption.
   - **Droit applicable et tribunal compétent** (`droit-applicable`) `[à vérifier juridiquement]` : le
     droit applicable et la juridiction compétente en cas de litige sont précisés dans la section
     « À compléter avant mise en ligne ».
   - **Si ces règles changent** (`modification`) : ces conditions générales d'utilisation peuvent
     être mises à jour ; la date de dernière mise à jour figure en haut de cette page.

5. Variantes pays — composant : `Notice` (`tone="info"`, pages pays uniquement)
   - Aucun pays ne dispose aujourd'hui d'une variante de cette page (même situation que Cookies : la
     Côte d'Ivoire ne couvre que `legal-notice` et `privacy`). Le bandeau reste générique pour tous les
     pays ouverts, aujourd'hui la seule Côte d'Ivoire (le Sénégal, le Mali et la Guinée sont en liste d'attente).

6. À compléter avant mise en ligne — composant : `Notice` (`tone="indicative"`)
   - Droit applicable et juridiction compétente `[à confirmer]` `[à vérifier juridiquement]`

### Notes d'implémentation

- Contenu source : `apps/public/app/content/legal/terms.ts:1-141`, même chaîne de rendu partagée.
- Ajout : le bloc « L'essentiel en 5 lignes » et les intitulés en langage clair ; le fond légal des
  sept sections n'est pas modifié sur le fond, seuls les intitulés affichés et les marqueurs
  `[à vérifier juridiquement]` sont ajoutés là où une caractérisation juridique (rôle de la plateforme,
  limites de responsabilité, droit applicable) mérite une relecture juriste avant mise en ligne.
- Chaîne structurelle protégée par `apps/public/tests/public-institutional.spec.ts:43-65` : idem, avec
  `SLUG = "terms"`.
- `[à confirmer]` : 1 (droit applicable et juridiction).
- `[à vérifier juridiquement]` : 4, sur trois sections (rôle de la plateforme, responsabilité, droit
  applicable, ce dernier point comptant double car il porte à la fois un marqueur « à confirmer » et
  un marqueur « à vérifier juridiquement » distincts).

---

## Mentions légales

- Route FR / EN : `/mentions-legales` / `/legal-notice` (et par pays :
  `/pays/[code]/mentions-legales` / `/countries/[code]/legal-notice`)
- Objectif prioritaire (une phrase) : identifier l'éditeur, l'hébergeur et la nature de l'activité
  d'AssurMatch, avec ce qui reste à compléter clairement isolé.
- Appel à l'action principal / secondaire : aucun ; lien contextuel vers Nous écrire pour toute
  question sur ces mentions.
- Namespace i18n existant : `Legal.*` + `apps/public/app/content/legal/legal-notice.ts`
- Statut : restructuration (ajout d'un résumé, intitulés réécrits en langage clair, placeholders
  conservés)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero` (`size="sm"`)
   - Kicker : Informations légales
   - Titre : Mentions légales
   - Sous-titre : Éditeur, hébergeur et nature de l'activité du site AssurMatch.
   - Méta : Dernière mise à jour : 19 septembre 2026

2. L'essentiel en 5 lignes — composant : `Notice` (`tone="info"`)
   1. AssurMatch est une plateforme technique de comparaison indicative, pas un assureur ni un
      courtier.
   2. L'identité complète de l'éditeur et de l'hébergeur est en cours de finalisation, listée plus
      bas.
   3. AssurMatch ne vend pas d'assurance, n'émet aucun contrat et ne collecte aucune prime.
   4. Les prix affichés sont indicatifs et confirmés par le courtier partenaire responsable.
   5. Pour toute question sur ces mentions légales, la page Contact permet d'écrire à l'équipe
      AssurMatch.

3. Sommaire — composant : `nav` (`am-legal-toc`), la page compte six sections.

4. Sections :
   - **Qui publie ce site** (`editeur`) `[à confirmer]` : le site AssurMatch est édité par la société
     décrite ci-dessous. Les informations d'identification complètes de l'éditeur (dénomination
     sociale, numéro d'immatriculation, adresse du siège social et directeur ou directrice de la
     publication) sont listées dans la section « À compléter avant mise en ligne » en bas de cette
     page : elles seront affichées ici dès qu'elles auront été validées par l'équipe compétente.
   - **Qui héberge techniquement le site** (`hebergement`) `[à confirmer]` : le site est hébergé par
     un prestataire technique dont la raison sociale et l'adresse sont également listées dans la
     section « À compléter avant mise en ligne ».
   - **Ce que fait AssurMatch, légalement** (`activite`) `[à vérifier juridiquement]` : AssurMatch est
     une plateforme technique de comparaison indicative d'offres d'assurance et de mise en relation
     avec des courtiers partenaires autorisés. AssurMatch ne vend pas d'assurance, n'émet aucun
     contrat ni attestation, ne collecte aucune prime et ne délivre aucun conseil personnalisé
     engageant. Le courtier partenaire responsable confirme le devis et les conditions applicables
     auprès du visiteur.
   - **Marque et contenus** (`propriete-intellectuelle`) `[à vérifier juridiquement]` : la marque
     AssurMatch, son logo et la structure du site sont protégés. Toute reproduction non autorisée est
     interdite. Les textes décrivant les offres, garanties et courtiers proviennent des courtiers
     partenaires et des assureurs référencés et sont affichés tels que transmis, en français.
   - **Nos limites de responsabilité** (`responsabilite`) `[à vérifier juridiquement]` : les prix
     affichés sont indicatifs et doivent être confirmés par le courtier partenaire responsable avant
     toute souscription. AssurMatch s'efforce d'assurer l'exactitude des informations publiées mais ne
     peut garantir l'absence totale d'erreur ou d'interruption du service.
   - **Pour nous écrire** (`contact`) : pour toute question relative au site ou à ces mentions
     légales, la page Contact permet d'écrire à l'équipe AssurMatch.

5. Variantes pays — composant : `Notice` (`tone="info"`, pages pays uniquement)
   - Côte d'Ivoire (CI) : une variante existe, elle remplace la section `activite` par un texte
     nommant explicitement la Côte d'Ivoire (mêmes garanties : pas de vente d'assurance, pas de
     contrat, pas de prime collectée, pas de conseil engageant).
   - Sénégal (SN) : aucune variante n'existe aujourd'hui ; le texte général s'applique, avec le
     bandeau « Aucune particularité locale n'est encore enregistrée pour Sénégal ».

6. À compléter avant mise en ligne — composant : `Notice` (`tone="indicative"`)
   - Dénomination sociale et numéro d'immatriculation (registre du commerce) `[à confirmer]`
   - Adresse du siège social `[à confirmer]`
   - Directeur ou directrice de la publication `[à confirmer]`
   - Hébergeur du site (raison sociale et adresse) `[à confirmer]`

### Notes d'implémentation

- Contenu source : `apps/public/app/content/legal/legal-notice.ts:1-117`, même chaîne de rendu.
  Variante Côte d'Ivoire : `apps/public/app/content/legal/countries/CI.ts:11-37`.
- Ajout : le bloc « L'essentiel en 5 lignes », les intitulés en langage clair, la note « Variantes
  pays » qui rend explicite ce que `countryNotice` fait déjà visuellement.
- Chaîne structurelle protégée par `apps/public/tests/public-institutional.spec.ts:43-65` : idem, avec
  `SLUG = "legal-notice"`.
- `[à confirmer]` : 4 (les quatre placeholders existants).
- `[à vérifier juridiquement]` : 3 (nature de l'activité, propriété intellectuelle, limitation de
  responsabilité).

---

## Contact

- Route FR / EN : `/contact` / `/contact`
- Objectif prioritaire (une phrase) : router chaque message vers la bonne réponse selon le profil du
  visiteur (visiteur, courtier, assureur, presse), sans jamais donner de conseil engageant.
- Appel à l'action principal / secondaire : Envoyer le message / Consulter la FAQ
- Namespace i18n existant : `Contact.*` (+ `Forms.*` pour les libellés de champ partagés)
- Statut : restructuration (ajout des indications « pourquoi ce champ », d'un lien vers Notre
  engagement dans l'aside)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Nous écrire
   - Titre : Contact
   - Sous-titre : Une question sur une offre, un partenariat courtier ou assureur, ou la presse :
     écrivez-nous.

2. Choix du profil, en premier — composant : `RadioCards` (`name="audience"`, obligatoire, valeur par
   défaut « Visiteur »)
   - Légende : Vous êtes
   - Options, chacune avec son aide contextuelle :
     - Visiteur : une question sur une offre, un devis ou une demande en cours.
     - Courtier : une question sur le réseau de courtiers partenaires AssurMatch.
     - Assureur : une question sur le référencement de vos offres.
     - Presse : une demande d'information pour un article ou un reportage.

3. Champs du formulaire — composant : `Field` (chacun avec un indice « pourquoi on le demande », ajout
   par rapport à l'existant) :
   - Nom (obligatoire) : pour savoir à qui nous répondons.
   - E-mail (obligatoire) : pour vous envoyer la réponse.
   - Téléphone (facultatif) : utile si votre demande se traite plus simplement par téléphone.
   - Pays concerné (facultatif, liste alimentée par le répertoire public des pays ; option vide « Non
     précisé » si l'appel échoue) : pour orienter votre message vers la bonne équipe pays.
   - Sujet (obligatoire) : pour trier votre message plus vite.
   - Message (obligatoire) : décrivez votre demande ; plus c'est précis, plus la réponse sera utile.
   - Champ « site web » caché (honeypot anti-robot) : invisible pour un visiteur humain, aucune
     microcopie affichée.
   - Case de consentement (obligatoire) : « J'accepte qu'AssurMatch utilise ces informations pour
     répondre à mon message. », avec l'indice « Ces informations sont utilisées uniquement pour
     répondre à votre message. Voir notre politique de confidentialité. » (lien vers `/privacy`).

4. États :
   - Vide / saisie : aucun message d'erreur tant que le visiteur n'a pas tenté d'envoyer.
   - Erreur de champ : « Ce champ est obligatoire. » (nom, sujet, message) ou « Adresse e-mail
     invalide. » (e-mail), affichée sous le champ concerné, avec le focus déplacé vers le premier champ
     en erreur.
   - Erreur de consentement : « Le consentement est nécessaire pour envoyer ce message. », affichée
     sous la case.
   - Résumé d'erreurs : « Plusieurs champs doivent être corrigés avant l'envoi. », affiché uniquement
     si plus d'un contrôle est invalide.
   - Envoi en cours : bouton désactivé, libellé « Envoi en cours. ».
   - Erreur d'envoi (réseau ou serveur) : message d'erreur renvoyé par l'API, affiché dans une bannière
     au-dessus du bouton.
   - Succès : « Message envoyé », « Notre équipe vous répondra dès que possible. », « Repère de suivi
     de cet échange : {reference} », bouton « Envoyer un autre message » qui réinitialise le
     formulaire.
   - Anti-spam silencieux : si le champ caché est rempli (robot), le formulaire affiche le succès sans
     rien envoyer, pour ne pas indiquer au robot ce qui a échoué.

5. Bouton d'envoi — composant : `Button`
   - Libellé : Envoyer le message (Envoi en cours. pendant la soumission)

6. Aside « Avant de nous écrire » — composant : `Card` (`tone="muted"`)
   - Notre équipe répond par e-mail, du lundi au vendredi `[à confirmer : délai de réponse chiffré,
     uniquement si mesuré réellement]`.
   - AssurMatch ne donne aucun conseil personnalisé engageant : le devis et les conditions restent
     confirmés par un courtier partenaire autorisé.
   - Vos informations servent uniquement à répondre à votre message.
   - Pour vérifier comment nous protégeons vos données, consultez Notre engagement (ajout : lien vers
     `/notre-engagement`).
   - Beaucoup de questions trouvent déjà leur réponse dans la FAQ.
   - Bouton : Consulter la FAQ → `/faq`

### Notes d'implémentation

- Contenu source : `apps/public/app/[locale]/contact/page.tsx:1-126`,
  `apps/public/app/components/forms/contact-form.tsx:1-295`, libellés dans
  `apps/public/messages/fr.json:825-850` (namespace `Contact`).
- Les quatre indices d'audience existent déjà (`audienceVisitorHint`, `audienceBrokerHint`,
  `audienceInsurerHint`, `audiencePressHint`, `contact/page.tsx:36-39`) : rien à changer sur ce point.
- Ajouts par rapport à l'existant : un indice « pourquoi ce champ » sous chaque champ de coordonnées
  (nom, e-mail, téléphone, pays, sujet, message), toutes de nouvelles clés à créer, aujourd'hui
  absentes de `fr.json` ; et un cinquième item dans l'aside pointant vers `/notre-engagement` (route
  qui n'existe pas encore, voir fiche « Notre engagement »).
- Le délai de réponse « du lundi au vendredi » est déjà dans le contenu existant
  (`fr.json:833` `asideResponse`) sans promesse de durée chiffrée ; conforme à la règle « aucun délai
  de réponse n'est promis ». Je ne propose pas d'ajouter un chiffre : uniquement marqué `[à confirmer]`
  si l'équipe veut en publier un plus tard.
- Chaînes à vérifier avant implémentation, non couvertes par `public-institutional.spec.ts` mais à
  garder cohérentes avec `apps/public/tests/public-brokers.spec.ts` si ce fichier référence aussi la
  page Contact : à vérifier par l'agent qui implémente, hors périmètre de lecture de cette fiche.
  Aucune chaîne de cette page n'est citée dans `public-institutional.spec.ts`.
- `[à confirmer]` : 1 (délai de réponse chiffré, uniquement si l'équipe souhaite en publier un mesuré).
- `[à vérifier juridiquement]` : 0.

---

## Récapitulatif des marqueurs

| Page | `[à confirmer]` | `[à vérifier juridiquement]` |
| --- | --- | --- |
| Comment ça marche | 0 | 0 |
| Statut réglementaire | 1 | 2 |
| Notre engagement | 4 | 0 |
| Confidentialité | 5 | 2 |
| Cookies | 0 | 0 |
| CGU | 1 | 4 |
| Mentions légales | 4 | 3 |
| Contact | 1 | 0 |
| **Total** | **16** | **11** |
