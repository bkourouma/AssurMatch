# Plan d'implémentation : Pilotage admin (spec 073)

**Spec** : `specs/073-admin-steering/spec.md`
**Dépendances** : specs 012, 036, 049, 056, 060, 061, 063 (livrées). Lot 3 (dashboard courtier, `orch/2026-10-21-ecarts-prd-lot-3`) non fusionné à la date du lot : les agrégats SLA / conversion sont **dupliqués au minimum** dans `admin-dashboard.service.ts` (fonctions privées) et signalés ; à dédoublonner après fusion du lot 3.

## Surfaces impactées
- **Backend API** : nouveau `modules/visit-stats/` ; `modules/admin-operations/admin-prospects-console.service.ts` ; `modules/dashboards/admin-dashboard.service.ts` (+ module) ; `modules/http-wiring/{admin-operations-http.controllers,runtime-http-wiring.module}.ts` ; `runtime/assurmatch-runtime.ts` (blocs `// Lot 6`).
- **Shared packages** : `contracts/dashboard.contracts.ts` (champs optionnels), `contracts/admin-operations.contracts.ts` (prospects), nouveau `contracts/visit-stats.contracts.ts`.
- **Base de données** : `backend/prisma/schema.prisma` (bloc `// Lot 6`, modèle `VisitCounter`) et migration `0036_admin_steering`.
- **Back-office Plateforme/Admin** : `app/dashboard/page.tsx`, `app/prospects/*`, `app/messaging/*`, `app/routing/*`, `app/lib/{admin-api,operations-api}.ts`, `app/lib/ui/admin-view-models.ts`.
- **Web Publique Client** : un composant client sans UI (balise de visite) et une ligne dans le layout racine.
- **Docker / runtime** : aucun.

## Architecture
```
Site public (layout)  --> VisitBeacon (client, sans cookie, DNT respecté)
                              POST /public-stats/visits {page} --> VisitStatsService.record
                                 liste fermée + plafond/min/page --> VisitCounter (day,page) += 1
Dashboard admin <-- AdminDashboardService
        visits (VisitStatsService.totalsBetween)   revenue (factures émises, super_admin)
        leadQuality (LeadDispute)                  partnerSla (affectations)
        activeCountries / activeProducts           aiSummary / aiAlerts (insights admin_platform)
Admin /prospects --> GET /admin/operations/prospects[/:id] --> AdminProspectsConsoleService (masquage, périmètre, audit)
Admin /messaging --> action serveur --> POST /admin/messaging/test (existant)
Admin /routing   --> action serveur --> POST /admin/routing/precheck (AdminRoutingPrecheckController)
```

## Découpage et propriété des fichiers
| Tâche | Agent | Fichiers possédés |
|---|---|---|
| T1 Prospects (back + front) | executant (Sonnet) | `admin-prospects-console.service.ts`, `admin-operations.contracts.ts`, `admin-operations-http.controllers.ts`, `apps/admin/app/prospects/**`, `apps/admin/app/lib/operations-api.ts`, tests |
| T2 Visites (DB + back + balise) | executant (Sonnet) | `schema.prisma` (bloc Lot 6), migration `0036_admin_steering`, `modules/visit-stats/**`, `visit-stats.contracts.ts`, balise + layout public, tests |
| T4 Contrôleurs non branchés | executant (Sonnet) | `apps/admin/app/messaging/**`, `apps/admin/app/routing/precheck*`, `routing/page.tsx` (montage), `admin-api.ts` (ajouts), route precheck dans `runtime-http-wiring.module.ts` (bloc Lot 6), tests |
| T3 KPI + dashboard (après T2) | executant (Sonnet) | `admin-dashboard.service.ts`, `dashboards.module.ts`, `dashboard.contracts.ts`, `apps/admin/app/dashboard/page.tsx`, `admin-view-models.ts`, `admin-api.ts` (types dashboard), tests |

Fichiers partagés (`runtime-http-wiring.module.ts`, `assurmatch-runtime.ts`, `schema.prisma`, `admin-api.ts`) : insertions minimales par Edit entre `// Lot 6` et `// Lot 6 (end)` ; relire avant chaque Edit.

## Décisions techniques
- Console Prospects dans le module `admin-operations` (même garde, même audit que la spec 056), pas dans `prospects` (domaine inchangé).
- Recherche par e-mail / téléphone : hachage serveur avec la fonction d'empreinte de `prospect-identity.service.ts` ; jamais de LIKE sur les valeurs normalisées.
- `VisitCounter` : upsert atomique `(day, page)` avec incrément ; dépôt mémoire pour les tests.
- Dashboard : champs additifs optionnels ; le front tolère leur absence (ancien API).
- IA : lecture seule des insights ; aucun appel fournisseur ; aucun changement de flag.

## Risques
- Gonflage du compteur par un tiers : plafond global par minute et par page ; chiffres indicatifs.
- Fusion avec le lot 3 sur `dashboard.contracts.ts` / `admin-dashboard.service.ts` : changements additifs et groupés pour limiter les conflits.
- Charge de la machine : vitest ciblé par tâche, suites complètes une seule fois à l'intégration.
