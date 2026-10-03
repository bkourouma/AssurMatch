# Feature Specification: Self-service du courtier — profil société, licences, équipe et couverture

**Feature Branch**: `worktree-agent-aa45f0d42b24d1c06` (worktree isolé ; pas de branche `053-*` créée)
**Created**: 2026-10-03
**Status**: Validated (délégation du superviseur, 2026-10-03)
**Input**: PRD v0.3 (`docs/prd/prd_v0.3_completion_mise_en_production.md`), EPIC G : G-01 (profil société), G-02 (licences), G-03 (équipe), G-04 (couverture et demande d'extension). G-05 (relevé de facturation) relève de la spec 060 ; G-06 (demande de changement de plan, P2) est hors périmètre.
**Validation State**: Validated. Le superviseur a délégué la spec de bout en bout avec consigne de travailler sans question et de documenter les choix produit en hypothèses.
**Continuous Workflow Eligible**: Yes. Aucun marqueur `[NEEDS CLARIFICATION]` ; les choix produit sont listés dans « Assumptions ».

## Why this spec exists

La spec 051 a rendu le cycle de vie d'un courtier administrable, mais uniquement côté admin. Côté courtier :

- **Compte** : la page `/account` n'affiche que des identifiants techniques (acteur, tenant, plan, rôles). Le courtier ne voit ni sa raison sociale, ni ses contacts, ni son quota, ni son SLA contractuel, ni sa couverture.
- **Licences** : le courtier ne voit pas ses licences ni leur échéance, et ne peut pas déposer de renouvellement. Toute pièce passe par un e-mail à l'admin.
- **Équipe** : `/team` est un placeholder « Module indisponible ». Seul l'admin peut inviter un utilisateur ; personne ne peut désactiver un collaborateur qui quitte le cabinet.
- **Couverture** : le courtier ne sait pas sur quels pays et produits il est autorisé, ni comment demander une extension.

Chaque demande remonte donc à l'équipe AssurMatch par des canaux non tracés. Cette spec donne au courtier la consultation complète de son compte et des actions bornées, sans jamais lui laisser valider lui-même ce qui relève de la conformité.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Inchangé. AssurMatch vérifie les données réglementaires du courtier (identité légale, RCCM, licences) ; le courtier ne fait que les **proposer**. Aucune donnée réglementaire n'est modifiée sans décision admin.
- **Impacted application(s)**:
  - Broker Back-office (`apps/broker`) : pages `/company`, `/licenses`, `/team` (fonctionnelle), navigation ;
  - Back-office Plateforme (`apps/admin`) : section « Demandes du courtier » de la fiche courtier ;
  - Backend API : routes `/broker/account/*`, `/broker/licenses/*`, `/broker/team/*`, `/admin/partner-requests/*` ;
  - packages partagés : contrats, matrice RBAC, codes d'erreur ;
  - base de données : migration `0025_broker_self_service` (une table, deux enums) ;
  - Web Publique Client : **non impacté**.
- **Affected scopes**: PartnerTenant (contacts et présentation), PartnerLicense (renouvellement brouillon), AccreditationDocument (preuve de licence), User (équipe du courtier), autorisations pays et produit (lecture et demande d'extension), nouvelle entité PartnerChangeRequest. Rôles : Owner Starter, Owner Pro, Manager (écriture) ; Agent, Read-only (lecture) ; Super Admin, Compliance Admin, Admin Pays (décision) ; Support Admin (lecture).
- **Frontend separation**: Les écrans courtier vivent dans `apps/broker`, la décision dans `apps/admin`. Le portail courtier ne consomme jamais de route `/admin/*`. Aucune route n'est servie par le site public.
- **Required feature flags**: Aucun nouveau flag. Les flags pays et produit existants continuent de conditionner le routage. Aucun module interdit (paiement, signature électronique, émission) n'est touché.
- **Consent and transmission**: Inchangé. Aucune donnée visiteur n'est lue ni modifiée.
- **Partner license controls**: Cœur de G-02. Le courtier dépose un renouvellement : il crée une licence **brouillon** qui référence la précédente et téléverse la preuve (antivirus, quarantaine, spec 051). La licence passe « En revue » mais n'est **jamais** validée par le courtier : seule la conformité valide (règle FR-010 de la 051 : document accepté et date future). L'ancienne licence reste valide jusqu'à cette validation, puis passe « Remplacée ».
- **Audit and data history**: AuditLog sur chaque lecture sensible refusée, chaque écriture et chaque refus (profil, demandes, renouvellement, téléversement, invitation, désactivation, réactivation, changement de rôle, décision admin). Les demandes conservent valeurs demandées, valeurs précédentes, auteur, décideur, motif et dates.
- **Security and RBAC**:
  - MFA obligatoire (routes protégées existantes) ; un utilisateur invité suit le parcours d'activation existant, MFA imposée au premier login ;
  - le tenant vient toujours de l'acteur, jamais de la requête ; une ressource d'un autre courtier répond 404 ;
  - Owner et Manager écrivent ; Agent et Read-only lisent ; un courtier suspendu est en lecture seule (garde `brokerWriteActor`, inventaire `BROKER_TENANT_WRITE_GUARDED`) ;
  - le rôle propriétaire n'est jamais attribué par le courtier ; personne ne modifie son propre rôle ni ne se désactive ; le dernier propriétaire actif ne peut pas être désactivé ; un Manager n'agit jamais sur un propriétaire ;
  - un utilisateur désactivé perd l'accès à la requête suivante (401), sans attendre l'expiration de son jeton ;
  - décisions admin : `partners:update` dans le périmètre pays (Super Admin, Compliance Admin, Admin Pays) ; Support Admin en lecture.
- **Routing impact**: Aucun changement des règles. Une extension de couverture acceptée passe par `authorizeCountry`/`authorizeProduct` de la 051 (licence requise pour le pays) : l'éligibilité reste décidée par les règles déterministes existantes.
- **AI impact**: N/A.
- **UX/content restrictions**: Aucune formulation interdite. Les écrans précisent qu'une demande est examinée par AssurMatch et qu'une licence déposée n'est pas valide avant la décision de la conformité.
- **Workflow continuity**: Feature standard, enchaînement plan → tâches → implémentation → validations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter et tenir à jour le profil société (Priority: P1)

Le propriétaire ou un manager ouvre « Société ». Il lit l'identité (raison sociale, nom commercial, RCCM, pays, ville), les contacts, les assureurs partenaires, le plan, le quota mensuel, le SLA contractuel, le statut et la couverture. Il modifie directement les contacts administratif et commercial, l'e-mail et le WhatsApp principaux, la ville et les assureurs partenaires. Pour la raison sociale, le nom commercial, le RCCM ou le pays, il soumet une **demande de modification** motivée, que l'admin accepte ou refuse.

**Why this priority**: Première étape du self-service ; sans elle, toute correction de contact passe par l'admin.

**Independent Test**: Un Owner modifie le contact commercial : la fiche admin le montre avec l'AuditLog avant/après. Il demande un changement de raison sociale : la demande apparaît « En attente » dans la fiche admin ; l'admin l'accepte, la raison sociale change et c'est audité.

**Acceptance Scenarios**:

1. **Given** un Owner ou un Manager MFA, **When** il modifie ses contacts, **Then** la fiche est mise à jour et un AuditLog `partner.updated` (avant/après) est écrit avec l'acteur courtier.
2. **Given** un Agent ou un Read-only, **When** il tente une modification ou une demande, **Then** c'est refusé (403) et audité.
3. **Given** une requête de modification directe contenant la raison sociale, le RCCM, le pays, le plan, le quota ou le statut, **When** elle est envoyée, **Then** elle est refusée (400) : ces champs ne sont pas modifiables directement.
4. **Given** une demande de modification d'identité, **When** l'admin l'accepte avec un motif, **Then** les valeurs sont appliquées par le service admin de la 051 (contrôle de doublon RCCM, périmètre pays), la demande passe « Acceptée » et c'est audité. **When** il la refuse, **Then** rien ne change et la demande passe « Refusée » avec le motif.
5. **Given** une demande de modification d'identité déjà en attente, **When** le courtier en soumet une seconde, **Then** c'est refusé (409).
6. **Given** un courtier suspendu, **When** il tente une modification ou une demande, **Then** 403 `PARTNER_SUSPENDED`.

---

### User Story 2 - Licences et dépôt de renouvellement (Priority: P1)

Tout utilisateur du courtier voit ses licences : numéro, autorité, pays, produits, statut effectif, dates, historique des statuts et pièces déposées (sans contenu). Le propriétaire ou un manager dépose un renouvellement : nouvelles données de licence, puis preuve (PDF, JPEG, PNG, 5 Mo). La licence de renouvellement passe « En revue » dès que la preuve est saine. La conformité la valide dans la fiche admin (flux 051).

**Why this priority**: Une licence expirée bloque le routage (principe VII). Le dépôt anticipé évite l'interruption.

**Independent Test**: Déposer un renouvellement et sa preuve depuis le portail : la licence apparaît « En revue » dans la fiche admin, l'ancienne reste « Valide ». La conformité accepte le document puis valide : l'ancienne passe « Remplacée ».

**Acceptance Scenarios**:

1. **Given** une licence valide du courtier, **When** l'Owner dépose un renouvellement, **Then** une licence `draft` qui référence la précédente est créée pour le même pays, et c'est audité.
2. **Given** un renouvellement déjà en cours (brouillon ou en revue) pour cette licence, **When** un second est déposé, **Then** c'est refusé (409).
3. **Given** une licence révoquée ou remplacée, **When** on dépose un renouvellement, **Then** c'est refusé (409).
4. **Given** une licence brouillon, **When** le courtier téléverse une preuve saine, **Then** le document est rattaché à la licence (type `license`) et la licence passe « En revue » ; **When** la preuve est infectée, **Then** elle est mise en quarantaine et la licence reste brouillon.
5. **Given** la licence d'un autre courtier, **When** le courtier tente un renouvellement ou un téléversement, **Then** 404.
6. **Given** un renouvellement en revue, **Then** aucune route courtier ne permet de le valider ; il n'est pas éligible au routage tant que la conformité ne l'a pas validé.
7. **Given** un Agent ou un Read-only, **When** il tente un dépôt, **Then** 403 audité.

---

### User Story 3 - Gérer l'équipe (Priority: P1)

Le propriétaire ou un manager ouvre « Équipe ». Il voit les utilisateurs du courtier (nom, e-mail, rôle, statut, MFA). Il invite un collaborateur avec un rôle Manager, Agent ou Read-only : l'invité reçoit l'e-mail d'activation existant et doit enrôler sa MFA. Il désactive ou réactive un membre, et change le rôle d'un membre non propriétaire.

**Why this priority**: `/team` est un placeholder ; un collaborateur qui quitte le cabinet garde aujourd'hui son accès.

**Independent Test**: L'Owner invite un agent (e-mail dans Mailpit), le désactive : sa requête suivante répond 401 ; il le réactive. Le seul Owner ne peut pas se désactiver.

**Acceptance Scenarios**:

1. **Given** un Owner, **When** il invite `agent@courtier.ci` en Agent, **Then** l'utilisateur est créé « Invité », rattaché au courtier de l'acteur, avec MFA requise, l'e-mail d'activation part et c'est audité. Le jeton d'activation n'est jamais renvoyé au courtier.
2. **Given** une invitation avec un rôle propriétaire ou un rôle admin, **Then** c'est refusé (400).
3. **Given** un membre actif, **When** l'Owner le désactive avec un motif, **Then** son statut passe « Suspendu », sa requête suivante répond 401, et c'est audité ; **When** il le réactive, **Then** il retrouve l'accès.
4. **Given** le dernier propriétaire actif, **When** on tente de le désactiver, **Then** c'est refusé (422 `TEAM_LAST_OWNER`).
5. **Given** un utilisateur, **When** il tente de modifier son propre rôle ou de se désactiver, **Then** c'est refusé (422 `TEAM_SELF_ACTION`).
6. **Given** un Manager, **When** il tente de désactiver ou de changer le rôle d'un propriétaire, **Then** c'est refusé (403).
7. **Given** un membre d'un autre courtier, **When** on agit sur lui, **Then** 404.
8. **Given** un Agent ou un Read-only, **Then** il lit la liste mais toute action est refusée (403).

---

### User Story 4 - Couverture et demande d'extension (Priority: P2)

Le courtier voit ses pays et produits autorisés, avec leur couverture par une licence valide. Il demande une extension (un pays ou un produit) avec une justification. L'admin l'accepte (l'autorisation est créée par le service 051 : licence exigée pour un pays) ou la refuse.

**Why this priority**: P1 dans le PRD, mais l'extension reste rare au lancement (un pays, deux produits).

**Independent Test**: Demander l'extension « Santé » : la demande apparaît dans la fiche admin ; l'admin l'accepte et le produit apparaît autorisé côté courtier.

**Acceptance Scenarios**:

1. **Given** un Owner, **When** il demande l'extension à un produit déjà autorisé, **Then** c'est refusé (409) ; à un produit inexistant, 422.
2. **Given** une demande d'extension pays, **When** l'admin l'accepte sans licence du courtier pour ce pays, **Then** la décision est refusée (422 `LICENSE_REQUIRED_FOR_COUNTRY`) et la demande reste en attente.
3. **Given** un Admin Pays limité à la CI, **When** il décide une demande d'un courtier du Sénégal, **Then** c'est refusé et audité.
4. **Given** une demande déjà décidée, **When** on la décide de nouveau ou qu'on l'annule, **Then** 409.
5. **Given** une demande en attente, **When** son auteur (Owner ou Manager) l'annule, **Then** elle passe « Annulée ».

### Edge Cases

- **Courtier suspendu** : lectures permises ; toute écriture (profil, demandes, renouvellement, preuve, équipe) refusée 403 `PARTNER_SUSPENDED`.
- **Courtier résilié** : 401 sur toutes les routes (garde 051).
- **Licence expirée** : visible « Expirée » ; le renouvellement reste possible (c'est son but).
- **Pays ou produit désactivé** : l'extension peut être demandée ; le routage reste conditionné par les flags.
- **Fichier malveillant ou type non autorisé** : quarantaine ou refus avant stockage (règles 051).
- **Stockage non durable en préproduction ou production** : téléversement refusé (règle 051).
- **E-mail déjà utilisé** : invitation refusée avec un message neutre (409), sans révéler à quel courtier il appartient.
- **Utilisateur invité jamais activé puis désactivé** : la réactivation le remet « Invité ».
- **Décision concurrente** : une demande n'est décidée qu'une fois (409 sur la seconde décision).
- **IA** : sans objet. **Export** : aucun export ajouté.
- **Séparation des applications** : aucune route de cette spec n'est servie par le site public ; le portail courtier n'appelle aucune route admin.

## Requirements *(mandatory)*

### Functional Requirements

**Profil société (G-01)**
- **FR-001**: Le portail courtier MUST afficher à tout utilisateur du courtier : identité, contacts, assureurs partenaires, plan, quota mensuel, SLA contractuel, statut effectif et couverture.
- **FR-002**: Owner et Manager MUST pouvoir modifier directement : contacts administratif et commercial (nom, e-mail, téléphone), e-mail et WhatsApp principaux, ville, assureurs partenaires. Tout autre champ MUST être refusé par la validation.
- **FR-003**: Raison sociale, nom commercial, RCCM et pays MUST passer par une demande de modification motivée ; une seule demande d'identité en attente par courtier.
- **FR-004**: L'admin (`partners:update`, périmètre pays) MUST pouvoir accepter (application via le service admin 051) ou refuser (motif) une demande. Une décision est définitive.

**Licences (G-02)**
- **FR-005**: Le portail MUST lister les licences du courtier avec statut effectif, dates, historique des statuts et pièces déposées (sans clé de stockage ni contenu).
- **FR-006**: Owner et Manager MUST pouvoir déposer un renouvellement (licence `draft` avec `renewsLicenseId`, même pays), refusé pour une licence révoquée ou remplacée et s'il existe déjà un renouvellement en cours.
- **FR-007**: Owner et Manager MUST pouvoir téléverser la preuve d'une licence `draft` ou `pending_review` du courtier, avec les contrôles de fichier de la 051 ; une preuve saine fait passer une licence `draft` en `pending_review`.
- **FR-008**: Aucune route courtier MUST permettre de valider une licence ou d'accepter un document.

**Équipe (G-03)**
- **FR-009**: Le portail MUST lister les utilisateurs du courtier ; Owner et Manager MUST pouvoir inviter (Manager, Agent, Read-only) via le parcours d'activation existant (MFA requise), désactiver, réactiver et changer le rôle d'un membre non propriétaire.
- **FR-010**: Le système MUST refuser : l'attribution d'un rôle propriétaire ou admin ; toute action sur soi-même ; la désactivation du dernier propriétaire actif ; toute action d'un Manager sur un propriétaire.
- **FR-011**: Un utilisateur désactivé MUST recevoir 401 à sa requête protégée suivante.

**Couverture (G-04)**
- **FR-012**: Le portail MUST afficher les pays et produits autorisés et indiquer s'ils sont couverts par une licence valide.
- **FR-013**: Owner et Manager MUST pouvoir demander l'extension à un pays ou un produit non encore autorisé ; l'admin l'accepte (autorisation 051, licence exigée pour un pays) ou la refuse.
- **FR-014**: L'auteur d'une demande en attente (ou tout Owner/Manager du courtier) MUST pouvoir l'annuler.

**Transverses**
- **FR-015**: Chaque écriture et chaque refus MUST produire un AuditLog (acteur, action, cible, avant/après ou valeurs demandées, motif, résultat).
- **FR-016**: Toutes les routes d'écriture courtier MUST commencer par `brokerWriteActor` et figurer dans `BROKER_TENANT_WRITE_GUARDED`.
- **FR-017**: La fiche admin MUST afficher une section « Demandes du courtier » (demandes et renouvellements en attente) avec décision pour les rôles autorisés.

### Key Entities *(include if feature involves data)*

- **PartnerChangeRequest** (nouveau) : courtier, type (`profile_change`, `coverage_extension`), statut (`pending`, `accepted`, `rejected`, `cancelled`), valeurs demandées, valeurs précédentes, justification, demandé par, décidé par et le, motif de décision.
- **PartnerTenant**, **PartnerLicense**, **AccreditationDocument**, **User**, **PartnerCountryAuthorization / PartnerProductAuthorization** : existants (spec 051).
- **AuditLog** : toutes les actions ci-dessus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un courtier corrige ses contacts en moins de 2 minutes sans intervention d'AssurMatch.
- **SC-002**: 0 donnée réglementaire (raison sociale, RCCM, pays, licence) modifiée ou validée sans décision admin (tests par champ).
- **SC-003**: 0 accès réussi d'un courtier aux données ou à l'équipe d'un autre courtier (tests d'isolation 404).
- **SC-004**: Un membre désactivé perd l'accès à sa requête suivante ; 0 courtier sans propriétaire actif par action du portail.
- **SC-005**: 100 % des écritures et refus de cette spec sont retrouvables dans les journaux d'audit.
- **SC-006**: 0 écriture possible par un courtier suspendu (test d'inventaire).

## Assumptions

- **Champs directs et champs sous demande** : la ville et les assureurs partenaires sont traités comme présentation commerciale (édition directe). Le nom commercial, bien que « présentation », passe par une demande : c'est le nom présenté au visiteur et cité dans le consentement comme destinataire (spec 052).
- **Plan, quota, capacité, SLA contractuel et statut** : lecture seule côté courtier. Le changement de plan (G-06) est hors périmètre.
- **Rôles** : un Manager peut inviter un autre Manager. Le propriétaire reste attribué par l'admin (fiche courtier 051).
- **Plans** : la gestion d'équipe est ouverte à tous les plans. Elle n'est pas l'« assignation équipe » des leads interdite en Starter (critère constitutionnel n°1) : un Starter ne voit toujours ni Kanban ni assignation de leads.
- **Désactivation** : elle réutilise le statut utilisateur `suspended` existant ; aucune suppression. La garde d'authentification vérifie le statut des utilisateurs courtiers (cache court invalidé à chaque action d'équipe).
- **Motifs de la conformité** : les motifs internes des transitions de licence et des revues de document ne sont pas exposés au courtier ; il voit les statuts et dates. Le motif de décision d'une demande lui est visible.
- **Notifications** : aucun e-mail ni notification in-app n'est ajouté pour les décisions ; le statut est visible dans le portail (notifications : spec 061).
- **Migration** : nommée `0025_broker_self_service` car des migrations 0023/0024 sont préparées en parallèle par d'autres specs ; le superviseur renumérote à la fusion si besoin.
- **Renouvellement** : le pays de la licence renouvelée est celui de la licence précédente ; une extension à un autre pays passe par une demande d'extension et une nouvelle licence saisie par l'admin.
