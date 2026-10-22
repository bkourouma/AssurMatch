# Tâches : Lot 5 — routage et facturation (071)

Légende : `[ ]` à faire · `[x]` terminé. Propriétaires d'écriture : LEAD (chef de lot), RT (routage backend), BL (facturation backend), PC (G-06 backend), UI (admin + courtier), WR (câblage).

## Phase 0 — Spec Kit et fondations (LEAD)

- [x] T001 `spec.md`, `plan.md`, `tasks.md`
- [x] T002 Schéma Prisma + migration `0035_routing_billing_gaps` + `prisma generate` / `validate`
- [x] T003 Contrats partagés (`routing-rule`, `billing`, `billing-addons`, `billing-plan-change`), actions d'audit, permissions RBAC, ports de contrôles de routage

## Phase 1 — Routage (RT)

- [x] T010 Contrôles 9 et 11 dans l'éligibilité (raisons testées en inclusion / exclusion)
- [x] T011 Contrôle 10 : dégradation SLA (jamais d'exclusion), visible dans la décision
- [x] T012 Contrôle 12 : score qualité, revue manuelle sous le seuil (H3)
- [x] T013 Verrou de quota + test de concurrence
- [x] T014 Audit `routing.broker_excluded`
- [x] T015 Mode `ai_assisted` fermé par défaut, suggestion jamais appliquée seule, audits

## Phase 2 — Facturation (BL, PC)

- [x] T020 Frais d'installation une seule fois (H4)
- [x] T021 Add-ons : prix désactivés par défaut, affectation finance auditée, lignes de brouillon, relevé courtier
- [x] T022 Non-doublon fondé sur `duplicateStatus`
- [x] T023 Abonnement (état commercial et expiration du contrat)
- [x] T024 G-06 : demande de changement de plan (courtier), décision admin, effet au prochain cycle

## Phase 3 — Interfaces (UI)

- [x] T030 Admin facturation : add-ons, abonnement, demandes de plan, libellés des lignes
- [x] T031 Admin routage : mode IA assistée, file enrichie, raisons traduites
- [x] T032 Courtier : « Changer de plan » et libellés des lignes

## Phase 4 — Câblage et validation (WR, LEAD)

- [ ] T040 Câblage `billing.module.ts`, `assurmatch-runtime.ts`, routes HTTP (bloc `// Lot 5 (spec 071)`)
- [ ] T041 Tests d'intégration (G-06 de bout en bout, add-ons, abonnement suspendu exclu)
- [ ] T042 Validations finales : `typecheck`, `lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `prisma validate`, `secret-scan`
