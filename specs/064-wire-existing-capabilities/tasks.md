# Tâches : brancher les capacités existantes (spec 064)

**Spec** : `spec.md` — **Plan** : `plan.md`

## Phase 1 — Backend (propriétaire : agent backend)

- [x] T001 Prisma : `PartnerCustomRole.memberIds Json @default("[]")`, migration `0032_custom_role_members`, mise à jour de `prisma-migrations.spec.ts` / `prisma-schema.spec.ts`, dépôts mémoire et Prisma.
- [x] T002 Contrats : `memberIds` sur le rôle personnalisé, schéma d'assignation et sa réponse ; `ActorContext.customRole` / `customRolePermissions`.
- [x] T003 `actorHasPermission` / `actorHasAnyPermission` (helper unique, wildcard et catalogue) + tests unitaires.
- [x] T004 `EnterpriseService` : `assignCustomRole` (garde, audit, un rôle par membre, refus des propriétaires/soi-même/autre tenant), résolveur `customRoleFor(actor)` avec cache TTL 10 s et invalidation, mise à jour d'un rôle invalide le cache.
- [x] T005 Garde d'authentification : résolution du rôle personnalisé et pose sur l'acteur (broker uniquement) ; `AssurMatchRuntime` expose le port.
- [x] T006 Politiques Starter, CRM, tableau de bord, assistance IA : usage de `actorHasPermission`.
- [x] T007 Câblage HTTP `// Spec 064` : `PUT /broker/enterprise/members/:userId/custom-role` ; `GET /broker/crm/ai/loss-analysis` (liste du tenant).
- [x] T008 Exports : audit `requested` pour le CRM, neutralisation CSV des deux exports, tests.
- [x] T009 Tests d'intégration HTTP : agent avec rôle restreint → 403 audités, effet à la requête suivante, isolation de tenant, plafond par le rôle de base, `/auth/me`, liste des analyses de pertes, inventaire des routes.

## Phase 2 — Back-office courtier (propriétaire : agent courtier)

- [x] T010 `broker-permissions.ts` / `backoffice-auth.ts` : restriction par rôle personnalisé, `canExportStarterLeads`, `canExportCrmLeads`, `canRequestLossAnalysis` ; extension de `broker-permissions.spec.ts`.
- [x] T011 Routes `app/leads/export/route.ts` et `app/crm/leads/export/route.ts` + boutons « Exporter (CSV) » (remplacent le badge).
- [x] T012 Page `/crm/loss-analysis`, actions serveur, entrée de menu CRM, états : non Enterprise, IA désactivée, opt-out, aucune analyse, en cours, terminée avec validation.
- [x] T013 Page Équipe : colonne et sélecteur de rôle personnalisé (Enterprise, propriétaires et managers), page Entreprise : membres par rôle.
- [x] T014 Charte appliquée dans l'en-tête du shell (Enterprise).
- [x] T015 Spécification Playwright « sources » du courtier.

## Phase 3 — Back-office Plateforme (propriétaire : agent admin)

- [x] T016 Carte « Analyse IA (assistance) » sur `/routing/anomalies`, action serveur, validation humaine, état désactivé, liste déterministe inchangée.
- [x] T017 Spécification Playwright « sources » de l'admin.

## Phase 3 bis — Filtre par agence et corrections de revue

- [x] T021 Backend : `agencyId` (uuid ou `none`) sur la liste, le Kanban, l'export et le tableau de bord CRM, `memberIds` des agences, port `AgencyScope`, tests d'intégration.
- [x] T022 Courtier : filtre « Agence » (défaut = agence unique du membre) sur `/crm/leads`, `/crm/kanban` et `/crm`, tests.
- [x] T023 Corrections de revue : écriture partielle des rôles, ordre d'ajout/retrait, rôle manager réservé au propriétaire, notifications, portée de l'analyse des pertes, état du bouton IA admin.

## Phase 4 — Revue et validation (superviseur)

- [x] T018 Revue sécurité / RBAC et revue QA (agents en lecture seule), corrections.
- [x] T019 `docs/prd_coverage_map.md`.
- [x] T020 Validations : typecheck, lint, vitest, Playwright, `prisma validate`, secret-scan.
