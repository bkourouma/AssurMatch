# Tâches : écarts PRD du back-office courtier (spec 069)

**Spec** : `spec.md` ; **Plan** : `plan.md`

## Backend

- [x] T001 Contrats partagés (dashboard `kpis`/`agencies`, IA `performance_summary`/`manager_assistant`, ops types de notification) et type système `weekly_summary` hors `brokerAssistTypes`.
- [x] T002 KPI §20 : conversion gagnés/reçus, taux de contact, délai de premier contact, taux de qualification, devis envoyés (hors retirés), sources, coût par lead (estimation, sans repli sur un autre pays).
- [x] T003 Export CSV : KPI, sources, agences, en-têtes par section, neutralisation des formules, aucune identité de prospect.
- [x] T004 `GET /broker/dashboard/agencies` : Enterprise, permission CRM tenant, flag CRM, audit accès et refus.
- [x] T005 IA courtier : résumé de performance, assistant manager, scores de priorité approuvés ; flags fermés (`default-flags.ts`, `seed.ts`, `feature-flags.defaults.json`) ; validation conditionnée au droit de lecture.
- [x] T006 Liste CRM serveur : filtres, tri `priority`, pagination ; assignation fail-closed (autre cabinet, compte indisponible).
- [x] T007 Alertes planifiées `broker_lead_expiring` et `broker_weekly_summary` (idempotentes, dédup avant IA, cible SLA = minimum contrat/courtier), migration `0039_broker_lead_alerts`.
- [x] T008 Câblage HTTP et runtime (blocs `// Lot 3`).
- [x] T009 Tests unitaires et d'intégration HTTP (rôles personnalisés, Starter, flags, audit, runtime des alertes).

## Back-office courtier

- [x] T010 Section KPI du tableau de bord et de `/crm` ; conversion « gagnés / reçus ».
- [x] T011 Vue `/enterprise/agencies` et lien de navigation selon plan et permission.
- [x] T012 Panneau IA (tableau de bord et `/crm`), étiqueté assistance IA, validation humaine, carte manager conditionnée à son propre flag.
- [x] T013 Liste CRM pilotée par l'URL (filtres serveur, tri `aria-sort`, pagination), colonne « Priorité IA ».
- [x] T014 Kanban glisser-déposer + menu clavier, motif pour les statuts de sortie, annulation sur refus, focus et annonces ; sélecteur de conseillers par noms.
- [x] T015 Tests Playwright « sources » et logique pure (`crm-dashboard-gaps`, `kanban-dnd`, `kanban-behaviour`).

## Validation
- [x] T016 Typecheck, lint, vitest complet, Playwright broker.
