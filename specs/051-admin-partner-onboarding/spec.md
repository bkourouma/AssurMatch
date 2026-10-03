# Feature Specification: Onboarding et cycle de vie des courtiers partenaires (admin)

**Feature Branch**: `claude/inspiring-maxwell-58e67d` (branche de session imposée ; pas de branche `051-*` créée)
**Created**: 2026-10-02
**Status**: Validated by user on 2026-10-02
**Input**: PRD v0.3 (`docs/prd/prd_v0.3_completion_mise_en_production.md`), EPIC A (A-01 à A-10, A-12) et scénario SC-02 « Onboarder un courtier ». Décisions produit du 2026-10-02 : D-6 (Actif test : aucun lead réel) ; suspension en lecture seule et résiliation qui bloque la connexion ; contrat signé hors plateforme et enregistré par l'admin ; preuve d'agrément acceptée obligatoire.
**Validation State**: Validated by user
**Continuous Workflow Eligible**: Yes. Validée par l'utilisateur le 2026-10-02, aucun marqueur `[NEEDS CLARIFICATION]`.

## Why this spec exists

Le scénario de bout en bout échoue dès sa première étape : **l'admin ne peut pas créer de courtier**. L'audit du 2026-10-02 a établi les points suivants.

- **Logique non exposée.** La logique de création et de modification des courtiers, de leurs licences et de leurs documents d'agrément existe. Aucune route ne l'expose (`AdminPartnersController`, `PartnerLicensesController` et `DocumentsController` ne sont pas câblés). La page admin `/partners` n'affiche qu'un tableau de SLA.
- **Candidatures.** Les candidatures reçues sur `/courtiers/candidature` sont seulement listables par API. Aucun écran ne les montre, et rien ne permet de les accepter, de les refuser ou de les convertir en courtier.
- **Invitation du propriétaire.** Elle passe par un champ UUID libre, et le système ne vérifie pas que le courtier existe.
- **Statuts.** Les statuts courtier (`draft`, `pending_compliance`, `active`, `suspended`, `retired`) ne correspondent pas au PRD §22. Rien n'empêche de passer un courtier « actif » sans licence validée, sans couverture ni utilisateur.
- **Licences.** Elles ne peuvent être ni suspendues, ni révoquées, ni renouvelées, et n'ont pas d'historique.
- **Documents d'agrément.** Ils sont gardés en mémoire : la condition « document accepté » de l'éligibilité est fausse après chaque redémarrage.
- **Couverture.** Les autorisations par pays et par produit ne peuvent pas être retirées.
- **Suspension.** Suspendre un courtier ne change rien à l'accès de ses utilisateurs.

Cette spec rend tout le cycle de vie d'un courtier administrable : création ou conversion d'une candidature, vérification de conformité, activation, suspension, résiliation. C'est la condition de l'ouverture publique d'un pays : la checklist exige au moins un courtier actif et licencié.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Inchangé. AssurMatch vérifie les courtiers agréés avant de leur transmettre des demandes (principe II). Elle ne se présente pas comme courtier.
- **Impacted application(s)**:
  - Back-office Plateforme (admin) ;
  - Broker Back-office (lecture seule d'un courtier suspendu, connexion refusée après résiliation) ;
  - Backend API ;
  - packages partagés ;
  - base de données (statuts, historique des licences, documents persistés, contrat) ;
  - notifications e-mail (décision sur une candidature, invitation) ;
  - Web Publique Client : uniquement l'exclusion des courtiers non « actif public » de l'annuaire et des statistiques, déjà en place.
- **Affected scopes**: Courtiers (PartnerTenant), licences, documents d'agrément, autorisations par pays et produit, candidatures, utilisateurs courtiers, plans, quotas, capacité, SLA. Rôles Super Admin, Admin Pays, Compliance Admin, Support Admin (lecture) et rôles courtiers.
- **Frontend separation**: Les écrans de gestion sont dans l'app admin. Le portail courtier ne reçoit qu'un mode lecture seule et un refus de connexion. Le site public n'est pas modifié.
- **Required feature flags**: `country_broker_onboarding_enabled` (flag pays existant) conditionne la conversion d'une candidature et l'activation d'un courtier dans ce pays. Aucun flag sensible n'est touché.
- **Consent and transmission**: Inchangé pour les visiteurs. Le candidat a déjà consenti au traitement de sa candidature (spec 045). L'e-mail de décision ne contient aucune donnée qu'il n'a pas fournie.
- **Partner license controls**: Cœur de la spec.
  - Licence validée par la conformité, avec un document d'agrément accepté.
  - Blocage automatique à l'expiration, à la suspension ou à la révocation.
  - Statut « Expiré » visible.
  - Historique de chaque changement de statut d'une licence.
  - Aucune activation sans licence valide.
- **Audit and data history**: AuditLog (avant/après, motif, acteur) sur chaque création, modification, transition de statut, décision, téléversement, consultation de document, invitation et autorisation. Historique horodaté des statuts du courtier et des licences. `createdAt`, `updatedAt` et `createdBy` partout.
- **Security and RBAC**: MFA obligatoire. Un motif est exigé pour chaque mutation.
  - **Super Admin** : tout.
  - **Admin Pays** : création et préparation des courtiers de son pays (couverture limitée à son périmètre). Pas de validation de licence, pas d'activation.
  - **Compliance Admin** : validation, suspension et révocation des licences ; acceptation des documents ; activation, suspension et résiliation des courtiers ; décision sur les candidatures.
  - **Support Admin** : lecture.

  Les documents d'agrément ne sont consultables que par les rôles admin autorisés, et chaque consultation est auditée. Les coordonnées complètes du candidat ne sont visibles que des rôles qui décident.
- **Routing impact**: Seul un courtier « Actif public » peut recevoir des leads réels. Il doit aussi avoir une licence valide sur le pays et le produit, un document d'agrément accepté, une autorisation active pour le pays et le produit, et une capacité ou un quota disponibles.
  - Un courtier « Actif test » ne reçoit aucun lead réel (D-6).
  - Une suspension ou une résiliation l'exclut immédiatement des nouveaux routages.
  - Les leads déjà affectés ne sont pas réaffectés automatiquement : la réaffectation reste une action humaine.
- **AI impact**: N/A.
- **UX/content restrictions**: Aucune formulation interdite. L'e-mail de décision rappelle que l'acceptation porte sur un partenariat technique et ne vaut pas agrément.
- **Workflow continuity**: Feature standard. Une fois la spec validée par l'utilisateur, le workflow peut enchaîner plan, tâches, implémentation et validations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Créer et préparer un courtier (Priority: P1)

Un Admin Pays ou un Super Admin crée un courtier : raison sociale, nom commercial, pays, ville, RCCM, contacts administratifs et commerciaux, assureurs partenaires, plan, quota mensuel, capacité, SLA attendu. Le courtier démarre en statut « Prospect ». L'admin le complète, puis le passe « En vérification ».

**Why this priority**: Première étape de SC-02. Sans fiche courtier, rien d'autre n'est possible.

**Independent Test**: Créer « Courtier Test CI » et le passer « En vérification ». La fiche est visible dans l'annuaire admin avec son historique, et le courtier reste inéligible au routage.

**Acceptance Scenarios**:

1. **Given** un Super Admin connecté avec MFA, **When** il crée un courtier avec un motif, **Then** le courtier est créé en statut « Prospect », et un AuditLog est enregistré.
2. **Given** un Admin Pays limité à la CI, **When** il crée un courtier pour le Sénégal, **Then** l'action est refusée et auditée.
3. **Given** deux courtiers avec le même RCCM dans le même pays, **When** l'admin crée le second, **Then** la création est refusée comme doublon.
4. **Given** un courtier, **When** l'admin modifie son plan, son quota ou son SLA attendu, **Then** la modification est historisée avant/après, et le nouveau quota s'applique aux prochains routages.

---

### User Story 2 - Licences et documents d'agrément (Priority: P1)

L'admin saisit une licence : numéro, autorité, pays, produits couverts, dates d'effet et d'expiration. Il téléverse la preuve d'agrément (PDF ou image), qui est analysée par l'antivirus et stockée durablement. Un Compliance Admin accepte ou refuse le document, puis valide la licence. Il peut ensuite la suspendre, la révoquer ou enregistrer son renouvellement.

**Why this priority**: Aucun courtier ne peut être activé ni routé sans licence valide (principes II et VII).

**Independent Test**: Saisir une licence, téléverser un PDF, faire accepter le document puis valider la licence par un Compliance Admin. La licence apparaît « Valide » avec son historique. Un fichier test EICAR est mis en quarantaine.

**Acceptance Scenarios**:

1. **Given** une licence brouillon sans document accepté, **When** un Compliance Admin tente de la valider, **Then** la validation est refusée : « preuve d'agrément acceptée requise ».
2. **Given** une licence dont la date d'expiration est passée, **When** on tente de la valider, **Then** c'est refusé.
3. **Given** un Admin Pays, **When** il tente de valider une licence ou d'accepter un document, **Then** c'est refusé et audité.
4. **Given** un fichier infecté, **When** il est téléversé, **Then** il est mis en quarantaine, jamais servi, et ne peut pas être accepté.
5. **Given** un type de fichier non autorisé ou un fichier trop volumineux, **When** il est téléversé, **Then** il est refusé avant stockage.
6. **Given** une licence valide, **When** un Compliance Admin la suspend ou la révoque avec un motif, **Then** le courtier devient inéligible pour ce pays et ces produits à la décision de routage suivante, et l'historique le montre.
7. **Given** une licence qui arrive à expiration, **When** une nouvelle licence de renouvellement est validée, **Then** l'ancienne est marquée « remplacée », et l'éligibilité continue sans interruption.
8. **Given** un document d'agrément, **When** un admin le consulte, **Then** la consultation est auditée. Un utilisateur sans droit reçoit un refus.

---

### User Story 3 - Couverture pays et produits (Priority: P1)

L'admin autorise le courtier pour un pays et des produits, ou retire une autorisation avec un motif.

**Why this priority**: Le routage et la checklist d'activation exigent une autorisation active pour le pays et le produit.

**Independent Test**: Autoriser le courtier pour CI × Auto, puis retirer Auto : il disparaît des candidats au routage CI × Auto.

**Acceptance Scenarios**:

1. **Given** un courtier, **When** l'admin l'autorise pour un pays où il n'a aucune licence (brouillon ou valide), **Then** l'autorisation est refusée.
2. **Given** une autorisation active, **When** l'admin la retire avec un motif, **Then** elle est retirée immédiatement, sans toucher aux leads déjà affectés, et c'est audité.
3. **Given** un Admin Pays limité à la CI, **When** il autorise un courtier pour le Sénégal, **Then** c'est refusé.

---

### User Story 4 - Activer, suspendre, résilier (Priority: P1)

Un Compliance Admin fait passer le courtier par ses statuts. « En vérification » mène à « Actif test » ou « Actif public », avec ces conditions d'activation :

- au moins une licence valide avec un document accepté ;
- au moins une autorisation de pays et une de produit actives, couvertes par la licence ;
- un utilisateur propriétaire invité ou actif ;
- un contrat de partenariat enregistré (version, date de signature, PDF signé) ;
- le flag `country_broker_onboarding_enabled` activé pour le pays.

Il peut suspendre le courtier (effet immédiat, motif obligatoire), le réactiver si les conditions sont toujours remplies, ou le résilier (statut terminal).

**Why this priority**: L'activation conditionne le routage. La suspension rapide est une exigence constitutionnelle (principe II).

**Independent Test**: Tenter d'activer un courtier sans contrat : refus listant le blocage. Ajouter le contrat, activer en « Actif public » : il devient candidat au routage. Le suspendre : il n'est plus candidat, et ses utilisateurs ne voient plus leur portail qu'en lecture seule.

**Acceptance Scenarios**:

1. **Given** un courtier sans licence valide, sans document accepté, sans couverture, sans propriétaire ou sans contrat, **When** un Compliance Admin tente l'activation, **Then** elle est refusée, et chaque condition manquante est listée.
2. **Given** un Admin Pays, **When** il tente d'activer un courtier, **Then** c'est refusé (activation réservée à la conformité).
3. **Given** un courtier « Actif test », **When** un visiteur soumet une demande réelle, **Then** ce courtier n'est jamais candidat. Il n'apparaît ni dans l'annuaire public ni dans les statistiques publiques.
4. **Given** un courtier « Actif public », **When** un Compliance Admin le suspend avec un motif, **Then** il est exclu des nouveaux routages et des offres publiques en moins d'une minute. Ses utilisateurs gardent l'accès en lecture seule à leurs leads, mais toute action (accepter, rejeter, changer un statut, noter, répondre) est refusée.
5. **Given** un courtier résilié, **When** l'un de ses utilisateurs tente de se connecter, **Then** la connexion est refusée avec un message neutre. Ses sessions existantes sont révoquées.
6. **Given** un courtier dont toutes les licences valides ont expiré, **Then** il est affiché « Expiré », il est inéligible au routage, et une alerte de conformité est disponible.
7. **Given** un courtier suspendu, **When** il est réactivé alors qu'une condition n'est plus remplie (par exemple une licence expirée), **Then** la réactivation est refusée.

---

### User Story 5 - Instruire et convertir une candidature (Priority: P1)

Un admin voit les candidatures reçues (liste filtrable par pays et statut) et leur détail : société, licence déclarée, produits, capacité, contact, plan souhaité. Il les passe « En vérification ». Un Compliance Admin les refuse (motif choisi dans une liste) ou les accepte. L'acceptation crée un courtier « Prospect » prérempli et une licence brouillon avec les données déclarées. La candidature passe « Convertie », et le candidat reçoit un e-mail de décision.

**Why this priority**: C'est le canal d'acquisition prévu par le site public (spec 045). Aujourd'hui, les candidatures n'aboutissent à rien.

**Independent Test**: Soumettre une candidature `PA-…`, la convertir. Le courtier créé reprend les données, la candidature référence le courtier, et l'e-mail de décision arrive dans Mailpit.

**Acceptance Scenarios**:

1. **Given** une candidature reçue, **When** un Compliance Admin la convertit, **Then** un courtier « Prospect » et une licence brouillon sont créés à partir des données déclarées. La candidature passe « Convertie » avec la référence du courtier, et c'est audité.
2. **Given** une candidature déjà convertie ou refusée, **When** on tente une nouvelle décision, **Then** c'est refusé.
3. **Given** un pays dont `country_broker_onboarding_enabled` est désactivé, **When** on tente de convertir une candidature de ce pays, **Then** c'est refusé avec ce motif.
4. **Given** une candidature refusée, **Then** le candidat reçoit un e-mail neutre. Cet e-mail porte la référence `PA-…`, ne reprend pas la note interne, et précise qu'il ne constitue pas un avis sur son agrément.
5. **Given** un Admin Pays limité à la CI, **Then** il ne voit que les candidatures de la CI.

---

### User Story 6 - Inviter le propriétaire et l'équipe initiale (Priority: P1)

Depuis la fiche courtier, l'admin invite le propriétaire du compte (rôle Owner Starter ou Pro selon le plan) et, au besoin, d'autres utilisateurs du courtier. L'invité reçoit l'e-mail d'activation existant. Le formulaire général de création d'utilisateur refuse un rattachement à un courtier inexistant, ainsi qu'un rôle courtier sans courtier.

**Why this priority**: Un courtier sans utilisateur ne peut pas recevoir ni traiter de leads. C'est une condition d'activation.

**Independent Test**: Depuis la fiche courtier, inviter `owner@courtier.ci` en Owner Pro. L'e-mail d'activation arrive, l'utilisateur est rattaché au courtier, et la condition « propriétaire » de l'activation passe.

**Acceptance Scenarios**:

1. **Given** une fiche courtier, **When** l'admin invite un propriétaire, **Then** l'utilisateur est créé avec le rôle propriétaire correspondant au plan et rattaché au courtier, et l'e-mail d'activation part.
2. **Given** la création d'un utilisateur avec un identifiant de courtier inexistant, **Then** c'est refusé.
3. **Given** la création d'un utilisateur avec un rôle courtier sans courtier, ou d'un rôle admin rattaché à un courtier, **Then** c'est refusé.
4. **Given** un courtier résilié, **When** on tente d'y inviter un utilisateur, **Then** c'est refusé.

---

### User Story 7 - Annuaire et fiche courtier (Priority: P2)

L'admin consulte l'annuaire des courtiers (filtres par statut, pays, plan, licence bientôt expirée). La fiche détaillée affiche :

- identité ;
- statut et historique ;
- licences, documents et contrat ;
- couverture ;
- utilisateurs ;
- SLA mesuré ;
- conditions d'activation (vert ou rouge) ;
- journal d'audit filtré sur ce courtier.

**Why this priority**: Exploitation quotidienne et pilotage de conformité. Ne bloque pas l'activation d'un premier courtier.

**Independent Test**: Filtrer l'annuaire sur « licence expirant sous 30 jours » : seuls les courtiers concernés apparaissent.

**Acceptance Scenarios**:

1. **Given** un Support Admin, **When** il ouvre l'annuaire et une fiche, **Then** il lit tout, sauf le contenu des documents d'agrément et les coordonnées complètes des candidats, et aucune action ne lui est proposée.
2. **Given** un courtier, **Then** la fiche liste ses conditions d'activation, chacune avec un lien vers l'action qui la corrige.

### Edge Cases

- **Pays désactivé ou en liste d'attente** : conversion et activation refusées tant que `country_broker_onboarding_enabled` est désactivé. Un pays non public n'empêche pas de préparer un courtier.
- **Produit désactivé** : l'autorisation produit reste possible ; le routage reste conditionné par les flags produit.
- **Consentement** : sans objet pour le visiteur. Le consentement de la candidature est conservé (version déjà stockée).
- **Courtier inactif, non autorisé ou sans quota** : jamais candidat au routage. Un refus de routage pour un courtier non éligible reste journalisé (existant).
- **Licence expirée, suspendue, invalide ou révoquée** : inéligibilité immédiate, alerte de conformité, statut « Expiré » si plus aucune licence n'est valide.
- **Offres** : quand un courtier n'est plus « Actif public », ses offres ne sont plus affichées publiquement (règle d'éligibilité existante).
- **IA** : sans objet.
- **Permissions** : accès hors périmètre pays, Admin Pays qui valide ou active, Support Admin qui écrit, utilisateur courtier qui tente une action admin : tout est refusé et audité. Aucun export n'est ajouté.
- **Séparation des applications** : aucune route de cette spec n'est servie par le site public.
- **Entrées** : fichiers malveillants (antivirus), types MIME falsifiés (vérification des octets de signature), doublons de RCCM, modifications concurrentes (refus de la seconde écriture).
- **Suspension pendant le traitement d'un lead** : le lead reste visible en lecture seule ; aucune réaffectation automatique ; l'admin peut réaffecter manuellement.
- **Stockage non durable** : en préproduction et en production, sans stockage durable configuré, le téléversement est refusé (même règle que les documents de devis).

## Requirements *(mandatory)*

### Functional Requirements

**Courtier**
- **FR-001**: Le back-office MUST permettre de créer, consulter, lister et modifier un courtier :
  - raison sociale, nom commercial, pays principal, ville, RCCM ;
  - contacts administratif et commercial (nom, e-mail, téléphone) ;
  - assureurs partenaires (liste de noms) ;
  - plan, quota mensuel de leads, capacité, SLA attendu (minutes avant première action).
- **FR-002**: Le système MUST refuser un doublon de RCCM dans un même pays.
- **FR-003**: Le système MUST gérer les statuts du PRD §22 : Prospect, En vérification, Actif test, Actif public, Suspendu, Expiré, Résilié. Transitions autorisées :
  - Prospect → En vérification ;
  - En vérification → Actif test ou Actif public ;
  - Actif test ↔ Actif public ;
  - un statut actif → Suspendu → l'ancien statut actif (réactivation) ;
  - un statut actif → Expiré (automatique) ;
  - Expiré → l'ancien statut actif, après renouvellement ;
  - tout statut → Résilié (terminal).

  Chaque transition est motivée, horodatée et historisée.
- **FR-004**: L'activation (vers Actif test ou Actif public, ou une réactivation) MUST être refusée tant qu'une condition manque, et MUST lister chaque condition non remplie :
  - au moins une licence valide, non expirée, avec au moins un document d'agrément accepté ;
  - au moins une autorisation de pays et une autorisation de produit actives, couvertes par une licence valide ;
  - au moins un utilisateur propriétaire invité ou actif ;
  - un contrat de partenariat enregistré ;
  - le flag `country_broker_onboarding_enabled` activé pour le pays principal.
- **FR-005**: Activation, suspension, réactivation et résiliation MUST être réservées à un Compliance Admin ou à un Super Admin.
- **FR-006**: Un courtier dont aucune licence n'est valide et non expirée MUST être considéré comme « Expiré » pour l'affichage et l'éligibilité, sans tâche planifiée.

**Licences et documents**
- **FR-007**: Le back-office MUST permettre de saisir une licence (numéro, autorité, pays, produits couverts ou tous, dates d'effet et d'expiration) et d'enregistrer un renouvellement qui référence la licence précédente.
- **FR-008**: Le système MUST permettre de téléverser un document d'agrément (types autorisés : PDF, JPEG, PNG ; taille maximale identique aux documents de devis) avec :
  - vérification des octets de signature ;
  - empreinte du contenu ;
  - analyse antivirus et quarantaine en cas d'infection ;
  - stockage durable obligatoire hors environnement local et de test ;
  - conservation selon la politique de rétention.
- **FR-009**: Un Compliance Admin MUST pouvoir accepter ou refuser un document analysé et sain, et MUST pouvoir valider, suspendre ou révoquer une licence, avec un motif.
- **FR-010**: La validation d'une licence MUST être refusée sans document accepté rattaché à cette licence, ou si sa date d'expiration est passée.
- **FR-011**: Chaque changement de statut d'une licence MUST être historisé : ancien statut, nouveau statut, acteur, date, motif.
- **FR-012**: La consultation ou le téléchargement d'un document d'agrément MUST être réservé aux rôles autorisés, MUST être audité, et MUST être refusé pour un fichier en quarantaine.

**Couverture**
- **FR-013**: Le back-office MUST permettre d'autoriser un courtier pour un pays (licence existante requise pour ce pays) et pour un produit, et de retirer une autorisation avec un motif, avec effet immédiat.

**Candidatures**
- **FR-014**: Le back-office MUST lister les candidatures (filtres par pays et statut, périmètre pays respecté) et afficher leur détail.
- **FR-015**: Le système MUST gérer les statuts de candidature : Reçue → En vérification → Acceptée-convertie ou Refusée. Une décision est définitive.
- **FR-016**: La conversion MUST créer un courtier « Prospect » et une licence brouillon à partir des données déclarées, rattacher la candidature au courtier, et être refusée si `country_broker_onboarding_enabled` est désactivé pour le pays.
- **FR-017**: Chaque décision MUST déclencher un e-mail au candidat, dans la langue de sa candidature. Cet e-mail porte la référence `PA-…`, ne reprend aucune note interne ni donnée non fournie par le candidat, et précise qu'une acceptation est un partenariat technique, pas un agrément. Un échec d'envoi est audité et ne bloque pas la décision.

**Utilisateurs**
- **FR-018**: Le back-office MUST permettre d'inviter, depuis la fiche courtier, un propriétaire (rôle selon le plan) et d'autres utilisateurs avec un rôle courtier. L'invitation passe par le parcours d'activation existant.
- **FR-019**: La création d'un utilisateur MUST être refusée :
  - si l'identifiant de courtier n'existe pas ;
  - si un rôle courtier est demandé sans courtier ;
  - si un rôle admin est rattaché à un courtier ;
  - si le courtier est résilié.

**Effets de la suspension et de la résiliation**
- **FR-020**: Le routage, les offres publiques, l'annuaire et les statistiques publiques MUST ne retenir que les courtiers « Actif public ». Un courtier « Actif test » ne reçoit aucun lead réel.
- **FR-021**: Les utilisateurs d'un courtier suspendu MUST conserver un accès en lecture seule au portail courtier. Toute action de traitement de lead (accepter, rejeter, contester, changer un statut, noter, créer une tâche, un rappel ou une proposition, assigner) MUST être refusée, et le portail MUST afficher que le compte est suspendu.
- **FR-022**: La connexion des utilisateurs d'un courtier résilié MUST être refusée avec un message neutre, et leurs sessions existantes MUST être invalidées.

**Contrat**
- **FR-023**: Le back-office MUST permettre d'enregistrer le contrat de partenariat : version, date de signature, signataire, PDF signé (même contrôle de fichier que FR-008). L'historique des versions est conservé.

**Transverses**
- **FR-024**: Chaque mutation et chaque refus MUST produire un AuditLog (acteur, action, cible, avant/après, motif, résultat).
- **FR-025**: RBAC et MFA MUST être vérifiés sur chaque route ; l'Admin Pays est limité à son périmètre pays.
- **FR-026**: Une modification concurrente d'une même fiche MUST être refusée (rechargement demandé).
- **FR-027**: La checklist d'activation MUST refléter les nouvelles conditions (document accepté, propriétaire, contrat), et le contrôle pays « courtier actif licencié » MUST ne retenir que les courtiers « Actif public ».

### Key Entities *(include if feature involves data)*

- **PartnerTenant** : identité, contacts, assureurs partenaires, pays principal, plan, quota, capacité, SLA attendu, statut (7 valeurs), motif de suspension ou de résiliation, statut précédant la suspension.
- **PartnerStatusHistory** (nouveau) : courtier, ancien statut, nouveau statut, motif, acteur, date.
- **PartnerLicense** : numéro, autorité, pays, produits, dates, statut (brouillon, en revue, valide, suspendue, révoquée, expirée, remplacée), licence renouvelée, validée par.
- **PartnerLicenseHistory** (nouveau) : historique des statuts de licence.
- **AccreditationDocument** : persisté. Type, licence liée, nom de fichier, type MIME, taille, empreinte, clé de stockage, statut d'analyse (en attente, sain, infecté, échec), statut de revue (téléversé, accepté, refusé, remplacé), revu par, rétention.
- **PartnerContract** (nouveau) : courtier, version, date de signature, signataire, document signé, enregistré par.
- **PartnerCountryAuthorization / PartnerProductAuthorization** : statut actif ou retiré, motif et date de retrait.
- **PartnerApplication** : statut (reçue, en vérification, acceptée, refusée), décision, motif de refus (liste fermée), note interne, courtier créé, décidé par et le.
- **User** : rattachement au courtier vérifié ; rôles courtiers.
- **AuditLog** : toutes les actions ci-dessus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un admin et un Compliance Admin onboardent un courtier de bout en bout (candidature → courtier « Actif public » avec propriétaire invité) en moins de 30 minutes, sans commande en base ni script.
- **SC-002**: 0 courtier activable sans licence valide, document accepté, couverture, propriétaire et contrat (un test par condition).
- **SC-003**: 0 lead réel routé vers un courtier qui n'est pas « Actif public » (tests sur Actif test, Suspendu, Expiré, Résilié).
- **SC-004**: Une suspension exclut le courtier des nouveaux routages et des offres publiques en moins d'une minute.
- **SC-005**: 100 % des mutations et refus de cette spec sont retrouvables dans les journaux d'audit avec motif et acteur.
- **SC-006**: 0 fichier infecté servi ou accepté ; 100 % des consultations de documents sont auditées.
- **SC-007**: 0 action de traitement de lead possible par un utilisateur de courtier suspendu ; 0 connexion réussie pour un utilisateur de courtier résilié.
- **SC-008**: 100 % des candidatures décidées reçoivent un e-mail, ou produisent un échec d'envoi audité.

## Assumptions

- Les statuts existants sont repris sans perte : `draft` → Prospect, `pending_compliance` → En vérification, `active` → Actif public, `suspended` → Suspendu, `retired` → Résilié. Les valeurs « Actif test » et « Expiré » sont ajoutées. Les données et seeds existants (courtiers `active`) restent donc « Actif public » sans migration de données.
- Le contrat est signé hors plateforme ; aucune signature électronique (module interdit en V1).
- Le routage de leads de test vers les courtiers « Actif test » (D-6) n'est pas couvert ici. Il sera traité avec les tests de bout en bout (spec 059). Dans cette spec, un courtier « Actif test » ne reçoit simplement aucun lead.
- Les alertes d'expiration à J-60, J-30 et J-7 (A-11) relèvent de la spec 061. L'état « Expiré » et l'alerte de conformité existante suffisent ici.
- Le self-service courtier (profil, dépôt de renouvellement de licence, invitation d'équipe par le courtier) relève de la spec 053.
- Le SLA attendu fixé par l'admin est la cible contractuelle. Le réglage Enterprise existant côté courtier reste une préférence interne et ne peut pas l'assouplir.
- Le stockage et l'antivirus des documents de devis (spec 033) sont réutilisés tels quels.
- Les motifs de refus d'une candidature forment une liste fermée : licence non vérifiable, hors zone couverte, informations incomplètes, capacité insuffisante, autre.
