# Research: 053 — Self-service du courtier

## Constats (audit du code, 2026-10-03)

| # | Constat | Preuve |
|---|---|---|
| C1 | `/account` n'affiche que acteur, tenant, plan et rôles ; `/team` est un placeholder sans route. | `apps/broker/app/account/page.tsx`, `apps/broker/app/team/page.tsx` |
| C2 | Toute la logique d'identité, de licence, de document et de couverture existe côté admin dans `PartnerAdminService` (051), avec RBAC, périmètre pays, audit et doublon RCCM. | `backend/src/modules/partners/partner-admin.service.ts` |
| C3 | `DocumentsService.upload` applique déjà MIME, octets de signature, 5 Mo, sha256, stockage durable et antivirus synchrone ; il laisse l'autorisation à l'appelant. | `backend/src/modules/documents/documents.module.ts` |
| C4 | La validation d'une licence exige un document accepté et une date future ; un renouvellement validé remplace l'ancienne licence. Le statut `pending_review` existe sans être utilisé. | `PartnerAdminService.validateLicense` |
| C5 | L'invitation passe par `AdminUsersController.createPartnerUser` : contrôle de cohérence courtier/rôle, jeton d'activation, e-mail, MFA `required`. | `backend/src/modules/users/admin-users.controller.ts` |
| C6 | Les jetons d'accès sont sans état (15 min) ; la garde n'examine que le statut du courtier, pas celui de l'utilisateur. Un utilisateur suspendu garde l'accès jusqu'à l'expiration. | `http-auth.guard.ts`, `http-auth-token.service.ts` |
| C7 | Toute route d'écriture courtier doit commencer par `brokerWriteActor` et figurer dans `BROKER_TENANT_WRITE_GUARDED` ; un test d'inventaire appelle chaque méthode de façon synchrone et attend une `ForbiddenException`. | `runtime-http-wiring.module.ts`, `broker-tenant-suspension-runtime-http.spec.ts` |
| C8 | Aucune permission `broker_account:*` ni `broker_team:*` dans la matrice ; le miroir `broker-permissions.ts` doit rester identique. | `assurmatch-role-matrix.ts`, `broker-permissions.spec.ts` |

## Décisions

### R1 — Un service courtier qui délègue à la 051
- **Decision**: Nouveau module `backend/src/modules/broker-self-service/` :
  - `BrokerAccountService` (profil, couverture, demandes, licences, renouvellement, preuve) ;
  - `BrokerTeamService` (équipe) ;
  - `PartnerRequestAdminService` (liste et décision admin).

  Le tenant vient toujours de `actor.partnerTenantId`. Une ressource d'un autre courtier répond 404 (même message qu'une ressource absente). L'acceptation d'une demande appelle `PartnerAdminService.update`, `authorizeCountry` ou `authorizeProduct` : RBAC, périmètre, doublon RCCM et licence exigée restent à un seul endroit.
- **Alternatives considered**: Ouvrir les routes `/admin/partners/:id` aux rôles courtiers (mélange des scopes, contraire au principe III) ; dupliquer les règles (divergence).

### R2 — Champs directs et demandes
- **Decision**: `brokerProfileUpdateSchema` est un objet `strict` limité à : contacts admin et commercial, `primaryEmail`, `primaryWhatsApp`, `city`, `partnerInsurers`, `expectedUpdatedAt?`, `reason?`. Toute autre clé répond 400. L'écriture passe par `PartnersService.update` (audit `partner.updated` avant/après) puis un audit `broker_account.profile_updated`.
- `partnerProfileChangeRequestSchema` : `legalName?`, `tradeName?`, `registrationNumber?`, `countryId?` (au moins un), `justification` (10 à 1 000 caractères). Une seule demande `profile_change` en attente par courtier (409).
- `partnerCoverageExtensionRequestSchema` : exactement un de `countryId` ou `productId`, `justification`. Refus 409 si déjà autorisé ou si une demande identique est en attente ; 422 si le pays ou le produit n'existe pas.

### R3 — Table unique de demandes
- **Decision**: `PartnerChangeRequest` (`type`, `status`, `requestedChanges Json`, `previousValues Json`, `justification`, `requestedById`, `decidedById`, `decidedAt`, `decisionReason`, dates). Dépôts mémoire et Prisma. Décision définitive ; annulation par le courtier seulement en attente.
- **Rationale**: Un seul écran admin, un seul cycle de vie, un audit homogène.

### R4 — Renouvellement par le courtier
- **Decision**:
  - `POST /broker/licenses/:id/renewals` crée via `PartnerLicensesService.create` une licence `draft` (`renewsLicenseId`, pays de la licence précédente), après contrôles : licence du courtier, ni `revoked` ni `superseded`, aucun renouvellement `draft|pending_review` en cours, produits existants.
  - `POST /broker/licenses/:id/documents` (multipart, `file`, `reason?`) : licence du courtier en `draft|pending_review`, `DocumentsService.upload` avec `documentType = license`. Si l'analyse est saine et la licence `draft`, elle passe `pending_review` (« soumise par le courtier »).
  - Aucune route courtier ne valide, n'accepte de document ni ne change un autre statut de licence (FR-008).

### R5 — Équipe
- **Decision**:
  - Liste : utilisateurs du tenant de l'acteur, hors `deleted`, vue sans secret (nom, e-mail, rôles, statut, MFA enrôlée, dernière connexion, `isSelf`).
  - Invitation : `brokerTeamInviteSchema.role ∈ {broker_manager, broker_agent, broker_read_only}` ; `createPartnerUser` (activation + MFA requise). Le jeton n'est jamais renvoyé. Un e-mail déjà utilisé répond 409 avec un message neutre.
  - Désactivation : `users.suspend` ; réactivation : `active` si un mot de passe existe, sinon `invited` ; changement de rôle : `users.updateRoles` (non propriétaire, rôle courtier non propriétaire).
  - Garde-fous : pas d'action sur soi (`TEAM_SELF_ACTION`), pas de désactivation du dernier propriétaire actif ou invité (`TEAM_LAST_OWNER`), un Manager n'agit pas sur un propriétaire (403), un propriétaire ne change pas de rôle depuis le portail (403).

### R6 — Désactivation effective immédiatement (C6)
- **Decision**: `UserAccessStatusService` (cache par utilisateur, TTL 30 s, invalidé par `BrokerTeamService`) ; `AuthRequiredHttpGuard` répond 401 à un acteur rattaché à un courtier dont l'utilisateur est `suspended`, `locked` ou `deleted`. Un identifiant inconnu (jetons de test) ne restreint rien.
- **Alternatives considered**: Révocation des jetons (pas de liste de révocation aujourd'hui) ; attendre l'expiration (15 min, insuffisant pour un départ).

### R7 — RBAC
- **Decision**: Nouvelles permissions `broker_account:read|write` et `broker_team:read|write`. Owner Starter, Owner Pro, Manager : lecture et écriture. Agent, Read-only : lecture. Miroir `broker-permissions.ts` mis à jour. Décision admin : `partners:update` + périmètre pays (via `PartnerAdminService`) ; lecture admin : `partners:read` + périmètre.

### R8 — Routes et garde de suspension
- **Decision**: Trois contrôleurs courtiers (`BrokerAccountController`, `BrokerLicensesController`, `BrokerTeamController`). Chaque méthode d'écriture est synchrone jusqu'à `brokerWriteActor` (exigence du test d'inventaire) et listée dans `BROKER_TENANT_WRITE_GUARDED`. Le test d'inventaire reçoit les trois nouveaux contrôleurs.
- `AdminPartnerRequestsHttpController` : `GET /admin/partner-requests` (filtres `partnerTenantId`, `status`, `type`) et `POST /admin/partner-requests/:id/decision`.

### R9 — Interfaces
- **Decision**:
  - Courtier : `/company` (profil, couverture, demandes), `/licenses` (licences, renouvellement, preuve via un route handler same-origin, comme l'admin 051, car une server action est limitée à 1 Mo), `/team` (liste, invitation, actions). Navigation : « Société » et « Licences » ; « Equipe » perd son badge Enterprise.
  - Admin : section `#demandes` « Demandes du courtier » sur la fiche, avec décision (accepter, refuser, motif) pour les rôles de préparation, et rappel des renouvellements de licence en attente.

### R10 — Migration
- **Decision**: `0024_broker_self_service`, additive : deux enums (`DO $$ ... duplicate_object`), une table `CREATE TABLE IF NOT EXISTS`, deux index. Aucune donnée existante réécrite. Numéro choisi pour éviter les 0023/0024 préparées en parallèle.
