# Plan d'implémentation : écarts PRD du back-office courtier (spec 069)

**Spec** : `spec.md`. **Surfaces** : Backend API, Back-office Courtier (`apps/broker`), packages partagés (contrats), feature flags. Web Publique et Back-office Plateforme inchangés.

## Architecture

- **KPI (FR-001/002)** : `backend/src/modules/dashboards/broker-dashboard-kpis.ts` (calcul pur) alimenté par `BrokerDashboardService.buildCrm` ; faits CRM chargés une fois par appel (lecture parallèle bornée). Section `crm` jamais pour le Starter ; hors lecture CRM sur tout le tenant, calcul limité aux leads assignés ; `leadCost` réservé à `billing:read_own`.
- **Vue agences (FR-003)** : `GET /broker/dashboard/agencies`, Enterprise, `broker_crm:read|*` (rôles personnalisés spec 064), flag `broker_crm_enabled`, accès et refus audités ; même règle pour le bloc agences du CSV.
- **IA (FR-004)** : `BrokerAiService` + passerelle centrale (`performance_summary`, `manager_assistant`, `lead_score` approuvés) ; flags fermés par défaut ; agrégats minimisés (`boundAggregates`).
- **Liste CRM (FR-007)** : filtres, tri (dont `priority` calculé côté serveur sur tout le jeu filtré) et pagination dans `BrokerCrmLeadsService`.
- **Assignation (FR-006)** : annuaire utilisateurs obligatoire côté API (fail-closed), refus d'un autre cabinet ou d'un compte suspendu/verrouillé/supprimé ; sélecteur alimenté par `GET /broker/team`.
- **Alertes (FR-008)** : worker `scheduled-alerts` ; `broker_lead_expiring` (clé `broker_lead_expiring:<lead>`) et `broker_weekly_summary` (clé `<tenant>:<semaine ISO>`, déduplication testée avant tout appel IA) ; migration additive `0039_broker_lead_alerts`.
- **Back-office courtier** : section KPI, vue `/enterprise/agencies` (lien selon plan et permission), panneau IA (tableau de bord et `/crm`), liste CRM pilotée par l'URL, Kanban glisser-déposer + menu clavier (`kanban-board.tsx`, logique pure dans `kanban-moves.ts`, server action relayant la session).

## Fichiers partagés
`backend/prisma/schema.prisma` (enum, bloc Lot 3), `backend/src/modules/http-wiring/runtime-http-wiring.module.ts` (routes Lot 3), `backend/src/runtime/assurmatch-runtime.ts` (ports).

## Validation
`npx tsc -p tsconfig.base.json --noEmit`, `npx eslint .`, `npx vitest run`, `npx playwright test apps/broker`.
