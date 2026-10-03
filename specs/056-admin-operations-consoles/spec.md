# Feature Specification: Consoles d'exploitation admin — demandes de devis, revue manuelle persistée, affectations, messages de contact, journaux d'audit, anomalies et historique de routage

**Feature Branch**: `worktree-agent-a0abbef3c0567b000` (branche de session imposée)
**Created**: 2026-10-03
**Status**: Validated (délégation autonome du superviseur, 2026-10-03)
**Input**: PRD v0.3, EPIC H (H-01 à H-06 ; H-07 et H-08 optionnels P2, non retenus ici), scénario SC-09 « Cas interdits de conformité ». Audit du code du 2026-10-03 :
- `GET /admin/quote-requests`, `GET /admin/lead-assignments`, `GET /admin/contact-messages`, `GET /admin/audit-logs` et les routes d'anomalies et d'historique de routage existent, mais les pages admin sont statiques ou absentes ;
- `AdminQuoteRequestsController.review` modifie l'objet en mémoire sans persistance et n'a aucune route ;
- les messages de contact n'ont aucune mise à jour de statut ;
- la liste des journaux d'audit renvoie tout, sans filtre ni pagination, et uniquement depuis la mémoire du processus (`AuditLogWriter.all()`), donc vide après redémarrage en production.

**Validation State**: Validated (le superviseur a délégué la spec de bout en bout, sans question).
**Continuous Workflow Eligible**: Yes. Aucun marqueur `[NEEDS CLARIFICATION]` ; les choix raisonnables sont documentés dans [research.md](./research.md).

## Why this spec exists

L'exploitation quotidienne de la plateforme se fait aujourd'hui en base de données ou par appels d'API manuels :

- **Demandes de devis invisibles** : la page `/quote-requests` est un texte statique. Aucun opérateur ne voit le consentement, la décision de routage, les candidats exclus ni les affectations d'une demande.
- **Revue manuelle non persistée** : une demande `manual_review` ne peut pas être traitée. La méthode existante modifie un objet en mémoire et n'est exposée par aucune route : la décision est perdue et n'est pas auditée.
- **Affectations statiques** : la page `/lead-assignments` n'affiche rien ; la réaffectation n'existe que comme formulaire à UUID sur la page Routage.
- **Messages de contact sans suivi** : aucun écran, aucun statut traité/spam.
- **Journaux d'audit inexploitables** : pas de filtre, pas de pagination, lecture limitée à la mémoire du processus, aucun export contrôlé.
- **Anomalies et historique de routage** : routes de la spec 049 sans écran.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Les consoles sont des outils d'exploitation internes. Aucune décision réglementée n'est prise par la plateforme : une demande n'est transmise qu'à un courtier partenaire éligible, par les règles déterministes existantes.
- **Impacted application(s)**:
  - Back-office Plateforme/Admin (`apps/admin`) : nouvelles pages et pages statiques remplacées ;
  - Backend API : nouvelles routes `/admin/operations/*`, statut des messages de contact, historique de routage, durcissement des lectures existantes ;
  - packages partagés : contrat `admin-operations.contracts.ts` ;
  - base de données : migration `0025_admin_operations` (colonnes de revue, de traitement, index d'audit).
  - **Non impactés** : Web Publique Client, Broker Back-office, module notifications (spec 054 en cours).
- **Affected scopes**: demandes de devis, affectations de leads, décisions de routage, messages de contact, journaux d'audit ; rôles Super Admin, Admin Pays, Compliance Admin, Support Admin.
- **Frontend separation**: tous les écrans vivent dans l'app admin authentifiée ; aucune route n'est exposée au public ni à l'app courtier.
- **Required feature flags**: aucun nouveau flag. `ai_routing_anomaly_detection_enabled` (spec 049) continue de gouverner les anomalies ; `multi_broker_routing_enabled` et les règles de routage gouvernent le routage relancé après revue.
- **Consent and transmission**: une décision de revue « router » ou « assigner » est refusée (422, auditée) si le consentement de transmission est absent ou retiré. Une demande annulée par le visiteur n'est jamais revue.
- **Partner license controls**: l'assignation manuelle passe par `QuoteRoutingService.assignManually`, qui vérifie l'éligibilité (licence valide, autorisations pays/produit, statut, quota).
- **Audit and data history**:
  - chaque décision de revue persiste `reviewedAt`, `reviewedById`, le motif (`manualReviewReason`) et, pour un doublon, `duplicateOfQuoteRequestId` ;
  - chaque refus de routage issu de la revue (non routable, doublon) produit une `RoutingDecision` `blocked` ;
  - chaque lecture de détail, décision, changement de statut de message et export d'audit produit un AuditLog (acteur, cible, résultat, motif, correlationId).
- **Security and RBAC**:
  - MFA obligatoire (garde HTTP existante) ;
  - lecture des demandes : `quote_requests:read` et rôles Super Admin, Admin Pays, Compliance Admin, Support Admin ;
  - Admin Pays limité à son périmètre pays (et produit si défini), en liste, détail et décision ;
  - Support Admin : coordonnées et réponses du formulaire masquées ;
  - décisions de revue : assignation et routage avec `lead_assignments:update` (Super Admin, Admin Pays) ; non routable et doublon avec `quote_requests:update` ou `lead_assignments:update` (Super Admin, Compliance Admin, Admin Pays) ;
  - messages de contact : Super Admin, Compliance Admin, Support Admin (lecture et statut) ;
  - journaux d'audit : lecture Super Admin, Compliance Admin, Support Admin (règle existante) ; export CSV réservé à Super Admin et Compliance Admin, plafonné et audité ;
  - historique et anomalies de routage : `routing_rules:read`.
- **Routing impact**: la revue peut relancer le moteur de routage déterministe existant (règles, éligibilité, multi-courtiers sous consentement) ou assigner manuellement un courtier éligible. Aucune règle d'éligibilité n'est contournée.
- **AI impact**: N/A. L'analyse IA des anomalies (route `POST /admin/routing/anomalies/analyze`) n'est pas exposée dans l'écran.
- **UX/content restrictions**: libellés neutres (« courtier partenaire », « demande indicative ») ; aucun contenu de fichier n'est servi par l'admin.
- **Workflow continuity**: feature standard, enchaînement plan → tâches → implémentation → validations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Console des demandes de devis (Priority: P1) — H-01

Un opérateur liste les demandes avec filtres (pays, produit, statut, statut de routage, période), puis ouvre une fiche : consentement, décisions de routage avec candidats exclus et raisons, affectations avec nom du courtier et statut, documents (métadonnées), offre choisie et son issue.

**Independent Test**: `GET /admin/operations/quote-requests?status=manual_review` et `GET /admin/operations/quote-requests/:id` avec chaque rôle.

**Acceptance Scenarios**:
1. **Given** deux pays, **When** un Admin Pays limité à CI liste, **Then** il ne voit que les demandes CI, et la fiche d'une demande SN répond 403 (audité).
2. **Given** un Support Admin, **When** il ouvre une fiche, **Then** e-mail, téléphone et valeurs du formulaire sont masqués.
3. **Given** un courtier ou un Content Admin, **When** il appelle la console, **Then** 403.

### User Story 2 - Revue manuelle persistée (Priority: P1) — H-02

Une demande `manual_review` (produit à revue obligatoire) ou `pending_manual_assignment` (règle manuelle) est traitée : router par le moteur, assigner un courtier éligible, marquer non routable ou doublon, avec motif obligatoire.

**Acceptance Scenarios**:
1. **Given** une demande `manual_review`, **When** l'admin choisit « router », **Then** la demande passe `routed`/`assigned`, l'affectation existe, la décision est relue depuis le dépôt (persistée) et auditée.
2. **When** l'admin marque « non routable », **Then** statut `non_routable`, `routingStatus=blocked`, motif, `reviewedAt/By`, `RoutingDecision` `blocked`.
3. **When** « doublon » avec la référence d'une autre demande, **Then** statut `duplicate`, `duplicateOfQuoteRequestId` renseigné.
4. **Given** un consentement retiré, **When** « router », **Then** 422 audité, rien n'est transmis.
5. **Given** une demande déjà routée, **When** une décision arrive, **Then** 409.
6. **Given** un Support Admin, **When** il décide, **Then** 403 audité.

### User Story 3 - Affectations de leads (Priority: P2) — H-03

Liste filtrée (pays, produit, courtier, statut, période) avec nom du courtier, statut et nombre de destinataires ; réaffectation via le service existant (éligibilité, notification, audit).

### User Story 4 - Messages de contact (Priority: P2) — H-04

Liste filtrée (audience, statut, pays) ; passage en `new`, `handled` ou `spam` avec audit et horodatage ; réponse par e-mail via lien `mailto:` (aucun envoi serveur).

### User Story 5 - Journaux d'audit (Priority: P1) — H-05

Recherche par acteur, action (préfixe), type et identifiant de cible, résultat et période, paginée depuis le dépôt durable ; export CSV restreint (Super Admin, Compliance Admin), plafonné à 5 000 lignes, lui-même audité.

### User Story 6 - Anomalies et historique de routage (Priority: P2) — H-06

Écran des anomalies (spec 049) et historique des décisions de routage (résultat, candidats, exclus et raisons, courtiers retenus) filtré par période, résultat et pays ; lien vers l'historique des règles.

### Edge Cases

- Demande anonymisée (spec 046) : la fiche n'affiche plus de coordonnées ; la revue reste refusée si le consentement n'est plus valide.
- Doublon désignant la demande elle-même ou une référence inconnue : 400 / 404.
- Réaffectation vers le même courtier : 409 (existant).
- Export d'audit sans filtre : autorisé mais plafonné et signalé `truncated`.
- Cellules CSV commençant par `=`, `+`, `-`, `@` : préfixées pour éviter l'injection de formules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `GET /admin/operations/quote-requests` liste paginée et filtrée (pays, produit, statut, statut de routage, période, référence), limitée au périmètre de l'acteur.
- **FR-002**: `GET /admin/operations/quote-requests/:id` renvoie la fiche (consentement résumé, décisions, exclus et raisons, affectations avec nom du courtier, documents, offre choisie et issue, état de revue) ; masquage PII pour Support Admin ; lecture auditée.
- **FR-003**: `GET /admin/operations/quote-review` liste les demandes ouvertes à la revue avec les candidats évalués (éligibilité et raisons).
- **FR-004**: `POST /admin/operations/quote-requests/:id/review` applique `route`, `assign`, `non_routable` ou `duplicate` avec motif, persiste la décision et l'audite ; le visiteur est informé par le point d'accroche de notification existant.
- **FR-005**: `GET /admin/operations/lead-assignments` liste paginée et filtrée ; la réaffectation reste `POST /admin/lead-assignments/:id/reassign`.
- **FR-006**: `POST /admin/contact-messages/:id/status` change le statut (`new`, `handled`, `spam`) avec motif optionnel, horodatage et audit.
- **FR-007**: `GET /admin/operations/audit-logs` recherche paginée depuis le dépôt durable ; `GET /admin/operations/audit-logs/export` export CSV restreint et audité.
- **FR-008**: `GET /admin/routing/history` historique des décisions de routage filtré et limité au périmètre.
- **FR-009**: les lectures historiques `GET /admin/quote-requests` et `GET /admin/lead-assignments` ne renvoient plus d'empreinte de jeton ni de coordonnées brutes : elles renvoient les lignes assainies de la console ; `GET /admin/audit-logs` lit le dépôt durable et accepte les mêmes filtres.
- **FR-010**: pages admin : `/quote-requests`, `/quote-requests/[id]`, `/operations/quote-review`, `/lead-assignments`, `/operations/contact-messages`, `/compliance/audit-logs`, `/routing/anomalies`, `/routing/history`, avec navigation.

### Key Entities

- **QuoteRequest** (+ `reviewedAt`, `reviewedById`, `duplicateOfQuoteRequestId`).
- **ContactMessage** (+ `handledAt`, `handledById`, `statusReason`).
- **AuditLog** (index de recherche), **RoutingDecision**, **LeadAssignment** (inchangés).

## Success Criteria *(mandatory)*

- **SC-001**: une décision de revue est relue identique après rechargement du dépôt (test d'intégration de persistance).
- **SC-002**: 100 % des routes de la spec refusent sans MFA, hors rôle et hors périmètre (tests RBAC).
- **SC-003**: aucune réponse de console ne contient `verificationTokenHash`, `emailFingerprint` ou `ipHash` ; Support Admin ne reçoit ni e-mail ni téléphone en clair.
- **SC-004**: SC-09 PRD : une demande sans consentement valide n'est pas routée par la revue et le refus est audité.

## Assumptions

- Le volume V1 permet un filtrage en mémoire des affectations et décisions (listes complètes déjà chargées par les services existants) ; la pagination est appliquée côté API. Les journaux d'audit, eux, sont filtrés et paginés en base.
- La notification visiteur détaillée par statut est retravaillée par la spec 054 ; cette spec n'appelle que le point d'accroche existant (`QuoteNotificationService.queueVisitor`).
- H-07 (clés d'API et webhooks partenaires) et H-08 (envoi de test messagerie) restent hors périmètre.
