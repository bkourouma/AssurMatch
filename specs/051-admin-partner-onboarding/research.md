# Research: 051 — Onboarding et cycle de vie des courtiers

## Constats (audit du code, 2026-10-02)

| # | Constat | Preuve |
|---|---|---|
| C1 | `AdminPartnersController`, `PartnerLicensesController` et `DocumentsController` existent mais ne sont pas câblés en HTTP. Seules `GET /admin/partners/sla` et `GET /admin/partners/applications` existent. | `runtime-http-wiring.module.ts` |
| C2 | `PartnerStatus` : draft, pending_compliance, active, suspended, retired. Huit sites testent l'égalité `status === "active"` (éligibilité au routage, éligibilité des offres publiques, checklist, tableau de bord admin, statistiques publiques, annuaire public). | `broker-eligibility-policy.ts:40`, `partner-eligibility.service.ts:20`, `assurmatch-runtime.ts:627`, `activation-checklist.service.ts:214,296`, `admin-dashboard.service.ts:96,291`, `public-stats.module.ts:70`, `public-partner-directory.service.ts:157` |
| C3 | `PartnerTenant` n'a ni pays, ni contacts structurés, ni assureurs partenaires, ni SLA, ni contrat, ni historique de statut. | `schema.prisma:543` |
| C4 | `PartnerLicense` : aucune suspension, révocation, renouvellement ni historique. `eligible()` exige `valid` et une date d'expiration future. Aucun job ne fait passer une licence en `expired`. | `partner-licenses.module.ts`, `partner-licenses.repository.ts` |
| C5 | Les documents d'agrément sont stockés en mémoire, sans fichier ni analyse. L'éligibilité « document accepté » est donc fausse après un redémarrage. | `documents.module.ts:19`, `assurmatch-runtime.ts:421` |
| C6 | Le stockage (`documentStorage`) et l'antivirus des documents de devis sont réutilisables. Le scanner est instancié en ligne et doit être exposé. | `assurmatch-runtime.ts:370-374`, `quote-documents.service.ts:63-184` |
| C7 | Les autorisations par pays et par produit n'ont pas de retrait. Leur `status` est libre (`pending` par défaut, `active` à l'autorisation). | `partners.module.ts`, `partners.repository.ts:128` |
| C8 | Les candidatures n'ont pas de décision ; le dépôt n'a pas de mise à jour. La langue de la candidature n'est pas stockée (spec 047). | `partner-applications.module.ts` |
| C9 | `POST /admin/users` ne vérifie pas que le `partnerTenantId` existe, et ne lie pas les rôles courtiers à un courtier. | `admin-users.controller.ts:48` |
| C10 | Aucune vérification du statut du courtier à l'authentification : un courtier suspendu ou retiré garde un accès complet. | `modules/auth` |
| C11 | L'objectif SLA (`PartnerBranding.firstActionTargetMinutes`) n'est réglable que par le courtier Enterprise. | `enterprise.service.ts:193` |
| C12 | La matrice RBAC ne donne à `admin_pays` aucune permission `partners:*`. `compliance_admin` a `partners:*`, `licenses:*` et `documents:*`. `support_admin` a `partners:read`. | `assurmatch-role-matrix.ts:20-22` |

## Décisions

### R1 — Statuts
- **Decision**: On garde les valeurs stockées existantes et on ajoute `active_test` à l'enum `PartnerStatus`. Correspondance avec les libellés du PRD :

  | Libellé PRD | Valeur stockée |
  |---|---|
  | Prospect | `draft` |
  | En vérification | `pending_compliance` |
  | Actif test | `active_test` |
  | Actif public | `active` |
  | Suspendu | `suspended` |
  | Résilié | `retired` |

  « Expiré » est un **statut effectif calculé** (FR-006) : un courtier `active` ou `active_test` sans licence valide et non expirée est affiché « Expiré ». Il devient inéligible, ce qui est déjà le cas puisque l'éligibilité exige une licence valide. Il revient à son statut dès qu'une licence est renouvelée. Aucune tâche planifiée n'est nécessaire.
- **Rationale**: Les huit sites qui testent `=== "active"` ont déjà la bonne sémantique (seul « Actif public » est routable et public). `active_test` en est exclu par construction (FR-020, D-6). Il n'y a pas de migration de données, et les seeds et tests restent valides.
- **Alternatives considered**: Renommer en `active_public` (huit sites, seeds et tests à réécrire pour aucun gain) ; stocker `expired` (il faudrait un job et une synchronisation avec les licences).

### R2 — Transitions et historique
- **Decision**: `PartnerLifecycleService` porte un graphe de transitions explicite (FR-003). Il refuse toute transition hors graphe (409) et exige un motif. Il écrit une ligne `PartnerStatusHistory` et un AuditLog à chaque transition. Le champ `previousActiveStatus` mémorise le statut actif d'avant une suspension, pour la réactivation. `retired` est terminal.

### R3 — Conditions d'activation (FR-004)
- **Decision**: Une seule fonction pure `partnerActivationBlockers(partner, context)` renvoie la liste des blocages :
  - `license_valid_with_document` ;
  - `coverage_country`, `coverage_product` (autorisations actives couvertes par une licence valide) ;
  - `owner_user` ;
  - `contract_recorded` ;
  - `country_broker_onboarding_enabled`.

  Cette fonction est utilisée par l'activation, la réactivation, la fiche admin et la checklist d'activation. La réponse est une 422 `PARTNER_ACTIVATION_BLOCKED` avec `blockers[]`, au même format que la spec 050.

### R4 — Licences
- **Decision**: On ajoute `superseded` à `LicenseStatus`. Nouveaux champs :
  - `statusReason` ;
  - `renewsLicenseId` ;
  - table `PartnerLicenseHistory`.

  Les actions sont `validate` (document accepté rattaché à la licence et date d'expiration future exigés), `suspend`, `revoke` et `renew`. `renew` crée une nouvelle licence qui référence l'ancienne ; à la validation de la nouvelle, l'ancienne passe `superseded`. Elles sont réservées à `compliance_admin` ou `super_admin`. `eligible()` est inchangée : `valid` et non expirée.

### R5 — Documents d'agrément
- **Decision**: Le modèle `AccreditationDocument` est persisté, avec un dépôt mémoire et un dépôt Prisma. Nouveaux champs : `fileName`, `mimeType`, `sizeBytes`, `scanStatus` (`pending|clean|infected|failed`), `scanEngine`, `scannedAt`, `reviewReason`.
  - **Téléversement multipart** (`FileInterceptor`), même règle que les documents de devis :
    - types MIME autorisés et octets de signature vérifiés ;
    - taille maximale de 5 Mo ;
    - empreinte sha256 ;
    - stockage durable obligatoire hors `local` et `test`.
  - L'analyse antivirus réutilise le scanner configuré, exposé par le runtime. Elle est synchrone après stockage pour les documents d'agrément : les volumes sont faibles, et le résultat est ainsi immédiat pour la conformité.
  - Un fichier `infected` est mis en quarantaine : il n'est jamais servi et ne peut pas être accepté.
  - Le téléchargement admin est audité (`accreditation_document.downloaded`).
  - `DocumentType` reçoit la valeur `partnership_contract`.
  - L'éligibilité lit les documents persistés : `accepted` et `clean`, rattachés au courtier.

### R6 — Contrat
- **Decision**: Nouvelle table `PartnerContract` (`version`, `signedAt`, `signatoryName`, `documentId` vers un `AccreditationDocument` de type `partnership_contract`, `recordedById`). Le contrat est enregistré par l'admin (décision utilisateur). La condition d'activation exige au moins un contrat enregistré dont le document est `clean`.

### R7 — Couverture
- **Decision**: Les autorisations prennent le statut `active` ou `withdrawn`, avec `withdrawnAt` et `withdrawalReason`. Une autorisation pays exige une licence (brouillon ou valide) du courtier pour ce pays. Les lectures existantes filtrent déjà sur `active`. Le dépôt mémoire passe de Sets à des enregistrements avec statut.

### R8 — Identité du courtier
- **Decision**: Nouvelles colonnes de `PartnerTenant` :
  - `countryId` (pays principal) ;
  - `adminContactName`, `adminContactEmail`, `adminContactPhone` ;
  - `commercialContactName`, `commercialContactEmail`, `commercialContactPhone` ;
  - `partnerInsurers String[]` ;
  - `slaTargetMinutes Int?` ;
  - `statusReason` ;
  - `previousActiveStatus`.

  `primaryEmail` et `primaryWhatsApp` sont conservés. Doublon refusé : même `countryId` et même `registrationNumber`, vérifié dans l'application et garanti par un index unique partiel (`WHERE registrationNumber IS NOT NULL AND countryId IS NOT NULL`) dans la migration.

### R9 — SLA contractuel
- **Decision**: `slaTargetMinutes`, fixé par l'admin, est la cible contractuelle. `EnterpriseService.updateSla` refuse une cible courtier plus lâche que la cible contractuelle (422). La vue SLA admin utilise la cible contractuelle si elle existe, sinon la valeur actuelle.

### R10 — Candidatures
- **Decision**: Les statuts existants sont repris : `received → under_review → accepted | rejected`, et `accepted` signifie « convertie », avec `partnerTenantId`. Nouveaux champs : `rejectionReasonCode` (liste fermée : `license_unverifiable`, `out_of_coverage`, `incomplete_information`, `insufficient_capacity`, `other`) et `locale` (défaut `fr`, renseigné par les nouvelles soumissions depuis la locale déjà envoyée par le site, spec 047).
  - **Décisions** (`compliance_admin` ou `super_admin`) : `review`, `convert` et `reject`. `convert` crée en une seule opération le courtier `draft` (pays, raison sociale, RCCM inconnu, contact) et une licence `draft` (numéro, autorité, expiration, produits déclarés). Il échoue si `country_broker_onboarding_enabled` est désactivé.
  - **E-mail** : nouvelle finalité `partner_application_decision`, gabarits FR et EN avec garde de formulations, best effort et audité (même chemin que la spec 047). L'e-mail ne contient ni la note interne ni le motif détaillé : seulement la référence et une phrase neutre.
  - L'e-mail de contact complet n'est visible que des rôles de décision.

### R11 — Utilisateurs
- **Decision**: `AdminUsersController.create` refuse un utilisateur :
  - rattaché à un courtier inexistant ou retiré ;
  - qui reçoit un rôle `broker_*` sans courtier ;
  - qui reçoit un rôle admin avec un courtier.

  Nouvelle route `POST /admin/partners/:id/users` (invitation depuis la fiche courtier). Rôle propriétaire selon le plan : `broker_owner_starter` pour Starter, `broker_owner_pro` pour Pro et Enterprise. Les rôles `broker_manager`, `broker_agent` et `broker_read_only` sont aussi possibles. La route délègue au parcours d'activation existant.

### R12 — Effets de la suspension et de la résiliation (FR-021, FR-022)
- **Decision**:
  - **Contrôle à chaque requête** : `AuthRequiredHttpGuard` charge le statut du courtier de l'acteur, via un cache court invalidé à chaque transition :
    - `retired` → 401 avec un message neutre, ce qui invalide de fait les sessions existantes, même si les jetons ne sont pas révocables individuellement ;
    - `suspended` → l'acteur est marqué `tenantReadOnly`.
  - **Connexion** : `AuthService.login` refuse un utilisateur dont le courtier est `retired`.
  - **Écritures courtier** : toutes les routes d'écriture courtier refusent un acteur `tenantReadOnly` avec 403 `PARTNER_SUSPENDED` (starter accept/reject/dispute ; CRM status, notes, tasks, reminders, assign, documents, proposals, disputes ; enterprise ; préférences de notification ; actions IA). Le refus passe par une garde unique `assertBrokerTenantWritable(actor)` appelée en tête de chaque méthode d'écriture des contrôleurs courtiers, plus un test d'inventaire qui vérifie la couverture.
  - **Lectures** : elles restent permises.
  - **Bannière** : `/auth/me` renvoie `partnerTenantStatus`, et le portail courtier affiche une bannière « Compte suspendu : consultation seule ».

### R13 — RBAC
- **Decision**: La matrice est élargie, comme l'exige la spec validée (« Admin Pays : création et préparation ») : `admin_pays` reçoit `partners:read`, `partners:create`, `partners:update`, `licenses:read`, `licenses:create`, `documents:read`, `documents:create` et `partner_applications:review`. Sont réservés par contrôle de rôle explicite à `compliance_admin` et `super_admin` :
  - transitions d'activation, de suspension, de réactivation et de résiliation ;
  - `licenses:approve`, suspension et révocation de licence ;
  - acceptation et refus des documents ;
  - conversion et refus des candidatures.

  Périmètre de l'Admin Pays : `partner.countryId` et le pays de l'autorisation. `support_admin` garde `partners:read`, sans accès au contenu des documents.

### R14 — Checklist d'activation et éligibilité
- **Decision**:
  - `country_active_licensed_partner` ne compte que les courtiers `active`, avec une licence valide et un document accepté.
  - Les sections partenaire reçoivent `partner_document_accepted`, `partner_owner_user` et `partner_contract`.
  - `PartnerEligibilityService` et la politique de routage lisent les documents persistés. Le statut `active_test` est exclu partout par l'égalité existante.

### R15 — Seeds et scripts
- **Decision**: Les helpers de test, le seed démo et `import-partners` créent des courtiers éligibles complets : document accepté et sain, propriétaire, contrat. Sinon, les tests de routage existants échoueraient à cause de la nouvelle exigence de document persistant. L'enum d'import reçoit `active_test`.

### R16 — Hors périmètre confirmé
Self-service courtier (spec 053), alertes J-60/J-30/J-7 (spec 061), leads de test vers « Actif test » (spec 059), signature électronique (interdite), réaffectation automatique des leads d'un courtier suspendu (reste manuelle).
