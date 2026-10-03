---
description: "Task list for 053 — Self-service du courtier"
---

# Tasks: 053 — Self-service du courtier

**Input**: `specs/053-broker-self-service/` (spec, plan, research, data-model, contracts)
**Continuous Workflow**: Eligible. Arrêt sur échec bloquant ou conflit constitutionnel.
**Tests**: obligatoires pour le RBAC (Owner/Manager écrivent, Agent/Read-only lisent), l'isolation par courtier (404), la lecture seule d'un courtier suspendu (inventaire), la protection du dernier propriétaire et de soi-même, le renouvellement qui finit « en revue » sans validation par le courtier, la décision admin (acceptée, refusée, périmètre) et la séparation des applications.

## Phase 1: Setup
- [ ] T001 Contrats `packages/shared/contracts/broker-self-service.contracts.ts` et codes `error-codes.ts` (`TEAM_LAST_OWNER`, `TEAM_SELF_ACTION`, `PARTNER_REQUEST_PENDING`, `PARTNER_REQUEST_ALREADY_DECIDED`).
- [ ] T002 Matrice RBAC `broker_account:read|write`, `broker_team:read|write` + miroir `apps/broker/app/lib/broker-permissions.ts` ; tests de matrice.
- [ ] T003 Schéma Prisma (`PartnerChangeRequest`, deux enums), migration `0025_broker_self_service`, `prisma-migrations.spec.ts`.

## Phase 2: Foundational
- [ ] T004 Dépôt `partner-change-requests.repository.ts` (mémoire et Prisma).
- [ ] T005 `UserAccessStatusService` et garde d'authentification : 401 pour un utilisateur courtier suspendu, verrouillé ou supprimé (R6).

## Phase 3: US1 Profil société (P1) 🎯
- [ ] T006 [US1] `BrokerAccountService` : vue compte, mise à jour directe (strict, `expectedUpdatedAt`), demandes de profil (une en attente), annulation, audit.
- [ ] T007 [US1] `PartnerRequestAdminService` : liste (périmètre) et décision (application via `PartnerAdminService.update`), audit.
- [ ] T008 [US1] Routes `/broker/account/*` et `/admin/partner-requests*` ; runtime.

## Phase 4: US2 Licences (P1)
- [ ] T009 [US2] Liste des licences (historique sans motif, documents sans clé), renouvellement `draft`, preuve multipart (`license`) et passage `pending_review` si sain.
- [ ] T010 [US2] Routes `/broker/licenses/*`.

## Phase 5: US3 Équipe (P1)
- [ ] T011 [US3] `BrokerTeamService` : liste, invitation (parcours d'activation, jamais de jeton), désactivation, réactivation, changement de rôle, garde-fous (soi, dernier propriétaire, Manager/propriétaire), invalidation du cache de statut.
- [ ] T012 [US3] Routes `/broker/team/*` ; `BROKER_TENANT_WRITE_GUARDED` et test d'inventaire.

## Phase 6: US4 Couverture (P2)
- [ ] T013 [US4] Vue couverture, demande d'extension (doublons, existence), décision (autorisation 051, licence exigée pour un pays).

## Phase 7: Tests backend
- [ ] T014 [P] Intégration `backend/tests/integration/broker-self-service/broker-account-runtime-http.spec.ts` (profil, demandes, décision, RBAC, isolation, suspendu, périmètre Admin Pays).
- [ ] T015 [P] Intégration `broker-licenses-runtime-http.spec.ts` (renouvellement en revue, doublon, révoquée, EICAR, isolation, pas de validation courtier, validation conformité qui remplace l'ancienne).
- [ ] T016 [P] Intégration `broker-team-runtime-http.spec.ts` (invitation, rôles interdits, soi, dernier propriétaire, Manager/propriétaire, 401 après désactivation, réactivation, isolation, lecture Agent).

## Phase 8: Interfaces
- [ ] T017 [US1][US4] Courtier `/company` : profil, formulaire direct, demande d'identité, couverture, demande d'extension, liste et annulation des demandes ; navigation « Société ».
- [ ] T018 [US2] Courtier `/licenses` : licences, historique, renouvellement, preuve (route handler same-origin) ; navigation « Licences ».
- [ ] T019 [US3] Courtier `/team` fonctionnel (liste, invitation, désactivation, réactivation, rôle) ; lecture seule Agent/Read-only et compte suspendu.
- [ ] T020 [US1][US4] Admin : section « Demandes du courtier » de la fiche courtier (décision, renouvellements en attente) ; client API et actions.
- [ ] T021 [P] Tests de marqueurs `apps/broker/tests/self-service.spec.ts`, `apps/admin/tests/partner-requests.spec.ts` ; mise à jour des marqueurs existants (`/team`).

## Phase 9: Validations
- [ ] T022 `prisma validate`, typecheck, lint, `npx vitest run`, `npx playwright test apps/broker apps/admin`, `next build` courtier et admin, scan de secrets.
- [ ] T023 Tâches cochées et rapport.

## Dependencies
Phase 1 → Phase 2 → US1 → (US2, US3, US4) → tests backend → interfaces → validations.
