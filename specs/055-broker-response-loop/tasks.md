---
description: "Task list for 055 — Réponse du courtier au visiteur et suite donnée par le visiteur"
---

# Tasks: 055

**Continuous Workflow**: Eligible (spec validée le 2026-10-03).

**Tests** : obligatoires pour l'isolation entre courtiers et entre visiteurs, Starter qui répond sans fonction CRM, compte suspendu, lead non accepté, rôle lecture seule, agent non assigné, formulation interdite (FR et EN), fichier infecté, immutabilité, limite de 10 propositions, réponse du visiteur sans effet sur le statut CRM, limite de débit, retrait du consentement, réaffectation, notifications uniques, coordonnées auditées et masquées, documents internes jamais visibles du visiteur.

## Phase 1: Setup
- [x] T001 Contrats `packages/shared/contracts/lead-proposals.ts` (création, retrait, réponse visiteur, vues courtier et visiteur, mention non contractuelle FR/EN, limites), `public-quote-status.ts` (`proposals`, `activeProposalAt` → `proposal_available`), `content-safety.ts` (équivalents anglais partagés), types de notification, codes d'erreur, évènements d'historique, `contactVisibility`, métadonnées de fichier des documents CRM.
- [x] T002 Schéma + migration `0028_broker_response_loop` (`LeadProposal`, `VisitorProposalResponse`, colonnes fichier de `BrokerCrmDocument`, 2 valeurs `NotificationType`) + `prisma-migrations.spec.ts`.

## Phase 2: Backend
- [x] T003 [US1] `LeadContactPolicy` : coordonnées complètes au courtier affecté (Starter et CRM), audit de chaque consultation, masquage après retrait du consentement ou anonymisation ; contact lu depuis le prospect si l'affectation ne le porte pas.
- [x] T004 [US2] `LeadProposalsService.send` : accès par canal, lead accepté et ouvert, consentement actif, garde de suspension, garde de formulations, limite de 10 actives, PDF analysé (`storeScannedFile`), historique, audit, `devis_envoye` (CRM) et `contacted`, e-mail `visitor_proposal_available` idempotent.
- [x] T005 [US2] Retrait (seul changement d'une proposition envoyée), téléchargement courtier audité, liste avec bloqueurs et statut suggéré (CRM).
- [x] T006 [US2][US3] Espace visiteur : propositions visibles dans la vue de statut, `proposal_available`, marquage `viewed`, PDF par jeton (404 neutre, audité), fermeture après réaffectation, masquage après retrait.
- [x] T007 [US3] `visitorRespond` : validation, limites (IP, proposition), refus 409 des propositions non répondables, historique, audit, notification courtier (ligne e-mail + in-app), statut CRM jamais modifié.
- [x] T008 [US2][US3] Gabarits : `proposal_available` FR/EN avec lien neuf ; `brokerVisitorResponse` pointeur sans contenu ; worker (`DELIVERABLE_TYPES`, rendu).
- [x] T009 [US4] Documents internes CRM réels (multipart, antivirus, téléchargement audité), écriture de `BrokerCrmLeadState`, anonymisation spec 046 des propositions et réponses, correction du marquage « vu » Starter.
- [x] T010 Routes HTTP (Starter, CRM, visiteur), en-têtes `no-store`/`nosniff`, inventaire `BROKER_TENANT_WRITE_GUARDED`, câblage runtime.
- [x] T011 [P] Tests : intégration HTTP (13 scénarios), unitaires (contrats, projection, gabarits, politique de contact, immutabilité du dépôt), tests existants verts.

## Phase 3: Back-office courtier
- [x] T012 [US2] Starter : carte « Répondre au visiteur » (composeur, liste, réponses, retrait), coordonnées complètes, aucune fonction CRM.
- [x] T013 [US2][US4] CRM : onglet Propositions (statut suggéré), coordonnées complètes cliquables, assignation à un conseiller, documents internes (téléversement, liste, téléchargement), lien et page Kanban, entrée de navigation.
- [x] T014 Relais serveur (route handlers) pour l'envoi multipart, les documents et les téléchargements (contrôle d'origine, jeton jamais exposé), garde lecture seule/suspendu (`TenantWriteGuard`), tests de marqueurs.

## Phase 4: Validations
- [x] T015 Validations finales : `prisma validate`, typecheck, lint, `npx vitest run`, `npx playwright test apps/broker`, `next build` (broker), scan de secrets.
- [ ] T016 Écran visiteur des propositions dans `apps/public` (hors périmètre de cet agent : contrat exposé, livré ensuite).
