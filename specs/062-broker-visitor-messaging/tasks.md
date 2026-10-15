---
description: "Task list for 062 — Messagerie courtier ↔ visiteur"
---

# Tasks: 062

**Continuous Workflow**: Eligible (spec validée le 2026-10-15).

**Tests obligatoires** : isolation entre courtiers et entre visiteurs (E-07), courtier réaffecté/désaffecté/agent non assigné/suspendu/lecture seule, Starter sans fonction CRM, lead non accepté ou clôturé, consentement retiré (lecture seule), drapeau coupé (écritures refusées, lecture conservée), formulation interdite FR/EN (accents, « garanti »), fichier infecté (aucun message partiel), messages en ajout seul, limites de débit et doublons, e-mails sans contenu de message ni nom de fichier, demande de documents (cycle, annulation, réaffectation), SLA de première réponse visible, demande de données (doublon, transitions, rôles, effacement jamais automatique), anonymisation 046, audits, garde `controller-reachability`.

## Phase 1: Fondation
- [x] T001 Spec, plan, research, data-model, contrats (`specs/062-…`), note datée D-9 dans le PRD v0.3.
- [ ] T002 Contrats partagés `lead-messaging.ts`, `data-requests.ts`, codes d'erreur, types de notification, catégories de rétention, garde de formulations renforcée (accents, « garanti ») + tests.
- [ ] T003 Schéma Prisma + migration `0031_broker_visitor_messaging` (4 tables, colonnes `QuoteRequestDocument.documentRequestId/uploadedBy`, `LeadAssignment.firstVisibleReplyAt`, 6 valeurs `NotificationType`) + specs de migration/schéma.
- [ ] T004 Drapeau `broker_visitor_messaging_enabled` (défaut `true`, non sensible) : défauts, seed, politique, tests d'exclusion adaptés.
- [ ] T005 Constantes d'audit `lead-messaging-audit-actions.ts`, `data-request-audit-actions.ts`.

## Phase 2: Backend messagerie (propriétaire A)
- [ ] T006 [US1][US2] Dépôt `LeadMessagingRepository` (mémoire + Prisma) : ajout seul, accusé de lecture, anonymisation, listes paginées.
- [ ] T007 [US1] `LeadMessagingService` côté courtier : accès par canal et affectation courante, états de conversation, envoi (garde de formulations, pièces jointes via `storeScannedFile`, plafond, idempotence `clientRequestId`, drapeau), lecture, téléchargement audité.
- [ ] T008 [US2] Côté visiteur : vérification du jeton, conversations par courtier, envoi, limites (IP, conversation), doublons, champ piège, accusé de lecture, téléchargement des pièces.
- [ ] T009 [US3] `DocumentRequestsService` : création, annulation, fermeture à la réaffectation/clôture, dépôt par le visiteur via le pipeline `quote-documents`, téléchargement courtier audité, liste côté visiteur.
- [ ] T010 [US5] `LeadAssignment.firstVisibleReplyAt` (écriture idempotente à la 1re proposition et au 1er message courtier, remise à zéro à la réaffectation) et champs additifs `firstVisibleReply*` dans les SLA courtier, enterprise et admin partenaires.
- [ ] T011 [US1][US2][US3] Notifications : 5 types (`visitor_broker_message`, `visitor_documents_requested`, `broker_visitor_message`, réutilisation `broker_document_received`), gabarits FR/EN pointeur sans contenu, worker (`DELIVERABLE_TYPES`), tranches de 15 minutes, préférences de canal.
- [ ] T012 Routes HTTP visiteur et courtier (Starter/CRM) dans `lead-messaging-http.controllers.ts`, blocs `// Spec 062` dans le câblage et le runtime, `BROKER_TENANT_WRITE_GUARDED`, en-têtes `no-store`/`nosniff`, champ `messaging` dans le statut de suivi.
- [ ] T013 [P] Tests unitaires et d'intégration HTTP de bout en bout (isolation, RBAC, flags, wording, antivirus, e-mails sans contenu, SLA).

## Phase 3: Backend demandes de données et admin (propriétaire B)
- [ ] T014 [US4] `DataRequestsService` + dépôt : création visiteur (référence `DR-…`, unicité par type ouvert, échéance indicative), accusé de réception, alerte conformité, audit.
- [ ] T015 [US4] Routes admin (file, détail, prise en charge, clôture, rejet, `start-erasure` → `DataRetentionService.previewErasure`, jamais d'exécution directe) ; support limité au statut ; rôles refusés audités.
- [ ] T016 [US6] Vue admin en lecture seule des conversations d'une demande (`GET /admin/leads/:quoteRequestId/conversations`), auditée, corps masqués pour le support.
- [ ] T017 Rétention 046 : politiques, sujets et anonymisation des messages, pièces, demandes de documents et demandes de données.
- [ ] T018 [P] Tests : transitions, doublons, RBAC, pas d'effacement automatique, anonymisation, audit, e-mails.

## Phase 4: Web Publique Client (propriétaire C)
- [ ] T019 [US2] Section « Conversation » de l'espace de suivi (par courtier, bandeau, lecture seule, pièces jointes, accusés de lecture), FR/EN, relais serveur des fichiers.
- [ ] T020 [US3] Section « Documents demandés » (téléversement multi-fichiers, états).
- [ ] T021 [US4] Section « Mes données » (formulaire accès/rectification/effacement, liste avec références et statuts).
- [ ] T022 [P] Messages `fr.json`/`en.json` (accents, mêmes clés), tests de marqueurs et de balayage de formulations.

## Phase 5: Back-office Courtier (propriétaire D)
- [ ] T023 [US1][US3] Composant `ConversationPanel` + demandes de documents sur la fiche Starter et CRM (montage d'une ligne), relais serveur multipart/téléchargement, erreurs de garde de formulations (expression affichée), états lecture seule.
- [ ] T024 Notifications : liens plan-aware vers la conversation, libellés des nouveaux types, affichage SLA « première réponse visible ».
- [ ] T025 [P] Tests de marqueurs et fonctions pures, Starter sans fonction CRM.

## Phase 6: Back-office Plateforme (propriétaire E)
- [ ] T026 [US4] Pages `compliance/data-requests` (file filtrée, détail, actions, lien vers l'aperçu d'effacement), lien depuis « Rétention », libellés des nouvelles catégories.
- [ ] T027 [US6] Carte « Conversations » en lecture seule sur la fiche de la demande ; affichage du SLA « première réponse visible » dans l'admin partenaires.
- [ ] T028 [P] Tests de marqueurs.

## Phase 7: Revue et validations
- [ ] T029 Revue sécurité/constitution (lecture seule) et revue QA (lecture seule) ; corrections.
- [ ] T030 Scénario E2E manuel `docs/scenarios/e2e-admin-courtier-devis.md` (étapes messagerie, documents, demande de données).
- [ ] T031 Validations : `prisma validate`, typecheck, lint, `NODE_ENV=test npm run test`, `npm run test:web`, scan de secrets, garde `controller-reachability`.
