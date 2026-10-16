# Tasks: 065 — Parcours E2E Pro / Enterprise

## Phase 1 — Socle
- [x] T001 `specs/065-e2e-pro-enterprise/` (spec, plan, tasks).
- [x] T002 `partners.ts` : `onboardBrokerDirect` avec plan et durée de licence.
- [x] T003 `journey-state.ts` : mondes de courtiers ; `support/world.ts` : provision, équipe, offre, devis.
- [x] T004 `playwright.e2e.config.ts` : projets `pro-enterprise` et `senegal`.

## Phase 2 — Parcours
- [ ] T005 `pro-01-setup.spec.ts` : flag CRM idempotent, courtier Pro, équipe, offre, 4 leads.
- [ ] T006 `pro-02-crm.spec.ts` : liste, Kanban, pipeline, note, tâche, rappel, assignation, gagné/perdu, historique, KPI.
- [ ] T007 `pro-03-roles.spec.ts` : agent, lecture seule, Starter (UI et API).
- [ ] T008 `pro-04-ai-disabled.spec.ts` : aucune action IA proposée ni appelée.
- [ ] T009 `enterprise-agencies-sla.spec.ts` : agences, SLA courtier et admin.
- [ ] T010 `forbidden-cases-pro.spec.ts` : licence expirée, retrait de consentement.
- [ ] T011 `senegal-opening.spec.ts` : ouverture SC-01 du Sénégal.

## Phase 3 — Validation
- [ ] T012 `npm run typecheck`, `npx eslint tests/e2e`, `npm run test:e2e:stack` vert, durées relevées.
- [ ] T013 Rapport de lot (défauts produits, flakiness, besoins phase B).
