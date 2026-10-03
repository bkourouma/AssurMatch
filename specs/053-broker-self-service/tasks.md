---
description: "Task list for 053 — Self-service du courtier"
---

# Tasks: 053 — Self-service du courtier

**Input**: `specs/053-broker-self-service/` (spec, plan, research, data-model, contracts)
**Continuous Workflow**: Eligible. Arrêt sur échec bloquant ou conflit constitutionnel.
**Tests**: obligatoires pour le RBAC (Owner/Manager écrivent, Agent/Read-only lisent), l'isolation par courtier (404), la lecture seule d'un courtier suspendu (inventaire), la protection du dernier propriétaire et de soi-même, le renouvellement qui finit « en revue » sans validation par le courtier, la décision admin (acceptée, refusée, périmètre) et la séparation des applications.

## Phase 1: Setup
- [x] T001 Contrats `packages/shared/contracts/broker-self-service.contracts.ts` et codes `error-codes.ts` (`TEAM_LAST_OWNER`, `TEAM_SELF_ACTION`, `PARTNER_REQUEST_PENDING`, `PARTNER_REQUEST_ALREADY_DECIDED`).
- [x] T002 Matrice RBAC `broker_account:read|write`, `broker_team:read|write` + miroir `apps/broker/app/lib/broker-permissions.ts` ; tests de matrice.
- [x] T003 Schéma Prisma (`PartnerChangeRequest`, deux enums), migration `0025_broker_self_service`, `prisma-migrations.spec.ts`.

## Phase 2: Foundational
- [x] T004 Dépôt `partner-change-requests.repository.ts` (mémoire et Prisma).
- [x] T005 `UserAccessStatusService` et garde d'authentification : 401 pour un utilisateur courtier suspendu, verrouillé ou supprimé (R6).

## Phase 3: US1 Profil société (P1) 🎯
- [x] T006 [US1] `BrokerAccountService` : vue compte, mise à jour directe (strict, `expectedUpdatedAt`), demandes de profil (une en attente), annulation, audit.
- [x] T007 [US1] `PartnerRequestAdminService` : liste (périmètre) et décision (application via `PartnerAdminService.update`), audit.
- [x] T008 [US1] Routes `/broker/account/*` et `/admin/partner-requests*` ; runtime.

## Phase 4: US2 Licences (P1)
- [x] T009 [US2] Liste des licences (historique sans motif, documents sans clé), renouvellement `draft`, preuve multipart (`license`) et passage `pending_review` si sain.
- [x] T010 [US2] Routes `/broker/licenses/*`.

## Phase 5: US3 Équipe (P1)
- [x] T011 [US3] `BrokerTeamService` : liste, invitation (parcours d'activation, jamais de jeton), désactivation, réactivation, changement de rôle, garde-fous (soi, dernier propriétaire, Manager/propriétaire), invalidation du cache de statut.
- [x] T012 [US3] Routes `/broker/team/*` ; `BROKER_TENANT_WRITE_GUARDED` et test d'inventaire.

## Phase 6: US4 Couverture (P2)
- [x] T013 [US4] Vue couverture, demande d'extension (doublons, existence), décision (autorisation 051, licence exigée pour un pays).

## Phase 7: Tests backend
- [x] T014 [P] Intégration `backend/tests/integration/broker-self-service/broker-account-runtime-http.spec.ts` (profil, demandes, décision, RBAC, isolation, suspendu, périmètre Admin Pays).
- [x] T015 [P] Intégration `broker-licenses-runtime-http.spec.ts` (renouvellement en revue, doublon, révoquée, EICAR, isolation, pas de validation courtier, validation conformité qui remplace l'ancienne).
- [x] T016 [P] Intégration `broker-team-runtime-http.spec.ts` (invitation, rôles interdits, soi, dernier propriétaire, Manager/propriétaire, 401 après désactivation, réactivation, isolation, lecture Agent).

## Phase 8: Interfaces
- [x] T017 [US1][US4] Courtier `/company` : profil, formulaire direct, demande d'identité, couverture, demande d'extension, liste et annulation des demandes ; navigation « Société ».
- [x] T018 [US2] Courtier `/licenses` : licences, historique, renouvellement, preuve (route handler same-origin) ; navigation « Licences ».
- [x] T019 [US3] Courtier `/team` fonctionnel (liste, invitation, désactivation, réactivation, rôle) ; lecture seule Agent/Read-only et compte suspendu.
- [x] T020 [US1][US4] Admin : section « Demandes du courtier » de la fiche courtier (décision, renouvellements en attente) ; client API et actions.
- [x] T021 [P] Tests de marqueurs `apps/broker/tests/self-service.spec.ts`, `apps/admin/tests/partner-requests.spec.ts` ; mise à jour des marqueurs existants (`/team`).

## Phase 9: Validations
- [x] T022 `prisma validate`, typecheck, lint, `npx vitest run`, `npx playwright test apps/broker apps/admin`, `next build` courtier et admin, scan de secrets.
- [x] T023 Tâches cochées et rapport.

## Dependencies
Phase 1 → Phase 2 → US1 → (US2, US3, US4) → tests backend → interfaces → validations.
