# Plan d'implémentation : brancher les capacités existantes (spec 064)

**Spec** : `specs/064-wire-existing-capabilities/spec.md`
**Dépendances** : spec 040 (Enterprise), 035/036 (IA courtier/admin), 049 (anomalies), 053 (équipe), 055 (boucle de réponse), 061 (alertes).
**Contexte parallèle** : le lot 063 possède la fiche lead CRM détaillée (`apps/broker/app/crm/leads/[leadAssignmentId]/**`), la facturation courtier/admin et l'authentification/MFA. Ce lot n'y touche pas (le panneau `lead-ai-panel.tsx` n'est lu que comme modèle).

## Surfaces impactées

- **Backend API** : `modules/common` (type `ActorContext`, helper de permission), `modules/auth/guards/http-auth.guard.ts` (résolution du rôle personnalisé), `modules/enterprise/*` (assignation, résolveur, cache), `modules/leads/*-access-policy.ts`, `modules/dashboards/dashboards-access-policy.ts`, `modules/ai/ai-assistance.service.ts` et `broker-ai.service.ts` (liste des analyses de pertes), `modules/leads/*-export-policy.ts` (audit, neutralisation CSV), `modules/http-wiring/runtime-http-wiring.module.ts` (blocs `// Spec 064`), `runtime/assurmatch-runtime.ts`.
- **Shared packages** : `packages/shared/contracts/enterprise.contracts.ts` (assignation, `memberIds`), `packages/shared/rbac/` (helper partagé si utile, sinon helper backend).
- **Base de données** : `backend/prisma/schema.prisma` + migration `0032_custom_role_members` (colonne JSON additive).
- **Broker Back-office** : `app/leads/page.tsx`, `app/crm/leads/page.tsx` (boutons d'export, hors fiche détail), `app/leads/export/route.ts`, `app/crm/leads/export/route.ts`, `app/crm/loss-analysis/page.tsx`, actions serveur `lib/loss-analysis-actions.ts`, `lib/enterprise-actions.ts`, `app/team/*`, `lib/broker-permissions.ts`, `lib/backoffice-auth.ts`, `lib/broker-api.ts`, `layout.tsx` + `lib/ui/broker-shell.tsx` (charte, menu).
- **Back-office Plateforme** : `apps/admin/app/routing/anomalies/page.tsx`, `lib/routing-anomaly-actions.ts` (nouveau), lecture seule de `lib/admin-api.ts` / `operations-api.ts`.
- **Web Publique Client / runtime-Docker** : aucun changement.

Les parcours publics et authentifiés restent séparés : rien n'est ajouté à `apps/public`.

## Architecture

### 1. Exports CSV (FR-001/002)
```
Bouton « Exporter (CSV) » (lien GET, filtres en query)
  → apps/broker route /leads/export | /crm/leads/export   (cookie httpOnly → Bearer)
  → GET /broker/starter/leads/export.csv | /broker/crm/leads/export.csv
  → *ExportPolicy.assertCanExport (permission, audit refus) → toCsv (audit requested + completed, neutralisation formule)
```
Visibilité : `canExportStarterLeads(profile)` = `broker_leads:export` ; `canExportCrmLeads(profile)` = `broker_crm:export` ou `broker_crm:*`, tous deux après restriction par le rôle personnalisé.

### 2. Analyse des pertes (FR-003)
```
/crm/loss-analysis (Enterprise) ── action serveur ──▶ POST /broker/crm/ai/loss-analysis  (existant)
                                └── lecture ───────▶ GET  /broker/crm/ai/loss-analysis   (nouveau : analyses du tenant, 10 dernières)
                                └── validation ────▶ POST /broker/crm/ai/interactions/:id/validation (existant)
état « désactivé » ◀── GET /broker/crm/ai/assistance (enabled, availableAssistTypes)
```
Contrat `GET /broker/crm/ai/loss-analysis` : `AiInteraction[]` (DTO existant), filtré sur `surface = broker_crm`, `assistType = loss_analysis`, `partnerTenantId = acteur`, tri décroissant, `assertCrmAccess`, audit lecture existant.

### 3. Analyse IA des anomalies (FR-004)
`/routing/anomalies` garde sa lecture déterministe inchangée. Une carte supplémentaire lit `readAdminAIAssistance()` (flag `ai_routing_anomaly_detection_enabled`) et `listAdminAiInsights()` (filtré `routing_anomaly_analysis`), l'action serveur appelle `POST /admin/routing/anomalies/analyze` (`routing_rules:read` + `ai:*`), la validation appelle `POST /admin/ai/insights/:id/validation`. Toute erreur de la carte IA est locale : la liste des anomalies s'affiche toujours.

### 4. Rôles personnalisés Enterprise (FR-005 à FR-008)
```
PUT /broker/enterprise/members/:userId/custom-role {customRoleId|null, reason}
   → EnterpriseService.assignCustomRole  (MFA, Enterprise, broker_team:write, même tenant, ni soi-même ni propriétaire)
   → PartnerCustomRole.memberIds (un seul rôle par membre), audit, cache.invalidate(userId)

requête courtier ─▶ AuthRequiredHttpGuard ─▶ customRoleAccess.resolve(actor)  (cache 10 s, invalidé)
                       │   actor.customRole = {id,name}; actor.customRolePermissions = effectivePermissions(...)
                       ▼
        BrokerStarter/Crm/Dashboards/AiAssistance policies ─▶ actorHasPermission(actor, permission)
                  = rôle de base accorde  ET  (pas de restriction  OU  permission hors catalogue  OU  permission ∈ customRolePermissions)
        /auth/me renvoie l'acteur ⇒ l'UI applique la même règle (broker-permissions.ts)
```
Règles de `actorHasPermission` : un requête sur un wildcard de ressource du catalogue (`broker_crm:*`) est refusée sous restriction ; ressources hors catalogue (`broker_offers`, `broker_account`, `broker_team`, `billing`) inchangées. Les propriétaires ne portent jamais de rôle personnalisé (ni assignable, ni appliqué si une ligne orpheline existait : le résolveur l'ignore).

Contrats :
- `PartnerCustomRole.memberIds: string[]` (ajout, tenant interne).
- Réponse d'assignation : `{ userId, customRole: { id, name } | null }`.
- `ActorContext` : `customRole?: { id: string; name: string }`, `customRolePermissions?: string[]`.

### 4 bis. Filtre par agence (FR-011)
```
Page CRM (?agence=all|none|<uuid>) ─▶ GET /broker/crm/leads|leads/kanban|leads/export.csv|dashboard , /broker/dashboard(/advisors) ?agencyId=
   BrokerCrmLeadsService / BrokerDashboardService ─▶ politiques d'accès (inchangées) ─▶ AgencyScopePort.resolve(actor, agencyId)
       = predicate(advisorId) : membership PartnerAgency.memberIds du conseiller assigné ; `none` = sans conseiller ou sans agence
```
Filtre d'affichage uniquement, ignoré hors Enterprise, 404 si l'agence n'est pas celle du tenant ; l'analyse des pertes ne l'utilise pas.

### 5. Charte (FR-009)
`layout.tsx` lit la charte (`readBrokerBranding`) uniquement pour `partnerPlan === "enterprise"` et la passe au shell : libellé en sous-titre de marque, couleur en variable CSS locale si le contraste avec le texte est suffisant ; la mention plateforme reste affichée. Échec silencieux (charte par défaut).

## Impacts transverses
- **Sécurité** : l'autorité reste le backend ; l'UI ne fait que masquer. Aucun nouvel accès inter-tenant (assignation et lecture bornées au tenant de l'acteur, 404 neutre). CSV : neutralisation des formules, plafond de lignes existant, pas de PII.
- **Conformité** : contenus IA marqués « assistance », validation humaine obligatoire, aucune décision de routage/éligibilité automatique, libellés sans promesse.
- **Données** : migration additive (colonne JSON avec défaut) ; pas de suppression.
- **Feature flags** : aucun nouveau flag ; IA gouvernée par `ai_broker_assistant_enabled`, `ai_routing_anomaly_detection_enabled`, opt-out partenaire, plan Enterprise.
- **Audit** : `enterprise.custom_role_assigned|unassigned`, refus `enterprise.access_refused`, exports `*.export_requested|completed|refused`, lectures IA existantes.

## Validation
`npm run typecheck`, `npm run lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `prisma validate`, `node scripts/ci/secret-scan.mjs`.
