# Tasks: 065 — Parcours E2E Pro / Enterprise

## Phase 1 — Socle
- [x] T001 `specs/065-e2e-pro-enterprise/` (spec, plan, tasks).
- [x] T002 `partners.ts` : `onboardBrokerDirect` avec plan et durée de licence.
- [x] T003 `journey-state.ts` : mondes de courtiers ; `support/world.ts` : provision, équipe, offre, devis (numéro de téléphone unique par visiteur).
- [x] T004 `playwright.e2e.config.ts` : projets `pro-enterprise` et `senegal` (+ `E2E_BROWSER_CHANNEL` facultatif).
- [x] T005 Pile : `ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES=1` (alertes de licence chaque minute) ; compatibilité Windows de `e2e-stack.mjs` ; `docker-compose.e2e.desktop.yml` (Docker Desktop sans réseau hôte).

## Phase 2 — Parcours
- [x] T006 `pro-01-setup.spec.ts` : flag CRM idempotent, courtier Pro, équipe, offre, 4 leads.
- [x] T007 `pro-02-crm.spec.ts` : liste, Kanban, pipeline, note, tâche, rappel, assignation, gagné/perdu, historique, KPI.
- [x] T008 `pro-03-roles.spec.ts` : agent, lecture seule, Starter (UI et API).
- [x] T009 `pro-04-ai-disabled.spec.ts` : aucune action IA proposée ni appelée.
- [x] T010 `enterprise-agencies-sla.spec.ts` : agences, SLA courtier et admin.
- [x] T011 `forbidden-cases-pro.spec.ts` : licence (alerte J-7, tâche planifiée, suspension = exclusion), retrait de consentement.
- [x] T012 `senegal-opening.spec.ts` : ouverture SC-01 du Sénégal jusqu'à la page publique SN.

## Phase 3 — Validation
- [x] T013 `npm run typecheck`, `npx eslint tests/e2e scripts/e2e playwright.e2e.config.ts`, scan des secrets.
- [x] T014 `npm run test:e2e:stack -- --apps=host` : 65 tests verts en 14,2 min sur pile vierge (Docker Desktop, Windows).
- [ ] T015 Phase B : intégration des lots 062 à 064 (hors périmètre de cette phase).
