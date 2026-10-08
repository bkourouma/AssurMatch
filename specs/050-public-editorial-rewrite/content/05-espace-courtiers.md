# 05 : Espace courtiers

Périmètre : les six pages de l'espace courtiers (candidature, tarifs, candidature en 4 étapes,
confirmation, connexion, annuaire courtiers/assureurs). Charte appliquée :
`specs/050-public-editorial-rewrite/content/00-charte-editoriale.md`. Sources lues : les pages sous
`apps/public/app/[locale]/brokers/**`, `apps/public/app/[locale]/countries/[countryCode]/brokers/**`
et `.../insurers/page.tsx`, `apps/public/app/content/brokers.ts`,
`apps/public/app/components/forms/partner-application-form.tsx`,
`apps/public/app/components/ui/broker-block.tsx`, `apps/public/app/lib/public-api.ts`,
`apps/public/app/lib/site-config.ts`, `apps/public/messages/fr.json` (namespaces `Brokers`,
`BrokerPricing`, `BrokerApply`, `BrokerLogin`, `Directory`, `NotFound`, `Common`),
`apps/public/tests/public-brokers.spec.ts`.

---

## Devenir partenaire

- Route FR / EN : `/courtiers` / `/brokers`
- Objectif prioritaire (une phrase) : convaincre un courtier autorisé en Côte d'Ivoire
  de déposer une candidature, en lui montrant honnêtement ce qu'il recevra et ce qu'on attend de lui.
- Appel à l'action principal / secondaire : Devenir partenaire / Se connecter à l'espace courtier
- Namespace i18n existant : `Brokers`
- Statut : restructuration (ajout d'une FAQ, ajout d'un quatrième point d'attente, correction de
  libellés)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Réseau de courtiers partenaires en Côte d'Ivoire
   - Titre : Courtiers partenaires
   - Sous-titre : AssurMatch transmet des demandes de devis qualifiées aux courtiers autorisés en
     Côte d'Ivoire. Comparez les formules, déposez une candidature ou accédez à votre
     espace courtier.
   - Corps / microcopie : aucun
   - Boutons : Devenir partenaire (lien `/courtiers/candidature`) · Se connecter à l'espace courtier
     (lien externe vers le portail courtier)
   - Données affichées (source) : aucune
   - États : aucun

2. Les formules courtier — composant : `PlanComparison`
   - Kicker : aucun
   - Titre : Les formules courtier
   - Sous-titre : Trois formules, du démarrage simple à l'intégration technique avancée.
   - Corps / microcopie : tableau comparatif Starter / Pro / Enterprise ; colonne « Tout {formule},
     plus : » pour Pro et Enterprise. Contenu détaillé des formules et des tarifs : voir la fiche
     « Formules et tarifs ».
   - Boutons : Comparer les formules en détail (lien `/courtiers/tarifs`)
   - Données affichées (source) : `brokerPlans(locale)` (`apps/public/app/content/brokers.ts`)
   - États : aucun

3. Ce que reçoit un courtier — composant : `LeadExampleCard`
   - Kicker : aucun
   - Titre : Ce que reçoit un courtier
   - Sous-titre : Voici, à titre illustratif, la fiche d'une demande transmise à un courtier
     partenaire assigné.
   - Corps / microcopie : badge « Exemple illustratif » ; mention « Aucune donnée personnelle
     réelle : exemple purement illustratif. » Champs de la fiche exemple :
     - Référence : DQ-2026-A1B2C3D4 [exemple]
     - Pays : Côte d'Ivoire [exemple]
     - Produit : Assurance auto [exemple]
     - Ville : Abidjan [exemple]
     - Budget déclaré : 50 000 à 100 000 FCFA [exemple]
     - Canal de rappel demandé : Rappel WhatsApp [exemple]
     - Consentement : Enregistré
   - Boutons : aucun
   - Données affichées (source) : contenu illustratif du fichier, jamais de vraie demande
   - États : aucun

4. Le portail courtier — composant : `PortalMock`
   - Kicker : aucun
   - Titre : Le portail courtier
   - Sous-titre : Un espace dédié pour accepter un lead, suivre son dossier et, selon la formule,
     piloter un pipeline commercial.
   - Corps / microcopie : illustration du portail ; légende : « Illustration du portail courtier
     partenaire. Aucune capture d'écran réelle n'est disponible pour le moment. »
   - Boutons : aucun
   - Données affichées (source) : aucune (illustration statique)
   - États : aucun

5. Ce qu'AssurMatch attend d'un partenaire — composant : `Card` × 4
   - Kicker : aucun
   - Titre : Ce qu'AssurMatch attend d'un partenaire
   - Sous-titre : aucun
   - Corps / microcopie (une carte par point, dans cet ordre) :
     1. Détenir une licence valide pour exercer l'activité de courtage dans le pays concerné.
        (icône `badge-check`)
     2. Répondre aux demandes transmises avec discipline, dans un délai raisonnable. (icône `clock`)
     3. Confirmer des prix honnêtes : le prix affiché au visiteur reste indicatif jusqu'à votre
        confirmation, sans majoration cachée au moment de conclure. (icône `scale`)
     4. Respecter le consentement du visiteur, y compris lorsqu'il le retire. (icône `shield-check`)
   - Boutons : aucun
   - Données affichées (source) : `content.partnerExpectations` (`content/brokers.ts`), étendu à 4
     points au lieu de 3
   - États : aucun

6. FAQ courtiers — composant : nouveau, `FaqList` ou équivalent (accordéon existant du design system)
   - Kicker : aucun
   - Titre : Questions fréquentes des courtiers
   - Sous-titre : aucun
   - Corps / microcopie (8 questions) :
     1. **Qui peut candidater ?**
        Tout courtier détenant une licence valide pour exercer dans un pays ouvert peut déposer une
        candidature. Les pays annoncés avec une liste d'attente ne reçoivent pas encore de demandes. Chaque dossier est étudié individuellement par notre équipe conformité.
     2. **Comment ma licence est-elle vérifiée ?**
        Notre équipe conformité vérifie le numéro et la date d'expiration indiqués dans votre
        dossier auprès de l'autorité de tutelle que vous mentionnez, avant toute activation.
        `[à vérifier juridiquement]` pour la liste des autorités de tutelle reconnues par pays.
     3. **Qu'est-ce qui est facturé ?**
        Des frais de mise en place à l'activation, un abonnement mensuel selon votre formule, et un
        prix par lead qualifié qui remplit les sept critères de facturation. Le détail est sur la
        page Formules et tarifs. AssurMatch n'encaisse jamais de prime et ne prend aucune commission
        sur une prime.
     4. **Puis-je mettre en pause la réception de leads ?**
        `[à confirmer]`
     5. **Une exclusivité territoriale ou par produit est-elle possible ?**
        `[à confirmer]`
     6. **À qui appartiennent les données d'un lead transmis ?**
        Le lead reste attaché au consentement donné par le visiteur : vous le recevez pour le
        traiter et devez respecter ce consentement, y compris s'il est retiré après transmission.
        `[à confirmer]` pour la conservation des données après la fin d'un partenariat.
     7. **Comment mes leads me sont-ils attribués ?**
        Un moteur de règles déterministes décide : pays actif, produit actif, licence valide, quota
        disponible, exclusions. L'IA peut proposer un score ou un ordre de priorité, mais elle ne
        décide jamais seule qui reçoit une demande.
     8. **Dois-je changer mes outils actuels pour commencer ?**
        Non. En formule Starter, vous recevez les leads par e-mail, WhatsApp ou SMS sans rien
        changer à vos outils. Les formules Pro et Enterprise ajoutent un CRM en option.
   - Boutons : aucun
   - Données affichées (source) : contenu éditorial nouveau, à ajouter à `content/brokers.ts` ou à un
     fichier dédié
   - États : aucun

7. CTA final — composant : `Section` (tone brand)
   - Kicker : aucun
   - Titre : Prêt à rejoindre le réseau ?
   - Sous-titre : Déposez une candidature ou accédez directement à votre espace courtier si vous
     êtes déjà partenaire.
   - Corps / microcopie : aucun
   - Boutons : Devenir partenaire · Se connecter à l'espace courtier
   - Données affichées (source) : aucune
   - États : aucun

### Notes d'implémentation

- `apps/public/app/[locale]/brokers/page.tsx:65` (`hero.loginCta`) et
  `apps/public/messages/fr.json:875` affichent aujourd'hui « Accéder à l'espace courtier » ; la
  charte (section 5) fixe le libellé exact « Se connecter à l'espace courtier ». À corriger partout
  où ce bouton apparaît sur cette page et sur `/courtiers/connexion`.
- `apps/public/messages/fr.json:906` affiche « 50 000 à 100 000 XOF » : la charte (règle 7) impose
  `FCFA` après le montant, jamais le code devise ISO. À corriger.
- `apps/public/app/[locale]/brokers/page.tsx:32` (`EXPECTATION_ICONS`) ne liste que 3 icônes pour 3
  points ; il en faut 4 pour les 4 points ci-dessus (`badge-check`, `clock`, `scale`, `shield-check`).
- `content.partnerExpectations` (`apps/public/app/content/brokers.ts:133-137`) ne contient que 3
  phrases ; il en faut 4, y compris la nouvelle phrase sur l'honnêteté des prix.
- La section FAQ est entièrement nouvelle : aucun composant d'accordéon n'existe aujourd'hui sur les
  pages courtiers (le design system en a un ailleurs, à vérifier) ; namespace `Brokers.faq` à créer.
- Marqueurs : 2 `[à confirmer]` (pause, exclusivité) + 1 `[à confirmer]` (conservation des données) +
  1 `[à vérifier juridiquement]` (autorités de tutelle).
- Chaîne inchangée à préserver : `apps/public/tests/public-brokers.spec.ts` ne teste pas cette page
  directement, mais `apps/public/tests/public-institutional.spec.ts:38` teste la phrase de
  rémunération d'`institutional.ts`, réutilisée en substance dans la FAQ point 3 (pas de citation
  mot pour mot exigée ici).

---

## Formules et tarifs

- Route FR / EN : `/courtiers/tarifs` / `/brokers/pricing`
- Objectif prioritaire (une phrase) : permettre à un courtier de comprendre exactement ce que chaque
  formule contient, ce qu'elle ne contient pas et combien elle coûte dans son pays, sans promesse
  invérifiable.
- Appel à l'action principal / secondaire : Envoyer ma candidature / Contacter AssurMatch
- Namespace i18n existant : `BrokerPricing`
- Statut : restructuration (réécriture des listes de fonctionnalités selon D-IA, ajout des exclusions
  par formule, ajout d'une FAQ facturation, ajout d'un CTA de sortie)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Titre : Tarifs courtiers
   - Sous-titre : Tarification à destination des courtiers partenaires : abonnement mensuel et
     facturation au lead qualifié, propres à chaque pays.
   - Boutons : aucun
   - États : aucun

2. Sélecteur de pays — composant : `form` GET, sans JavaScript
   - Kicker : aucun
   - Corps / microcopie : étiquette « Pays » ; bouton « Afficher les tarifs ». Formulaire `GET` qui
     recharge la page avec `?pays=XX`.
   - Note d'implémentation : ce formulaire reste opérable sans JavaScript.
   - Données affichées (source) : pays ouverts ou pilotes, `visitor.directory` filtré
     (`apps/public/app/[locale]/brokers/pricing/page.tsx:51`)
   - États : masqué si aucun pays éligible

3. Les formules et leurs tarifs — composant : `PlanPricingCard` × 3
   - Titre : Les formules et leurs tarifs
   - Corps / microcopie : trois cartes, dans cet ordre.

     **Starter**
     Positionnement : Pour démarrer la réception de leads qualifiés sans changer vos outils.
     Public visé : Courtiers indépendants ou petites structures qui démarrent avec AssurMatch.
     Inclus :
     - Leads qualifiés reçus par e-mail, WhatsApp ou SMS
     - Portail courtier simplifié
     - Accepter ou refuser un lead
     - Historique minimal des leads reçus
     - Tableau de bord basique
     Non inclus dans cette formule :
     - Pas de CRM
     - Pas de gestion de tâches ni de rappels
     - Pas d'attribution des leads à une équipe
     - Pas de fonction générée par IA

     **Pro** (inclut tout Starter, plus :)
     Positionnement : Pour piloter les leads avec un CRM et des outils d'aide à la qualification.
     Public visé : Cabinets de courtage avec une équipe commerciale et un besoin de suivi structuré.
     Inclus en plus :
     - CRM en tableau Kanban
     - Pipeline commercial
     - Notes internes
     - Tâches et rappels
     - Attribution des leads à un agent
     - Dépôt de documents
     - Devis joints ou saisis dans le dossier
     - Tableau de bord courtier
     - Tri automatique des leads reçus (généré par IA, à relire par votre équipe)
     - Résumé automatique de la demande (généré par IA, à relire par votre équipe)
     - Suggestions de relance (généré par IA, à relire par votre équipe)
     - Détection automatique des doublons (généré par IA, à relire par votre équipe)
     - Export avancé
     Non inclus dans cette formule :
     - Pas de multi-agence
     - Pas d'API partenaire ni de webhooks
     - Pas de marque blanche

     **Enterprise** (inclut tout Pro, plus :)
     Positionnement : Pour les réseaux multi-agences avec des besoins d'intégration et de reporting
     avancés.
     Public visé : Groupes de courtage multi-agences ou réseaux avec des exigences techniques
     avancées.
     Inclus en plus :
     - Multi-agence
     - Gestion multi-utilisateur avec rôles personnalisés
     - API partenaire
     - Webhooks
     - Reporting avancé
     - SLA prioritaire, détaillé dans le contrat `[à confirmer]`
     - Intégrations avec des CRM externes
     - Fonctions IA supplémentaires, définies avec notre équipe selon vos besoins `[à confirmer]`
       (généré par IA, à relire par votre équipe)
     - Tableaux de bord consolidés
     - Marque blanche et domaine personnalisé, en option

     Ce qui n'est inclus dans aucune formule :
     - Encaissement de prime : non disponible.
     - Commission sur une prime : non disponible.
     - Signature électronique de contrat : non disponible dans cette version.
     - Émission de police ou d'attestation : non disponible dans cette version.
   - Boutons (bas de carte) : Envoyer ma candidature (lien `/courtiers/candidature?formule=<clé>`)
   - Données affichées (source) : `brokerPlans(locale)` pour le contenu, `listPartnerPlans(pays)`
     pour les montants (`monthlySubscription`, `perLeadPrice`, `setupFee`)
   - États :
     - Prix connu : montant formaté (`formatMoney`)
     - Prix absent pour cette formule dans ce pays : « Sur devis »
     - Aucun prix publié pour aucune formule dans ce pays : `EmptyState` « Tarifs non publiés pour ce
       pays » / « Les tarifs de ce pays ne sont pas encore publiés. Contactez notre équipe pour en
       savoir plus. » avec bouton « Contacter AssurMatch »
     - Aucun pays éligible : même `EmptyState`

4. Mention légale des tarifs — composant : `Notice`
   - Corps / microcopie : « Tarifs indicatifs, hors taxes et propres à chaque pays. Aucun paiement en
     ligne n'est proposé sur ce site. »
   - États : deuxième bandeau `Notice` optionnel si l'API renvoie un message additionnel
     (`notice` du contrat)

5. Ce qui rend un lead facturable — composant : `BillableCriteriaList`
   - Titre : Ce qui rend un lead facturable
   - Sous-titre : Un lead n'est facturé que si les sept critères suivants sont réunis.
   - Corps / microcopie (les 7 critères, id conservé, formulation en clair) :
     1. `contact_reachable` : téléphone ou e-mail valide. Le visiteur a laissé un numéro ou un e-mail
        qui fonctionne.
     2. `country_active` : pays actif sur AssurMatch. Le pays de la demande est ouvert au moment de
        l'envoi.
     3. `product_active` : produit actif sur AssurMatch. Le produit d'assurance demandé est
        disponible.
     4. `consent_collected` : consentement du visiteur recueilli. La case de consentement a été
        cochée avant l'envoi.
     5. `not_duplicate` : demande non dupliquée. Cette demande n'a pas déjà été transmise pour le
        même visiteur et le même besoin.
     6. `broker_assigned` : courtier assigné à la demande. Un courtier a été désigné responsable par
        le moteur de routage.
     7. `minimum_information_complete` : informations minimales complètes. Les champs obligatoires
        du formulaire de devis sont renseignés.
   - Corps / microcopie complémentaire : « Un lead qui ne remplit pas l'un de ces sept critères n'est
     jamais facturé. » Facturation d'un lead que vous refusez après réception : `[à confirmer]`.
   - Données affichées (source) : `billableLeadCriteria(locale)` (`content/brokers.ts`)
   - États : aucun

6. FAQ facturation — composant : nouveau (accordéon)
   - Titre : Questions fréquentes sur la facturation
   - Corps / microcopie (6 questions) :
     1. **Les tarifs affichés incluent-ils la taxe ?**
        Non, tous les tarifs affichés sont hors taxes.
     2. **Que se passe-t-il si aucun tarif n'est publié pour mon pays ?**
        La mention « Sur devis » s'affiche à la place d'un montant. Contactez notre équipe pour
        obtenir une proposition.
     3. **Un lead que je refuse est-il facturé ?**
        `[à confirmer]`
     4. **Puis-je changer de formule en cours d'abonnement ?**
        `[à confirmer]`
     5. **Comment est calculé le prix par lead qualifié ?**
        Un montant fixe par lead qui remplit les sept critères ci-dessus, propre à votre pays et à
        votre formule.
     6. **Y a-t-il une durée d'engagement minimale ?**
        `[à confirmer]`
   - Données affichées (source) : contenu éditorial nouveau
   - États : aucun

### Notes d'implémentation

- Réécriture complète des tableaux `features` de `apps/public/app/content/brokers.ts:63-112` (FR) et
  `:147-196` (EN) selon D-IA : renommer par fonction, ajouter systématiquement « (généré par IA, à
  relire par votre équipe) » sur les 4 lignes Pro et la ligne Enterprise concernées, retirer le
  préfixe marketing « IA » du champ `positioning` de Pro (`content/brokers.ts:75`).
- Nouveau champ à ajouter au modèle de contenu : `notIncluded: readonly string[]` par formule, plus
  `neverIncluded: readonly string[]` global (les 4 lignes « non disponible »). Aucune de ces phrases
  n'est inventée : elles reprennent les `Must Not` de la constitution (`payments_enabled`,
  `e_signature_enabled`, `policy_issuance_enabled` désactivés, `constitution.md` principe I et III).
- Le test `apps/public/tests/public-brokers.spec.ts:4-29` vérifie que le fichier `content/brokers.ts`
  contient chaque `id:` des 7 critères exactement 2 fois (FR + EN) et que la page lit
  `billableLeadCriteria(locale)`, `BillableCriteriaList`, `listPartnerPlans`, `PlanPricingCard`,
  `t("pricing.onRequest")`. Garder ces quatre chaînes mot pour mot si le fichier est modifié.
  Renommer les identifiants (`contact_reachable`, etc.) casserait ce test : ne pas y toucher.
- Le bouton « Envoyer ma candidature » par carte est un ajout : aujourd'hui la page tarifs n'a aucun
  appel à l'action (`apps/public/app/[locale]/brokers/pricing/page.tsx`).
- Marqueurs : 2 `[à confirmer]` dans les cartes de formules (SLA, périmètre IA Enterprise) + 1
  `[à confirmer]` sous les critères facturables + 3 `[à confirmer]` dans la FAQ facturation.

---

## Candidature en 4 étapes

- Route FR / EN : `/courtiers/candidature` / `/brokers/apply`
- Objectif prioritaire (une phrase) : recueillir un dossier de candidature complet et honnête, en 4
  étapes guidées côté client, avec un repli entièrement fonctionnel sans JavaScript.
- Appel à l'action principal / secondaire : Envoyer ma candidature / Revenir à l'étape précédente
- Namespace i18n existant : `BrokerApply`
- Statut : restructuration (le formulaire à 4 blocs sur une seule page devient un parcours en 4
  étapes avec récapitulatif, tout en gardant le même formulaire à une page comme repli sans
  JavaScript)

### Structure (dans l'ordre)

0. Intro — composant : `Hero`
   - Titre : Devenir partenaire
   - Sous-titre : Cette candidature est un dossier d'intention étudié par notre équipe conformité.
     Elle n'active aucun compte courtier.
   - Boutons : aucun
   - États : aucun

1. Étape 1 sur 4 : Société
   - Kicker (indicateur d'étape) : Étape 1 sur 4
   - Titre de section : Société
   - Champs :
     - Raison sociale (`legalName`, obligatoire). Pourquoi on le demande : c'est le nom légal sous
       lequel votre structure est enregistrée. Erreur si vide : « Ce champ est obligatoire. »
     - Nom commercial (`tradeName`, facultatif). Pourquoi on le demande : facultatif, uniquement si
       différent de la raison sociale. C'est le nom que verront vos futurs leads.
     - Pays (`countryCode`, obligatoire, liste déroulante des pays ouverts ou pilotes). Pourquoi on
       le demande : détermine les produits proposés à l'étape 3 et la formule tarifaire applicable.
       Erreur si vide : « Ce champ est obligatoire. »
   - Bouton : Continuer

2. Étape 2 sur 4 : Contact
   - Kicker : Étape 2 sur 4
   - Titre de section : Contact
   - Champs :
     - Nom du contact (`contactName`, obligatoire). Pourquoi on le demande : la personne que notre
       équipe conformité contactera pour étudier le dossier. Erreur : « Ce champ est obligatoire. »
     - E-mail du contact (`contactEmail`, obligatoire). Pourquoi on le demande : c'est par cet e-mail
       que nous vous enverrons la suite du dossier, y compris la demande de copie de licence. Erreur
       si absent ou mal formé : « Adresse e-mail invalide. »
     - Téléphone du contact (`contactPhone`, obligatoire, format international, ex. +225XXXXXXXXX).
       Pourquoi on le demande : pour vous joindre rapidement si un point du dossier manque. Erreur :
       « Numéro de téléphone invalide. Utilisez le format international, par exemple
       +225XXXXXXXXX. »
     - WhatsApp (`whatsapp`, facultatif, même format). Pourquoi on le demande : facultatif, un canal
       de contact supplémentaire si vous le préférez. Erreur si rempli et invalide : même message que
       le téléphone.
   - Boutons : Continuer · Revenir à l'étape précédente

3. Étape 3 sur 4 : Agrément et capacité
   - Kicker : Étape 3 sur 4
   - Titre de section : Agrément et capacité
   - Corps / microcopie (en tête d'étape) : « Un exemplaire de votre licence vous sera demandé par
     e-mail après l'envoi de cette candidature. Il n'y a rien à joindre ici. »
   - Champs :
     - Numéro de licence (`licenseNumber`, obligatoire). Pourquoi on le demande : ce numéro permet à
       notre équipe conformité de vérifier votre agrément auprès de l'autorité de tutelle avant toute
       activation. Erreur : « Ce champ est obligatoire. »
     - Date d'expiration de la licence (`licenseExpiresAt`, obligatoire, doit être postérieure à
       aujourd'hui). Pourquoi on le demande : une licence expirée bloque automatiquement toute
       activation. Erreur si absente : « Ce champ est obligatoire. » Erreur si passée ou invalide :
       « La date d'expiration doit être postérieure à aujourd'hui. »
     - Autorité émettrice (`licenseIssuingAuthority`, facultatif). Pourquoi on le demande : facultatif,
       l'organisme qui a délivré votre agrément, utile pour accélérer la vérification.
     - Produits souhaités (`productKeys`, cases à cocher, au moins un obligatoire, liste dépendant du
       pays choisi à l'étape 1). Pourquoi on le demande : détermine les demandes que vous êtes
       susceptible de recevoir. Erreur si aucun coché : « Sélectionnez au moins un produit. » État
       vide (aucun produit pour ce pays) : « Aucun produit disponible pour ce pays pour le moment. »
     - Capacité mensuelle de traitement des leads (`monthlyCapacity`, obligatoire, entier ≥ 1).
       Pourquoi on le demande : nombre de demandes que vous pouvez traiter par mois, pour ne jamais
       vous envoyer plus de leads que vous ne pouvez en suivre. Erreur : « Ce champ est obligatoire. »
   - Boutons : Continuer · Revenir à l'étape précédente

4. Étape 4 sur 4 : Formule et consentement
   - Kicker : Étape 4 sur 4
   - Titre de section : Formule et consentement
   - Corps / microcopie : récapitulatif en lecture seule des étapes 1 à 3, avec un lien « Modifier »
     par section pour revenir directement dessus sans perdre les autres champs.
   - Champs :
     - Formule souhaitée (`desiredPlan`, cases radio Starter / Pro / Enterprise, obligatoire).
       Pourquoi on le demande : oriente l'étude de votre dossier vers la bonne offre commerciale.
       Erreur : « Ce champ est obligatoire. »
     - Message (`message`, facultatif, 2000 caractères max). Pourquoi on le demande : facultatif,
       toute précision utile à l'étude de votre dossier.
     - Champ « Laisser ce champ vide » (`website`) : piège à robots, masqué visuellement et pour les
       lecteurs d'écran, jamais rempli par une personne.
     - Consentement (`consent`, case à cocher non pré-cochée, obligatoire) : « J'accepte que ces
       informations soient transmises à l'équipe conformité d'AssurMatch pour l'étude de ma
       candidature. » Erreur si non cochée : « Le consentement est obligatoire pour envoyer la
       candidature. »
   - Bandeau d'erreur générique si la vérification échoue : « Le formulaire contient des erreurs.
     Corrigez les champs signalés. »
   - Boutons : Envoyer ma candidature · Revenir à l'étape précédente

5. Repli sans JavaScript
   - Corps / microcopie : les 4 sections ci-dessus s'affichent l'une après l'autre sur une seule
     page, sans étapes ni récapitulatif interactif ; l'envoi se fait par une soumission de formulaire
     classique. C'est la forme déjà en place aujourd'hui.
   - États : identiques à ceux détaillés ci-dessous, affichés en haut de page après rechargement.

6. États d'envoi et d'erreur
   - Envoi en cours : bouton désactivé, libellé « Envoi en cours. »
   - Succès : redirection vers la page de confirmation dédiée (voir fiche suivante), avec la
     référence publique transmise en paramètre. Remplace l'actuel encart de succès affiché sur cette
     même page.
   - Erreur de validation (champs manquants ou invalides) : messages ci-dessus, sous chaque champ, et
     bandeau générique.
   - Trop de demandes (429) : « Trop de demandes envoyées depuis cet appareil. Réessayez dans
     quelques minutes. »
   - Candidatures fermées pour ce pays (422) : « La candidature pour ce pays n'est pas ouverte pour
     le moment. Laissez vos coordonnées via notre page Contact : nous vous recontacterons si elle
     rouvre. » `[à confirmer]` si un motif plus précis doit être communiqué.
   - Panne réseau ou API indisponible : « Impossible d'envoyer votre candidature pour le moment.
     Vérifiez votre connexion et réessayez. »
   - Aucun pays éligible à l'ouverture de la page : `EmptyState` « Candidature momentanément
     indisponible » / « Aucun pays n'accepte de nouvelle candidature de courtier pour le moment. »

### Notes d'implémentation

- Aujourd'hui, `apps/public/app/components/forms/partner-application-form.tsx:245-482` rend déjà les
  4 blocs (société, contact, licence, formule/message/consentement) l'un après l'autre sur une seule
  page : c'est la base du repli sans JavaScript décrit ci-dessus. Le parcours en étapes est une
  surcouche client à ajouter (affichage d'un seul `fieldset` à la fois, barre de progression,
  récapitulatif à l'étape 4), sans changer les champs, leurs `name`, ni la validation existante
  (`partner-application-form.tsx:157-179`).
- Chaînes protégées par `apps/public/tests/public-brokers.spec.ts:31-42`, à garder mot pour mot :
  `name="website"` et la classe `am-visually-hidden` sur le piège à robots ; `name="consent"` jamais
  `defaultChecked` ni `checked` ; aucun `type="file"` sur la page (le dépôt de la licence reste
  annoncé comme « demandé par e-mail », jamais un champ de dépôt de fichier).
- Le succès affiché aujourd'hui en ligne (`partner-application-form.tsx:226-239`,
  `BrokerApply.form.success.*` dans `fr.json:998-1007`) doit devenir une redirection vers
  `/courtiers/candidature/confirmation` : voir la fiche « Confirmation de candidature ». La référence
  publique et les `nextSteps` retournés par l'API (`apps/public/app/lib/public-api.ts:496-505`) sont
  à transmettre à la page de confirmation, jamais de donnée personnelle.
- `apps/public/app/lib/public-api.ts:490-514` (`submitPartnerApplication`) ne distingue aujourd'hui
  que 429 (limite de requêtes) et « tout le reste » (message générique « Envoi de la candidature
  impossible pour le moment. »). Un état 422 dédié « pays fermé à la candidature » est à ajouter
  côté API et côté lecture de la réponse pour afficher le message spécifique ci-dessus au lieu du
  message générique.
- Marqueur : 1 `[à confirmer]` (formulation exacte du refus 422).

---

## Confirmation de candidature

- Route FR / EN : `/courtiers/candidature/confirmation` / `/brokers/apply/confirmation`
- Objectif prioritaire (une phrase) : confirmer que la candidature est bien reçue, expliquer la suite
  sans rien promettre qui ne soit pas vrai, sans afficher de donnée personnelle.
- Appel à l'action principal / secondaire : Retour à l'espace courtiers / Contacter AssurMatch
- Namespace i18n existant : nouveau (`BrokerApplyConfirmation`)
- Statut : nouvelle page

### Structure (dans l'ordre)

1. Confirmation — composant : bloc de confirmation (`IconTile` + texte, comme les pages de succès
   existantes)
   - Kicker : aucun
   - Titre : Candidature reçue
   - Sous-titre : Référence de votre candidature : `{reference}`
   - Corps / microcopie :
     - Ce qui se passe ensuite, dans l'ordre : 1) notre équipe conformité étudie votre dossier ;
       2) elle vérifie votre licence auprès de l'autorité que vous avez indiquée ; 3) un membre de
       l'équipe vous contacte par e-mail ou par téléphone, aux coordonnées transmises.
     - Aucun délai n'est garanti pour cette étude. `[à confirmer]` si un délai indicatif peut être
       communiqué.
     - Pendant ce temps : gardez une copie numérique de votre licence à portée de main, elle vous
       sera demandée par e-mail.
     - Aucun compte partenaire n'est créé à ce stade. Vous ne pouvez pas encore vous connecter à
       l'espace courtier.
   - Boutons : Retour à l'espace courtiers (lien `/courtiers`) · Contacter AssurMatch (lien
     `/contact`)
   - Données affichées (source) : `publicReference` transmise par le formulaire de candidature ;
     aucune autre donnée du dossier
   - États :
     - Référence présente (cas normal, arrivée depuis le formulaire) : contenu ci-dessus.
     - Référence absente (page atteinte directement, sans passer par le formulaire) : titre « Aucune
       candidature récente trouvée » ; corps : « Si vous venez d'envoyer une candidature, revenez au
       formulaire pour recommencer l'envoi. » ; bouton unique « Revenir au formulaire de candidature »
       (lien `/courtiers/candidature`).

### Notes d'implémentation

- Route absente de `apps/public/i18n/routing.ts` aujourd'hui : à ajouter dans `pathnames`, sur le
  modèle des entrées `/brokers/*` déjà présentes (`routing.ts:71-74`), par exemple
  `"/brokers/apply/confirmation": { fr: "/courtiers/candidature/confirmation", en:
  "/brokers/apply/confirmation" }`.
- Cette page est statique : elle ne fait aucun appel à l'API, elle affiche seulement ce que le
  formulaire lui transmet (par exemple un paramètre de requête `reference`). Pas d'état de
  chargement ni d'erreur réseau propre à cette page.
- Aucune donnée personnelle (nom, e-mail, téléphone, raison sociale) n'apparaît sur cette page : seule
  la référence publique, générée côté serveur, y figure.
- Marqueur : 1 `[à confirmer]` (délai indicatif de l'étude).

---

## Connexion

- Route FR / EN : `/courtiers/connexion` / `/brokers/login`
- Objectif prioritaire (une phrase) : orienter un courtier déjà partenaire vers son espace
  authentifié séparé, et expliquer clairement pourquoi il n'y a pas de mot de passe à saisir ici.
- Appel à l'action principal / secondaire : Se connecter à l'espace courtier / Contacter AssurMatch
- Namespace i18n existant : `BrokerLogin`
- Statut : réécriture

### Structure (dans l'ordre)

1. Fil d'Ariane autonome — composant : `Breadcrumb` (barre indépendante, pas de hero)
   - Données affichées (source) : Accueil > Connexion courtier
   - États : aucun

2. Carte de connexion — composant : bloc `am-logincard`
   - Kicker : aucun
   - Titre : Connexion courtier
   - Sous-titre : L'espace courtier est une application distincte, réservée aux courtiers partenaires
     authentifiés. Elle n'est pas accessible depuis le site public.
   - Corps / microcopie (encart d'information) :
     - Titre de l'encart : Authentification à deux facteurs obligatoire
     - Corps de l'encart : La connexion à l'espace courtier exige une authentification à deux
       facteurs (2FA), en plus de votre identifiant et de votre mot de passe.
   - Boutons : Se connecter à l'espace courtier (lien externe vers le portail courtier) · Devenir
     partenaire (lien `/courtiers/candidature`, discret) · Formules et tarifs (lien
     `/courtiers/tarifs`, discret)
   - Données affichées (source) : aucune
   - États : aucun

3. Accès perdu — composant : `Section`
   - Titre : Accès perdu ?
   - Corps / microcopie : Si vous ne parvenez plus à vous connecter à votre espace courtier,
     contactez notre équipe. Nous ne réinitialisons jamais un mot de passe par ce formulaire public :
     un membre de l'équipe vous recontacte pour vérifier votre identité avant toute action sur votre
     compte.
   - Boutons : Contacter AssurMatch (lien `/contact`)
   - Données affichées (source) : aucune
   - États : aucun

### Notes d'implémentation

- `apps/public/app/[locale]/brokers/login/page.tsx:61-70` compose déjà le bouton de connexion depuis
  `brokerLoginUrl` (`apps/public/app/lib/site-config.ts:7-10`, dérivé de
  `NEXT_PUBLIC_ASSURMATCH_BROKER_URL`) : aucun changement structurel, seule la copie évolue.
- Chaîne protégée par `apps/public/tests/public-brokers.spec.ts:44-58` : le mot « authentification
  multifacteur » doit rester présent dans le texte FR de `BrokerLogin` (le test cherche cette chaîne
  exacte dans `messagesText("fr", "BrokerLogin")`) ; la copie ci-dessus l'a reformulée en
  « authentification à deux facteurs (2FA) », à corriger pour conserver le mot « multifacteur » tel
  quel, par exemple : « La connexion à l'espace courtier exige une authentification multifacteur
  (MFA), en plus de votre identifiant et de votre mot de passe. » Le même test vérifie aussi que la
  page ne contient jamais les littéraux `"/broker/` ni `"/admin/`.
- Précision ajoutée par rapport à l'existant : la phrase « Elle n'est pas accessible depuis le site
  public » et la phrase sur la non-réinitialisation de mot de passe par ce canal sont nouvelles, pour
  couper court à toute tentative de saisie d'identifiants sur le site public (constitution, principe
  III : séparation applicative stricte).

---

## Annuaire des courtiers par pays

- Route FR / EN : `/pays/{countryCode}/courtiers` / `/countries/{countryCode}/brokers`
- Objectif prioritaire (une phrase) : lister les courtiers partenaires autorisés d'un pays et
  expliquer pourquoi chacun y figure, avant que le visiteur ne choisisse un produit.
- Appel à l'action principal / secondaire : Voir la fiche du courtier / Retour au pays
- Namespace i18n existant : `Directory.brokers`
- Statut : réécriture (ajout de la validité de licence sur la carte de liste)

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : {nom du pays}, dans le fil d'ariane du pays
   - Titre : Courtiers partenaires pour {countryCode}
   - Sous-titre : Un courtier partenaire détient une licence valide pour ce pays, est responsable de
     la confirmation du devis et des conditions, et est l'entité à laquelle votre demande est
     transmise.
   - Boutons : aucun
   - États : aucun

2. Liste des courtiers — composant : `BrokerBlock` (variante carte) × N
   - Anatomie de chaque carte, dans cet ordre :
     - Nom commercial (`displayName`)
     - Badge « Agréé »
     - Numéro de licence : {licenceNumber}
     - Autorité de délivrance : {issuingAuthority}
     - Ville : {city}, si connue
     - Validité de la licence : « Licence valable jusqu'au {date} », si la date est connue
     - Produits couverts : liste de badges ou de puces
   - Bouton par carte : Voir la fiche du courtier
   - Données affichées (source) : `listCountryPartners(countryCode)` pour les courtiers,
     `listPublicProducts(countryCode)` pour traduire les clés produit en noms lisibles
   - Explication affichée au-dessus de la liste : « Un courtier partenaire détient une licence valide
     pour ce pays [...] » (voir en-tête). C'est cette phrase qui répond à « pourquoi ce courtier
     apparaît-il ici ? » : licence active, vérifiée, pour ce pays.
   - États :
     - Chargement : géré côté serveur (rendu Next.js), pas d'état de chargement visible côté client
     - Vide (aucun courtier publié) : « Aucun courtier partenaire publié » / « Aucun courtier
       partenaire n'est publiquement référencé pour ce pays pour le moment. » avec bouton « Retour au
       pays {countryCode} »
     - Erreur (API indisponible) : « Annuaire des courtiers indisponible » / « Le service public est
       temporairement indisponible. Réessayez dans quelques minutes. » avec le même bouton de retour

### Notes d'implémentation

- La validité de licence n'apparaît aujourd'hui que sur la fiche détaillée du courtier
  (`apps/public/app/[locale]/countries/[countryCode]/brokers/[partnerId]/page.tsx:122-127`), pas sur
  la carte de liste (`.../brokers/page.tsx:117-146`, composant `BrokerBlock` en
  `apps/public/app/components/ui/broker-block.tsx:13-23`). La donnée existe déjà dans le contrat
  (`publicPartnerSummarySchema.licenseExpiresAt`,
  `packages/shared/contracts/public-site.contracts.ts:88`) : ajouter une prop optionnelle de validité
  à `BrokerBlock` et la brancher sur la page de liste plutôt que d'inventer un nouvel appel API.
- `apps/public/messages/fr.json:1033-1050` (`Directory.brokers`) fournit déjà l'essentiel de ce
  texte ; seule la légende de validité sur la carte de liste est un ajout de contenu.

---

## Fiche courtier

- Route FR / EN : `/pays/{countryCode}/courtiers/{partnerId}` /
  `/countries/{countryCode}/brokers/{partnerId}`
- Objectif prioritaire (une phrase) : donner au visiteur tout ce qu'il doit savoir sur un courtier
  précis avant d'être mis en relation avec lui, ou lui montrer une page 404 honnête s'il n'existe pas.
- Appel à l'action principal / secondaire : Voir la fiche produit / Retour aux courtiers du pays
- Namespace i18n existant : `Directory.broker`
- Statut : réécriture

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : Courtiers partenaires (fil d'ariane)
   - Titre : {displayName}
   - Sous-titre : Offre indicative, prix indicatif à confirmer par le courtier partenaire.
   - Boutons : aucun
   - États : aucun

2. Bloc identité — composant : `BrokerBlock` (variante complète)
   - Anatomie : nom commercial, badge « Agréé », numéro de licence, autorité de délivrance, ville si
     connue, puis en dessous : « Licence valable jusqu'au {date} »
   - Données affichées (source) : `getCountryPartner(countryCode, partnerId)`
   - États : aucun

3. Bloc « À savoir » — composant : texte + `Notice`
   - Titre : À savoir
   - Corps / microcopie : texte de présentation du courtier fourni par l'API (`disclaimer`), affiché
     tel quel, jamais réécrit ni complété.
   - Bandeau : « Offre indicative, prix indicatif à confirmer par le courtier partenaire. »
   - Données affichées (source) : `partner.data.disclaimer`
   - États : aucun

4. Produits couverts — composant : liste de boutons
   - Titre : Produits couverts
   - Corps / microcopie : un bouton par produit, menant à la fiche produit du pays
   - Données affichées (source) : `partner.data.products`
   - États : bloc masqué si aucun produit couvert

5. Retour — composant : `Button` tertiaire
   - Corps / microcopie : Retour aux courtiers de {countryCode}
   - États : aucun

6. 404 — composant partagé `NotFound`
   - Corps / microcopie : réutilise le composant partagé du site (« Page introuvable » / « Cette page
     n'existe pas ou n'est plus publiée. Vous pouvez repartir des pays ouverts ou comparer des offres
     indicatives. »), déclenché quand `getCountryPartner` ne renvoie pas de fiche complète pour
     `partnerId`.
   - Données affichées (source) : aucune donnée du courtier recherché n'est révélée (pas de message
     du type « ce courtier n'existe pas », pour éviter toute énumération d'identifiants)
   - États : aucun

### Notes d'implémentation

- Le contenu de « À savoir » vient du champ `disclaimer` renvoyé par l'API
  (`apps/public/app/[locale]/countries/[countryCode]/brokers/[partnerId]/page.tsx:69,131-136`) : ce
  n'est pas un texte éditorial fixe, il varie par courtier et par pays et n'est donc jamais réécrit
  dans ce document.
- Le 404 est celui de `apps/public/app/[locale]/not-found.tsx`, partagé par tout le site (déclenché
  par `notFound()` en `.../brokers/[partnerId]/page.tsx:65`). Aucun texte spécifique « courtier
  introuvable » n'existe aujourd'hui ; ce document ne recommande pas d'en créer un pour rester
  cohérent avec le reste du site, sauf décision contraire de l'équipe produit.
- Aucune information sensible (téléphone, e-mail, WhatsApp, formule, capacité) n'est sélectionnée
  côté page même si l'API venait à en renvoyer davantage (allow-list explicite,
  `.../[partnerId]/page.tsx:67-69`) : à conserver tel quel.

---

## Annuaire des assureurs par pays

- Route FR / EN : `/pays/{countryCode}/assureurs` / `/countries/{countryCode}/insurers`
- Objectif prioritaire (une phrase) : lister les assureurs dont des offres indicatives sont visibles
  dans un pays, en distinguant clairement leur rôle de celui du courtier partenaire.
- Appel à l'action principal / secondaire : Voir les offres / Retour au pays
- Namespace i18n existant : `Directory.insurers`
- Statut : réécriture

### Structure (dans l'ordre)

1. En-tête — composant : `Hero`
   - Kicker : {nom du pays}
   - Titre : Assureurs référencés pour {countryCode}
   - Sous-titre : L'assureur porte le risque ; le courtier partenaire gère la relation avec vous. Les
     offres affichées ici restent indicatives.
   - Boutons : aucun
   - États : aucun

2. Liste des assureurs — composant : bloc `am-j-insurer`
   - Anatomie de chaque ligne :
     - Initiales de l'assureur (avatar textuel)
     - Nom de l'assureur
     - Nombre d'offres publiques visibles : « {count} offre publique visible » /
       « {count} offres publiques visibles »
     - Produits concernés : un bouton « Voir les offres {nom du produit} » par produit reconnu, ou un
       badge neutre si la clé produit n'est pas reconnue
   - Données affichées (source) : `listCountryInsurers(countryCode)`, `listPublicProducts(countryCode)`
   - États :
     - Vide : « Aucun assureur publié » / « Aucun assureur n'est publiquement référencé pour ce pays
       pour le moment. » avec bouton « Retour au pays {countryCode} »
     - Erreur : « Annuaire des assureurs indisponible » / « Le service public est temporairement
       indisponible. Réessayez dans quelques minutes. » avec le même bouton de retour

### Notes d'implémentation

- Aucun changement structurel proposé : le contenu de
  `apps/public/app/[locale]/countries/[countryCode]/insurers/page.tsx` et de
  `Directory.insurers` (`apps/public/messages/fr.json:1061-1080`) respecte déjà la charte (répartition
  claire assureur/courtier, offres qualifiées d'« indicatives », aucun chiffre inventé).
- Aucun marqueur `[à confirmer]` sur cette page.

---

## Récapitulatif des marqueurs

- `[à confirmer]` : 13 occurrences (pause de réception, exclusivité, conservation des données, motif
  du refus 422, SLA Enterprise, périmètre IA Enterprise, facturation d'un lead refusé, changement de
  formule, durée d'engagement minimale ×2 en réalité regroupées dans la FAQ facturation, délai
  indicatif de l'étude de candidature).
- `[à vérifier juridiquement]` : 1 occurrence (autorités de tutelle reconnues par pays).
- `[exemple]` : 7 occurrences, toutes dans la fiche de lead illustrative de la page « Devenir
  partenaire ».

## Décisions produit prises ou manquantes

- Décision prise dans ce document : le nombre de points « Ce qu'AssurMatch attend d'un partenaire »
  passe de 3 à 4 pour refléter fidèlement le brief (licence, discipline de réponse, honnêteté sur les
  prix, respect du consentement) ; nécessite une 4ᵉ icône côté implémentation (`scale`, déjà présente
  dans le set d'icônes).
- Décision prise dans ce document : le récapitulatif de candidature (« review before sending ») est
  intégré à l'étape 4 plutôt que d'être une 5ᵉ étape, pour rester cohérent avec les 4 étapes nommées
  par la décision D-Candidature (société, contact, agrément et capacité, formule et consentement).
- Manque produit : la page de confirmation de candidature n'a pas de mécanisme défini pour transmettre
  la référence sans JavaScript (repli formulaire classique) ; ce document suppose un paramètre de
  requête, à confirmer avec l'équipe technique lors de l'implémentation.
- Manque produit : aucune page ou composant n'existe aujourd'hui pour une FAQ en accordéon sur les
  pages courtiers ; à confirmer avec le design system avant l'implémentation.
