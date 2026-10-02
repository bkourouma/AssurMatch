---
description: "Task list for 051 — Onboarding et cycle de vie des courtiers partenaires"
---

# Tasks: 051 — Onboarding et cycle de vie des courtiers

**Input**: `specs/051-admin-partner-onboarding/` (plan, spec, research, data-model, contracts)
**Continuous Workflow**: Eligible (spec validée le 2026-10-02). Arrêt sur échec bloquant ou conflit constitutionnel.
**Tests**: obligatoires pour le RBAC, le périmètre pays, les conditions d'activation, les licences expirées, suspendues ou révoquées, la quarantaine, l'exclusion de « Actif test », la lecture seule après suspension, le refus après résiliation et la séparation des applications.

## Phase 1: Setup
- [ ] T001 Contrats `packages/shared/contracts/partner.contracts.ts`, `partner-application.contracts.ts`, `error-codes.ts` (data-model.md).
- [ ] T002 Matrice RBAC `packages/shared/rbac/assurmatch-role-matrix.ts` : `admin_pays` reçoit `partners:read/create/update`, `licenses:read/create`, `documents:read/create`, `partner_applications:review` (R13). Mettre à jour les tests RBAC existants.
- [ ] T003 Schéma Prisma, migration `0021_partner_onboarding_lifecycle` (additive, `ADD VALUE IF NOT EXISTS`, index unique partiel), `prisma-migrations.spec.ts`.

## Phase 2: Foundational
- [ ] T004 Exposer le scanner antivirus du runtime (`assurmatch-runtime.ts`). Dépôts mémoire et Prisma pour les documents d'agrément, les contrats et les historiques.
- [ ] T005 `partnerActivationBlockers()` pure (R3), réutilisée partout ; statut effectif « Expiré » (R1).

## Phase 3: US1 Courtier (P1) 🎯
- [ ] T006 [US1] `PartnersService` : création et mise à jour (identité, contacts, assureurs, plan, quota, capacité, SLA, pays), doublon RCCM, `expectedUpdatedAt`, audit avant/après.
- [ ] T007 [US1] Routes `GET/POST /admin/partners`, `GET/PATCH /admin/partners/:id` (filtres de l'annuaire, périmètre de l'Admin Pays).
- [ ] T008 [P] [US1] Tests d'intégration `backend/tests/integration/partners/admin-partners-runtime-http.spec.ts` (CRUD, doublon, hors périmètre, 409).

## Phase 4: US2 Licences et documents (P1)
- [ ] T009 [US2] Licences : `validate` (document accepté et non expirée), `suspend`, `revoke`, `renew` (puis `superseded`), historique, audit (`partner-licenses/`).
- [ ] T010 [US2] Documents : téléversement multipart (MIME, octets de signature, 5 Mo, sha256, stockage durable), analyse, quarantaine, revue, téléchargement audité (`documents/`).
- [ ] T011 [US2] Routes licences et documents (contrats/admin-partners-api.md).
- [ ] T012 [P] [US2] Tests : validation sans document (422), licence expirée, Admin Pays qui valide (403), EICAR en quarantaine, mauvais type, consultation auditée, `support_admin` refusé sur le fichier, renouvellement sans interruption.

## Phase 5: US3 Couverture (P1)
- [ ] T013 [US3] Autoriser et retirer par pays (licence exigée) et par produit ; dépôts mémoire et Prisma avec statut ; périmètre.
- [ ] T014 [P] [US3] Tests (retrait immédiat, hors périmètre, pays sans licence).

## Phase 6: US4 Statuts (P1)
- [ ] T015 [US4] Transitions (graphe, historique, `previousActiveStatus`, CO pour les activations, suspensions et résiliations), contrat (`POST /admin/partners/:id/contracts`), route `POST /admin/partners/:id/status`.
- [ ] T016 [US4] Éligibilité et checklist : documents persistés ; contrôles `partner_document_accepted`, `partner_owner_user`, `partner_contract` ; `country_active_licensed_partner` (actif, licence valide et document accepté) ; `active_test` exclu partout (vérifier les 8 sites).
- [ ] T017 [P] [US4] Tests : chaque blocage d'activation, Admin Pays qui active (403), Actif test jamais candidat ni public, suspension qui exclut du routage et des offres, réactivation refusée si une condition manque, « Expiré » calculé.

## Phase 7: US5 Candidatures (P1)
- [ ] T018 [US5] `PartnerApplicationsService` : `review`, `convert` (courtier et licence brouillons, flag pays), `reject` (code), décision définitive ; `locale` stocké à la soumission ; e-mail masqué hors CO.
- [ ] T019 [US5] E-mail `partner_application_decision` (gabarits FR et EN, garde de formulations, best effort, audit).
- [ ] T020 [US5] Routes candidatures et tests (conversion, double décision 409, flag désactivé 422, e-mail envoyé ou échec audité, périmètre).

## Phase 8: US6 Utilisateurs (P1)
- [ ] T021 [US6] Validation de `POST /admin/users` (courtier existant et non résilié, cohérence rôle/courtier) ; `POST /admin/partners/:id/users` (rôle propriétaire selon le plan).
- [ ] T022 [US6] Garde de tenant (R12) : connexion refusée et 401 si `retired` ; `tenantReadOnly` si `suspended` ; `assertBrokerTenantWritable` sur toutes les routes d'écriture courtier ; `/auth/me` renvoie `partnerTenantStatus` ; cache invalidé aux transitions.
- [ ] T023 [P] [US6] Tests : tenant inexistant, rôle courtier sans tenant, invitation et e-mail, écritures courtier refusées après suspension (inventaire des routes d'écriture), lectures permises, 401 et connexion refusée après résiliation.
- [ ] T024 [US6] SLA contractuel : `EnterpriseService.updateSla` borné, vue SLA admin (R9), test.

## Phase 9: US7 Interface admin et portail (P1/P2)
- [ ] T025 [US7] Admin :
  - `partners/page.tsx` (annuaire filtrable, conserver le tableau SLA) ;
  - `partners/[partnerId]/page.tsx` (identité, statut et historique, conditions d'activation et liens, licences et actions, documents et téléversement, contrat, couverture, utilisateurs et invitation, journal) ;
  - `partners/applications/page.tsx` et `[applicationId]/page.tsx` ;
  - actions et client API ;
  - navigation.
- [ ] T026 [US7] Admin `users` : sélecteur de courtier à la place de l'UUID libre.
- [ ] T027 [US7] Courtier : bannière « Compte suspendu : consultation seule » et désactivation des actions d'écriture si `partnerTenantStatus = suspended`.
- [ ] T028 [P] [US7] Tests de marqueurs admin et courtier.

## Phase 10: Seeds et validations
- [ ] T029 Helpers de test, seed démo, `import-partners` (`active_test`, documents acceptés persistés, propriétaire, contrat) ; tests existants verts.
- [ ] T030 Validations finales : `prisma generate` et `validate`, typecheck, lint, `npm run test`, `npm run test:web`, scan de secrets.
- [ ] T031 Carte de couverture et tâches cochées.

## Dependencies
Phase 1 → Phase 2 → US1 → (US2, US3) → US4 → US5 et US6 → UI → Phase 10. Le lot backend A couvre T001 à T017, le lot backend B T018 à T024 et T029. Le lot UI couvre T025 à T028 après les deux lots backend.
