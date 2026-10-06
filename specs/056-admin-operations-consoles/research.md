# Research: 056 — Consoles d'exploitation admin

## Constats (audit du code, 2026-10-03)

- `AdminRuntimeSupportController.quoteRequests` renvoie `QuoteSubmissionService.list()` brut : `verificationTokenHash`, `payload` (réponses) et identifiants, sans filtre ni périmètre pays.
- `AdminRuntimeSupportController.leadAssignments` renvoie les affectations brutes, y compris `contact` et `answers`.
- `AdminQuoteRequestsController.review` modifie l'objet en mémoire (`list().find()`), sans `repository.update`, sans audit, sans route.
- `AdminAuditLogsController.list` renvoie `AuditLogWriter.all()` : uniquement les entrées écrites depuis le démarrage du processus. En production la table `AuditLog` n'est jamais relue.
- `ContactMessagesRepository` n'a ni `findById` ni `update` ; le statut reste `new`.
- `GET /admin/routing/anomalies` (spec 049) et `GET /admin/routing-rules/:id/history` existent ; aucune liste des `RoutingDecision`.
- `ManualRoutingService.assign` et `QuoteSubmissionService.assignManually` n'acceptent que `pending_manual_assignment` ; une demande `manual_review` (produit à revue obligatoire) n'a aucun chemin de sortie.
- La branche de base ne contient pas encore les specs 050 à 052 (`writeAdminResult`, `catalog-action-result.tsx`) : le pattern est reproduit dans un module admin dédié pour limiter les conflits de fusion.

## Décisions

### R1 — Module backend dédié `admin-operations`
Nouveau dossier `backend/src/modules/admin-operations/` : accès (RBAC, périmètre, masquage), console des demandes, revue, affectations, journaux d'audit, historique de routage. Les contrôleurs HTTP vivent dans `http-wiring/admin-operations-http.controllers.ts` et sont enregistrés dans `RuntimeHttpWiringModule` (une ligne), pour isoler le diff du gros fichier de câblage.

### R2 — Routes
Nouvelles routes sous `/admin/operations/*` (réponses paginées `{ items, total, page, pageSize }`). Les routes historiques gardent leur forme (tableau) pour ne pas casser la fumée Postgres ni les tests existants, mais renvoient désormais des lignes assainies (FR-009). Statut des messages : `POST /admin/contact-messages/:id/status`. Historique : `GET /admin/routing/history`.

### R3 — RBAC (matrice inchangée)
| Action | Permission / rôles |
|---|---|
| Lister/détailler les demandes | `quote_requests:read` ∩ {super_admin, admin_pays, compliance_admin, support_admin} |
| File de revue | idem lecture |
| Décision `route` / `assign` | `lead_assignments:update` (super_admin, admin_pays) |
| Décision `non_routable` / `duplicate` | `quote_requests:update` ou `lead_assignments:update` (super_admin, compliance_admin, admin_pays) |
| Affectations | `lead_assignments:read` ∩ mêmes rôles ; réaffectation existante (`lead_assignments:update`) |
| Messages de contact | super_admin, compliance_admin, support_admin (règle existante du module) |
| Journaux d'audit (lecture) | super_admin, compliance_admin, support_admin (règle existante) |
| Export d'audit | super_admin, compliance_admin |
| Historique de routage | `routing_rules:read` |

Aucune permission n'est ajoutée à la matrice partagée (choix : éviter un changement transverse concurrent des specs 050-055). Toutes les routes exigent la MFA (garde HTTP) et les services la revérifient.

### R4 — Périmètre
Même règle que `ManualRoutingService` : super_admin voit tout ; sans `countryScopes`, pas de restriction ; sinon le pays (id ou code ISO) doit y figurer. `productScopes` est appliqué de la même façon. Un détail hors périmètre répond 403 et est audité `refused`.

### R5 — Masquage
Support Admin : e-mail et téléphone masqués (`a***@d***`), réponses du formulaire remplacées par `[masque]` (clés conservées). Les autres rôles admin voient les coordonnées (traitement de la demande, litiges). Jamais exposés : `verificationTokenHash`, empreintes, `ipHash`, contenu des documents.

### R6 — Revue manuelle
- Ouverte si `status = manual_review` ou `routingStatus ∈ {manual_review_required, pending_manual_assignment}`, et statut non terminal (`routed`, `non_routable`, `duplicate`, `cancelled`, `spam_blocked`) ; sinon 409.
- `route` : vérifie le consentement (`ConsentService.findRecord`, statut `granted`), puis `QuoteSubmissionService.routeAfterReview` relance `QuoteRoutingService.route` et applique l'issue comme à la soumission (routé, non routable, ou parqué `pending_manual_assignment` par une règle manuelle), notifie les courtiers, résumé IA si autorisé.
- `assign` : consentement, puis `assignManually` (élargi aux états de revue) → éligibilité vérifiée par le routage ; partage des documents (`QuoteDocumentsService.shareForAssignment`).
- `non_routable` / `duplicate` : `RoutingDecision` `blocked` (raisons `admin_review_non_routable` / `admin_review_duplicate`), statut et `refusalReason`, `duplicateStatus = blocked_duplicate` pour un doublon.
- Toujours : `reviewedAt`, `reviewedById`, `manualReviewReason` persistés ; audit `admin_operations.quote_review_decided` (ou `..._refused`).
- Notification visiteur : `QuoteSubmissionService.notifyVisitorOfReviewOutcome` appelle `QuoteNotificationService.queueVisitor` (point d'accroche existant, dédupliqué par processus). La spec 054 retravaille le contenu par statut ; aucun fichier du module notifications n'est modifié.
- L'ancienne méthode non persistée `AdminQuoteRequestsController.review` est supprimée.

### R7 — Journaux d'audit
`AuditLogRepository.search(filter, page)` : mémoire (filtre des entrées) et Prisma (`findMany` + `count`, tri `occurredAt desc`). Filtres : `actorId`, `action` (préfixe), `targetType`, `targetId`, `result`, `from`, `to`. Taille de page ≤ 200. Export : ≤ 5 000 lignes, CSV échappé (guillemets, anti-injection de formules), audit `audit_log.exported` avec filtres et nombre de lignes. Le contexte exporté est celui déjà masqué à l'écriture.

### R8 — Messages de contact
`ContactMessagesRepository.findById/updateStatus` ; colonnes `handledAt`, `handledById`, `statusReason`. Audit `contact_message.status_updated` (ancien et nouveau statut, sans contenu). Réponse par e-mail : lien `mailto:` côté écran (aucun envoi serveur, pas de nouveau type de notification).

### R9 — Migration `0025_admin_operations`
`QuoteRequest` (+3 colonnes, index `duplicateOfQuoteRequestId`), `ContactMessage` (+3 colonnes), index `AuditLog` (`occurredAt`, `action+occurredAt`, `targetType+targetId`, `actorId+occurredAt`). Additive, idempotente (`IF NOT EXISTS`), aucune perte de données. Numéro choisi par le superviseur ; renumérotation possible à la fusion.

### R10 — Interfaces admin
Lecture côté serveur via `apps/admin/app/lib/operations-api.ts` (aucune modification d'`admin-api.ts`, fichier très partagé) ; mutations via server actions qui renvoient `{ status, message, code }` sans lever (pattern `writeAdminResult` des specs 050-052). Filtres par `searchParams` (formulaires GET), pagination par liens.

### R11 — Hors périmètre
H-07, H-08, H-09 ; analyse IA des anomalies dans l'écran ; envoi d'e-mail de réponse aux messages de contact ; notification visiteur par statut (spec 054).

## Écarts retenus à l'implémentation (2026-10-03)

- **Validation Playwright** : la configuration racine ignore `**/.claude/**`, chemin de ce worktree. Les tests `apps/admin` ont été lancés avec une configuration temporaire identique sans cet ignore (non commitée) ; depuis la racine du dépôt principal, `npx playwright test apps/admin` les exécute normalement.
- **Revue `route` sur une règle manuelle** : si une règle `manual` couvre le périmètre, la demande passe `created` / `pending_manual_assignment` et reste dans la file pour une assignation (pas de transmission implicite).
- **Notification visiteur** : point d'accroche unique `QuoteSubmissionService.notifyVisitorOfReviewOutcome` → `queueVisitor` (dédupliqué par processus) ; la spec 054 doit y brancher le message par statut.
- **Affectations et décisions** : filtrées en mémoire puis paginées par l'API (volume V1) ; seuls les journaux d'audit sont paginés en base.
- **Offre choisie** : l'issue (`retained` / `not_retained` / `pending`) est calculée à partir des affectations, la base n'ayant pas encore le `selectedOfferOutcome` de la spec 052.
- **`GET /admin/audit-logs`** (forme tableau) lit désormais le dépôt durable : 200 entrées les plus récentes par défaut, filtres acceptés.
