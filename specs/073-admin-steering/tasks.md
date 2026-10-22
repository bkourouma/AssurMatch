# Tâches : Pilotage admin (spec 073)

**Spec** : `spec.md` — **Plan** : `plan.md`

## Phase 1 — Parties indépendantes (parallèle)

### T1 Prospects
- [x] T101 Contrat `admin-operations.contracts.ts` : requête / réponse liste et détail prospect.
- [x] T102 `AdminProspectsConsoleService` : périmètre pays / produit, masquage PII, détail en clair pour `super_admin` / `support_admin` avec audit, recherche par empreinte.
- [x] T103 Routes `GET /admin/operations/prospects` et `/:id` (contrôleur + enregistrement).
- [x] T104 Écran `/prospects` (filtres, tableau, pagination, détail) et lecteur `operations-api.ts`.
- [x] T105 Tests : unitaires (masquage, périmètre), intégration HTTP (refus finance / content, audit), écran.

### T2 Visites
- [x] T201 Modèle `VisitCounter` (bloc `// Lot 6`) et migration `0036_admin_steering` ; test schéma / migration.
- [x] T202 Contrat `visit-stats.contracts.ts` (liste fermée des pages) et module `visit-stats` (service, dépôts mémoire + Prisma, plafond par minute et par page, `totalsBetween`).
- [x] T203 Route publique `POST /public-stats/visits` + câblage runtime (`// Lot 6`) + variable `ASSURMATCH_VISIT_COUNTER_ENABLED`.
- [x] T204 Balise publique sans UI (DNT, sans cookie ni stockage) et montage dans le layout.
- [x] T205 Tests : liste fermée, plafond, upsert, aucune donnée personnelle persistée, route HTTP.

### T4 Contrôleurs non branchés
- [x] T401 Route `POST /admin/routing/precheck` (enregistrement de `AdminRoutingPrecheckController`, RBAC, schéma de requête) + test HTTP.
- [x] T402 Formulaire de pré-contrôle sur `/routing` (action serveur, résultat et mention « simulation »).
- [x] T403 Bouton « Envoyer un message de test » sur `/messaging` (action serveur vers `POST /admin/messaging/test`, destinataire masqué).
- [x] T404 Tests (routes, action serveur, rendu) ; FR-021 (modules IA non branchés) documenté.

## Phase 2 — KPI et dashboard (après T2)
- [x] T301 Contrat `dashboard.contracts.ts` : champs optionnels `visits`, `visitToRequestRate`, `activeCountries`, `activeProducts`, `partnerSla`, `leadQuality`, `revenue`, `revenueRestricted`, `aiSummary`, `aiAlerts`.
- [x] T302 `AdminDashboardService` : agrégats (visites, SLA, contestations, CA réservé `super_admin`, pays / produits actifs, synthèse et alertes IA en lecture seule) + dépendances dans `dashboards.module.ts` et runtime (`// Lot 6`).
- [x] T303 Export CSV : nouvelles lignes.
- [x] T304 Écran `/dashboard` : 15 KPI du PRD §21, états « Non mesuré » / « Réservé », cartes IA avec lien `/ai-assistance`.
- [x] T305 Tests : agrégats, RBAC revenus, périmètre, absence d'appel IA, rendu.

## Phase 3 — Validation (chef de lot)
- [x] T501 `npm run typecheck`, `npm run lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `node scripts/ci/secret-scan.mjs`.
- [x] T502 Mise à jour de `docs/prd_coverage_map.md` (ligne dashboard admin / prospects) et statut de la spec.
