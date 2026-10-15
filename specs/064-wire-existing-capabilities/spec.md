# Feature Specification: Brancher les capacités existantes (exports de leads, analyse des pertes, analyse IA des anomalies de routage, rôles personnalisés Enterprise)

**Status**: Validated (lot 2 « brancher l'existant », mandaté par le superviseur du projet le 2026-10-15 ; spec standard, aucun `[NEEDS CLARIFICATION]`)
**Input**: PRD §6.3, §10.2, §10.3, §18, §19 CRM-010, §29 ; specs 012, 035, 036, 040, 049. Dépend des specs 040, 049, 053 (équipe), 055.
**Impacted surfaces**: Backend API (RBAC des routes courtier, assignation de rôle personnalisé, liste des analyses de pertes, durcissement CSV), Broker Back-office (listes de leads, page d'analyse des pertes, page Équipe, charte), Back-office Plateforme (page des anomalies de routage), shared packages (contrats Enterprise, RBAC), base de données (migration `0032_custom_role_members`, additive). **Web Publique Client : aucun changement** (la charte reste interne au back-office courtier).

## Why
Quatre capacités existent côté backend mais restent inatteignables ou non appliquées :

1. Les routes `GET /broker/starter/leads/export.csv` et `GET /broker/crm/leads/export.csv` n'ont aucun appelant : les listes n'affichent qu'un badge « Export contrôlé ».
2. `POST /broker/crm/ai/loss-analysis` (PRD §10.2, Enterprise) n'a pas d'écran.
3. `POST /admin/routing/anomalies/analyze` (`routing_anomaly_analysis`, spec 049) n'a pas d'écran admin.
4. `EnterpriseService.effectivePermissions` n'est jamais appelée : les rôles personnalisés sont stockés mais ni assignables ni appliqués. Une organisation Enterprise croit restreindre un agent alors que rien n'est vérifié.

## User stories
1. **(P1) Courtier autorisé.** Il exporte en CSV la liste des leads Starter ou CRM depuis l'écran, avec les filtres actifs. Le bouton n'apparaît que si son rôle (et son rôle personnalisé) porte la permission d'export. Chaque export est audité côté backend.
2. **(P1) Courtier Enterprise.** Il lance une analyse IA des leads perdus sur 90 jours, lit le résultat étiqueté « assistance IA », puis le valide ou l'écarte. L'écran est désactivé quand les flags IA sont coupés, et indisponible hors plan Enterprise.
3. **(P1) Admin plateforme.** Depuis la page des anomalies, il demande une « Analyse IA (assistance) », lit le résultat, le valide ou l'écarte. Rien n'est appliqué automatiquement (PRD §32.8). La liste déterministe des anomalies reste utilisable quoi qu'il arrive.
4. **(P1) Propriétaire ou manager Enterprise.** Depuis la page Équipe, il attribue un rôle personnalisé à un manager, un agent ou un lecteur. Dès la requête suivante, les permissions de ce membre sont l'intersection de son rôle de base et du rôle personnalisé ; un agent restreint reçoit 403 sur ce qui n'est plus accordé et ne voit plus les actions interdites.
5. **(P2) Charte.** Le libellé et la couleur de charte d'un cabinet Enterprise sont appliqués dans l'en-tête du back-office courtier, avec la mention « Plateforme technique AssurMatch » toujours visible.

## Requirements
- **FR-001 (exports).** Gestionnaires de routes Next `GET /leads/export` et `GET /crm/leads/export` dans `apps/broker`, modélisés sur `reports/export/route.ts` (jeton en cookie httpOnly, 401 sans session, aucune fuite d'erreur), qui relaient les filtres vers l'API et renvoient `text/csv` en pièce jointe. Bouton « Exporter (CSV) » sur `/leads` et `/crm/leads`, affiché seulement si l'utilisateur a `broker_leads:export` (Starter) ou `broker_crm:export` / `broker_crm:*` (CRM) après application du rôle personnalisé. La politique backend reste l'autorité (403 audité).
- **FR-002 (audit et durcissement des exports).** Chaque export audite la demande (`requested`) et la fin (`completed`, nombre de lignes, filtres) ; l'export CRM gagne l'audit `requested` manquant. Les cellules CSV commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot sont neutralisées (injection de formule). Aucune donnée de contact dans les CSV (inchangé).
- **FR-003 (analyse des pertes).** Page `/crm/loss-analysis` (entrée de menu CRM), réservée au plan Enterprise côté UI et côté API (garde de la passerelle IA), libellée « Assistance IA », état désactivé et explicite quand les flags ou l'opt-out partenaire coupent l'IA, aucune donnée de contact envoyée (déjà garanti). Action serveur « Lancer l'analyse », lecture des analyses récentes via un nouvel endpoint `GET /broker/crm/ai/loss-analysis` (tenant courant uniquement), validation humaine avec le motif existant (`/broker/crm/ai/interactions/:id/validation`). Aucune décision automatique.
- **FR-004 (analyse IA des anomalies).** Sur `/routing/anomalies` : carte « Analyse IA (assistance) », bouton désactivé avec explication quand `ai_routing_anomaly_detection_enabled` (ou l'assistance admin) est coupé ou que le rôle n'a pas `ai:*`, action serveur vers `POST /admin/routing/anomalies/analyze`, affichage des analyses récentes de ce type avec statut, texte, validation humaine « Valider / Écarter ». Aucun lien d'exécution : la réaffectation reste l'action humaine existante.
- **FR-005 (rôles personnalisés : stockage).** Migration additive `0032_custom_role_members` : colonne `memberIds Json @default("[]")` sur `PartnerCustomRole`. Un membre porte au plus un rôle personnalisé du même tenant.
- **FR-006 (rôles personnalisés : assignation).** `PUT /broker/enterprise/members/:userId/custom-role` `{ customRoleId: uuid | null, reason }` : MFA, plan Enterprise, permission `broker_team:write` (propriétaire ou manager), membre du même tenant (404 sinon), jamais soi-même, jamais un propriétaire (le rôle propriétaire reste une décision AssurMatch), rôle du même tenant. Audit `enterprise.custom_role_assigned` / `enterprise.custom_role_unassigned` (avant/après, motif) et refus audités. `GET /broker/enterprise/roles` expose `memberIds`.
- **FR-007 (rôles personnalisés : application).** Le garde d'authentification résout, à chaque requête d'un utilisateur courtier, le rôle personnalisé du membre et pose sur l'acteur `customRole` (id, nom) et `customRolePermissions` (permissions effectives = `effectivePermissions` : intersection du rôle de base et du rôle personnalisé, plafonnée au catalogue `brokerCustomPermissions`). Cache court (TTL 10 s) invalidé immédiatement à chaque assignation, modification ou retrait de rôle (effet à la requête suivante). Les politiques d'accès Starter, CRM, tableau de bord et assistance IA utilisent un helper unique `actorHasPermission` qui applique cette restriction ; les permissions hors catalogue (offres, société, équipe, facturation) restent celles du rôle de base. Jamais d'élévation : un rôle personnalisé ne fait que restreindre.
- **FR-008 (rôles personnalisés : UI).** `GET /auth/me` expose `customRole` et `customRolePermissions` ; l'UI courtier applique la même restriction (`hasPermission`) et masque les actions interdites. Page Équipe : colonne « Rôle personnalisé » et sélecteur d'attribution pour les propriétaires et managers d'un cabinet Enterprise.
- **FR-009 (charte).** Pour un cabinet Enterprise, l'en-tête du back-office courtier affiche le libellé de charte et la couleur principale (avec garde de contraste) tout en gardant « Plateforme technique AssurMatch » visible. Aucune lecture de la charte par l'app publique.
- **FR-010 (tests).** Tests unitaires (helper, intersection, CSV), intégration HTTP (assignation, 403 d'un agent restreint, effet à la requête suivante, isolation de tenant, export audité, liste des analyses de pertes), contrats, inventaire de routes, migration, et spécifications Playwright « sources » côté courtier et admin.

## Hors périmètre (documenté)
- **Filtre CRM / tableau de bord par agence (PRD §6.3).** Les agences sont des regroupements internes sans lien avec les leads : filtrer ou borner la visibilité par agence est une décision produit (visibilité des managers, membre dans plusieurs agences, leads non assignés). Non réalisé ; **DÉCISION À CONFIRMER**.
- Domaine personnalisé et white label public : inchangés (la charte reste interne, constitution Principe I).
- Ancien contrôleur `backend/src/runtime/runtime-http.controller.ts` (non utilisé par l'application Nest) : non modifié.

## Décisions à confirmer
- **D1** Export Starter : conservé tel que la politique actuelle (permission `broker_leads:export`, donc propriétaire Starter ou Pro) ; le PRD le qualifie d'« optionnel ».
- **D2** L'assignation d'un rôle personnalisé est ouverte aux propriétaires **et** managers Enterprise (`broker_team:write`), alors que la création/modification des rôles reste réservée au propriétaire (spec 040).
- **D3** Un rôle personnalisé ne restreint que le catalogue leads/CRM/notifications ; offres, société, équipe et facturation suivent le rôle de base.
- **D4** Le rôle personnalisé reste appliqué si le cabinet quitte le plan Enterprise (il ne peut que restreindre).
- **D5** Un seul rôle personnalisé par membre ; jamais sur un propriétaire.
- **D6** Filtre par agence : hors périmètre (voir ci-dessus).
- **D7** Charte appliquée au seul en-tête du back-office courtier, pour le plan Enterprise.

## Success criteria
- 0 appelant manquant : les deux CSV sont atteignables depuis l'UI par les seuls rôles autorisés, et audités.
- Un agent avec un rôle personnalisé restreint reçoit 403 (audité) sur les routes non accordées à la requête qui suit l'assignation.
- Analyse des pertes et analyse des anomalies : jamais d'application automatique, validation humaine obligatoire, état désactivé testé.
