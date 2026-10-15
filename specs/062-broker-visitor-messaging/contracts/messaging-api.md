# API contract: 062 (visiteur avec jeton 054, courtier authentifié, admin)

Types partagés : `packages/shared/contracts/lead-messaging.ts` (schémas zod, constantes, vues). Erreurs : `packages/shared/contracts/error-codes.ts`.

Constantes : `LEAD_MESSAGE_BODY_MAX = 2000`, `LEAD_MESSAGE_ATTACHMENTS_MAX = 3`, `LEAD_MESSAGE_ATTACHMENT_MAX_BYTES = 5 Mo`, types `application/pdf`, `image/jpeg`, `image/png`, `LEAD_MESSAGE_THREAD_MAX = 300`, `DOCUMENT_REQUEST_LABEL_MAX = 120`, `DOCUMENT_REQUEST_NOTE_MAX = 500`, `DOCUMENT_REQUEST_MAX_OPEN = 10`, `DATA_REQUEST_DETAIL_MAX = 1000`.

## Vue d'une conversation (commune)

```json
{
  "conversationId": "opaque",
  "partnerName": "Cabinet …",
  "state": "open | read_only",
  "readOnlyReason": "consent_withdrawn | lead_closed | reassigned | messaging_disabled | partner_suspended | not_accepted",
  "canSend": true,
  "unreadCount": 2,
  "notice": "Échange avec … AssurMatch est une plateforme technique…",
  "messages": [{
    "id": "uuid", "senderType": "broker | visitor", "mine": false,
    "body": "…", "createdAt": "ISO", "readAt": "ISO|null",
    "attachments": [{ "id": "uuid", "fileName": "…", "mimeType": "application/pdf", "sizeBytes": 1234 }]
  }],
  "nextCursor": "string|null"
}
```
- `conversationId` est opaque (dérivé de l'affectation et du courtier : une réaffectation produit une conversation distincte).
- Messages en ordre chronologique croissant ; page de 50 (les plus récents d'abord à la première page, curseur `before`). `mine` est relatif au lecteur.
- `readAt` : première lecture par le destinataire.
- Pièces jointes listées seulement si saines.

## Côté visiteur (Web Publique Client, jeton 054, sans session back-office)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/quote-requests/:publicReference/conversations?token=` | `{ messagingEnabled, conversations: [vue sans messages détaillés au-delà du dernier] }` |
| GET | `/quote-requests/:publicReference/conversations/:conversationId?token=&before=` | vue complète paginée |
| POST | `/quote-requests/:publicReference/conversations/:conversationId/messages?token=` | envoi (JSON `{ body, clientRequestId?, website? }` ou multipart `payload` JSON + `files` ≤ 3) |
| POST | `/quote-requests/:publicReference/conversations/:conversationId/read?token=` | marque lus les messages du courtier |
| GET | `/quote-requests/:publicReference/conversations/:conversationId/messages/:messageId/attachments/:attachmentId?token=` | binaire (`attachment`, `no-store`, `nosniff`, `no-referrer`), audité |
| GET | `/quote-requests/:publicReference/document-requests?token=` | `{ items: [{ id, partnerName, label, note?, dueAt?, status, createdAt, fulfilledAt?, canUpload, uploadedCount }] }` |
| POST | `/quote-requests/:publicReference/document-requests/:requestId/documents?token=` | multipart `files` (≤ 3, 5 Mo, antivirus) ; **201** `{ requestId, status, uploaded: n }` |
| GET | `/quote-requests/:publicReference/data-requests?token=` | `{ items: [{ reference, type, status, createdAt, dueAt, closedAt? }] }` |
| POST | `/quote-requests/:publicReference/data-requests?token=` | `{ type: "access|rectification|erasure", detail?, website? }` ; **201** `{ reference, type, status: "received", acknowledgedByEmail: true }` |

Erreurs visiteur : **404** `{ code: "VISITOR_ACCESS_DENIED" }` (jeton faux/expiré/révoqué, conversation ou demande d'une autre demande de devis, anonymisation) ; **403/409** `MESSAGING_DISABLED` (drapeau coupé) ; **409** `CONVERSATION_READ_ONLY` (consentement retiré, lead clôturé, réaffecté), `DUPLICATE_MESSAGE` (message identique dans les 5 minutes), `THREAD_LIMIT_REACHED`, `DOCUMENT_REQUEST_NOT_OPEN`, `DATA_REQUEST_ALREADY_OPEN` (avec `reference`) ; **422** `DOCUMENT_QUARANTINED`, `DOCUMENT_INVALID` ; **400** saisie ; **429** au-delà de 30/h par IP et 20/h par conversation (messages), 20/h par IP (téléversements), 5/h par IP (demandes de données), 60/h par IP (téléchargements). Le champ piège `website` rempli renvoie un succès factice sans écriture.

Le statut de suivi (`GET /quote-requests/:ref`) gagne un champ `messaging: { enabled, unreadCount }` (ajout, contrat 054/055 inchangé).

## Côté courtier (session back-office, MFA) — `/broker/{starter|crm}/leads/:leadId/…`

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/conversation` | vue de la conversation du courtier **actuel** (jamais celle d'un ancien) |
| POST | `/conversation/messages` | envoi (JSON `{ body, clientRequestId? }` ou multipart `payload` + `files` ≤ 3) |
| POST | `/conversation/read` | marque lus les messages du visiteur |
| GET | `/conversation/messages/:messageId/attachments/:attachmentId` | binaire, audité |
| GET | `/document-requests` | `{ items: [{ id, label, note?, dueAt?, status, createdAt, fulfilledAt?, documents: [{ id, fileName, mimeType, sizeBytes, uploadedAt }] }], openCount, maxOpen, canCreate }` |
| POST | `/document-requests` | `{ label, note?, dueAt? }` (garde de formulations) ; **201** |
| POST | `/document-requests/:requestId/cancel` | annule une demande ouverte |
| GET | `/document-requests/:requestId/documents/:documentId/file` | fichier fourni par le visiteur (sain), audité |

Refus d'écriture : **403** `PARTNER_SUSPENDED` (avant parsing du corps), rôle lecture seule, agent non assigné, autre tenant **y compris un courtier réaffecté** (la politique d'accès de la fiche refuse avant toute lecture ; jamais un message), Starter sur `/broker/crm` ; **404** message ou pièce d'une autre conversation ; **409** `LEAD_NOT_ACCEPTED`, `LEAD_CLOSED`, `CONVERSATION_READ_ONLY`, `THREAD_LIMIT_REACHED`, `DOCUMENT_REQUEST_LIMIT_REACHED`, `DOCUMENT_REQUEST_NOT_OPEN`, `MESSAGING_DISABLED` ; **422** `LEAD_CONSENT_WITHDRAWN`, `FORBIDDEN_WORDING` (expression citée dans `message` et dans `details.wording`), `DOCUMENT_QUARANTINED`, `DOCUMENT_INVALID` ; **400** saisie.

Les écritures (`sendMessage`, `markRead`, `createDocumentRequest`, `cancelDocumentRequest`) sont dans `BROKER_TENANT_WRITE_GUARDED` des contrôleurs Starter et CRM. Le SLA courtier est alimenté par le premier `sendMessage` du courtier.

## Côté admin (session back-office, MFA)

| Méthode | Route | Rôles | Rôle |
|---|---|---|---|
| GET | `/admin/data-requests?status=&type=&cursor=&limit=` | compliance_admin, super_admin (support : statut seul, voir ci-dessous) | file paginée |
| GET | `/admin/data-requests/:id` | idem | détail (détail visiteur, référence, échéance, historique) |
| POST | `/admin/data-requests/:id/take` | compliance | `received → in_review` |
| POST | `/admin/data-requests/:id/complete` | compliance | `{ note? }` → `completed` ; e-mail de clôture |
| POST | `/admin/data-requests/:id/reject` | compliance | `{ note }` (obligatoire) → `rejected` ; e-mail de clôture |
| POST | `/admin/data-requests/:id/start-erasure` | compliance (type `erasure`) | crée l'**aperçu d'effacement** de la spec 046 pour la référence publique ; `erasureBatchId` lié ; **n'efface rien** (l'approbation et l'exécution restent dans le flux de lots de « Rétention » avec le drapeau `retention_purge_enabled`) |
| GET | `/admin/leads/:quoteRequestId/conversations` | compliance, support | lecture seule des conversations de la demande ; chaque lecture auditée ; support : corps masqués |

Support : liste et détail sans le champ `detail` ni l'identité (référence, type, statut, échéance seulement). Autres rôles : **403**, audité.

## Audit (sans contenu de message)
`lead_message.sent`, `lead_message.refused` (raison : `forbidden_wording`, `lead_closed`, …), `lead_message.read`, `lead_message.attachment_downloaded`, `lead_message.attachment_quarantined`, `lead_document_request.created|cancelled|fulfilled|document_downloaded`, `data_request.created|taken|completed|rejected|erasure_started|refused`, `lead_messaging.admin_viewed`, `lead_message.visitor_sent`.

## Notifications
| Type | Destinataire | Canaux | Contenu |
|---|---|---|---|
| `visitor_broker_message` | visiteur | e-mail FR/EN | pointeur : « Vous avez un nouveau message de {courtier} », lien neuf vers l'espace ; **jamais le texte** |
| `visitor_documents_requested` | visiteur | e-mail FR/EN | pointeur : « {courtier} vous demande des documents » ; intitulé non repris |
| `broker_visitor_message` | courtier affecté | in-app + e-mail pointeur | « Nouveau message d'un visiteur sur la demande {référence} » |
| `broker_document_received` | courtier affecté | in-app + e-mail pointeur | « Un document a été reçu pour la demande {référence} » |
| `visitor_data_request_acknowledged` | visiteur | e-mail FR/EN | référence `DR-…`, type, échéance indicative |
| `visitor_data_request_closed` | visiteur | e-mail FR/EN | pointeur : « Votre demande {référence} a été traitée » (statut dans l'espace) |
| `admin_data_request_received` | conformité | alerte in-app | référence, type |

## Formes complémentaires (source de vérité pour les fronts)

### Admin — demandes de données
`GET /admin/data-requests` → `{ "items": [{ "id": "uuid", "reference": "DR-AB12CD34", "type": "access|rectification|erasure", "status": "received|in_review|completed|rejected", "createdAt": "ISO", "dueAt": "ISO", "overdue": false, "quoteReference": "QR-…", "locale": "fr|en" }], "nextCursor": "string|null" }`

`GET /admin/data-requests/:id` → liste + `{ "detail?": "texte du visiteur (absent pour le support)", "acknowledgedAt": "ISO|null", "reviewedAt?": "ISO", "decidedAt?": "ISO", "decisionNote?": "texte interne", "erasureBatchId?": "uuid", "erasureAllowed": true, "history": [{ "action": "created|taken|completed|rejected|erasure_started", "at": "ISO" }] }`

Les actions renvoient la vue détail mise à jour. `start-erasure` renvoie en plus `{ "erasureBatchId": "uuid" }`. Transition invalide : **409** `DATA_REQUEST_INVALID_TRANSITION`.

Précisions d'implémentation (données) :
- Les actions (`take`, `complete`, `reject`, `start-erasure`) répondent **200** (pas 201, même `start-erasure` qui crée un aperçu). La création côté visiteur répond **201**, y compris pour le champ piège rempli (succès factice sans écriture).
- Le détail complet ajoute `quoteRequestId`, `publicReference` (= `quoteReference` de la liste), `reviewedById`, `decidedById` ; `acknowledgedAt` est **omis** tant que l'accusé n'est pas mis en file (pas de `null`). Pour `support_admin`, liste et détail ne portent que `id`, `reference`, `type`, `status`, `createdAt`, `dueAt`, `overdue` (+ `history: []`) : ni `quoteReference`, ni `locale`, ni `detail`, ni `decisionNote`.
- `start-erasure` : réservé au type `erasure` et à une demande ouverte (sinon **409** `DATA_REQUEST_INVALID_TRANSITION`) ; il appelle `previewErasure({ publicReference })` de la spec 046 avec l'acteur, lie `erasureBatchId`, passe `received → in_review` (renseigne `reviewedBy/At`) et n'approuve ni n'exécute jamais le lot. Il peut être relancé tant que la demande est ouverte (nouvel aperçu, par ex. après expiration du précédent). Aucune clôture automatique : l'admin conformité clôture la demande (`complete`) après l'exécution éventuelle du lot.
- `DATA_REQUEST_ALREADY_OPEN` : le corps porte `reference` au premier niveau (`{ code, message, reference, correlationId }`). Limites : 5 créations/h par IP (toute tentative), 3 créations/h par demande de devis (demandes effectivement enregistrées). Le champ piège ne consomme que la limite par IP.
- Rétention : les sujets `lead_message_threads` et `lead_document_requests` sont désignés par **l'identifiant de l'affectation** (tout le fil, resp. toutes les demandes de documents, de l'affectation) ; ils deviennent éligibles quand le DERNIER élément non anonymisé dépasse la durée (un message récent protège tout le fil). `data_requests` : une demande par ligne, seules les demandes clôturées (`completed`/`rejected`) suivent la durée de rétention (une demande ouverte n'est jamais anonymisée par un lot de rétention). L'anonymisation d'une demande de devis (cascade, lot de rétention ou effacement) anonymise aussi messages, pièces jointes (objets stockés supprimés), demandes de documents et demandes de données de cette demande ; un aperçu d'effacement compte ces sujets.

### Admin — conversations d'une demande (lecture seule)
`GET /admin/leads/:quoteRequestId/conversations` → `{ "quoteRequestId": "uuid", "masked": true|false, "conversations": [{ "conversationId": "opaque", "partnerName": "…", "state": "open|read_only", "readOnlyReason": "…|null", "messages": [{ "id", "senderType", "body": "texte | [masqué] si masked", "bodyMasked": true|false, "createdAt", "readAt": "ISO|null", "attachmentCount": 0 }] }] }` (forme de `adminLeadConversationsViewSchema` + `masked`). Rôles : `compliance_admin`, `super_admin` lisent les corps ; `support_admin` les reçoit masqués ; tout autre rôle (ou sans MFA) : **403**, audité `lead_messaging.admin_view_refused` ; quote inconnue : **404**. Contrôle par liste de rôles dans le service (aucune permission RBAC ajoutée). Chaque lecture réussie est auditée `lead_messaging.admin_viewed` (nombre de conversations et de messages, jamais le contenu).

### SLA — champs additifs « première réponse visible »
Ajoutés (optionnels, `null` si aucune mesure) aux objets SLA existants du courtier (`BrokerSla`, enterprise), de l'admin partenaires (`/admin/partners/sla`) et du tableau de bord courtier : `averageFirstVisibleReplyMinutes: number | null`, `firstVisibleReplyMeasured: number`, `firstVisibleReplyWithinTarget: number`, `firstVisibleReplyComplianceRate: number | null` (même unité que `complianceRate` existant). Les champs « premier geste » existants sont inchangés.

### Notifications courtier (boîte in-app)
Types `broker_visitor_message` et `broker_document_received` : `targetType = "LeadAssignment"`, `targetId = <leadAssignmentId>`.

## Précisions d’implémentation (lot messagerie)

- **Forme des erreurs** : le filtre d’erreurs relaie un objet `details` (non sensible) : `FORBIDDEN_WORDING` → `details.wording` (liste des expressions) ; `CONVERSATION_READ_ONLY` → `details.reason`.
- **Pièces jointes** : plus de 3 fichiers → **400** (multer) ; un fichier de plus de 5 Mo → **413** (limite multer) ; type ou signature invalide → **422** `DOCUMENT_INVALID` ; infecté ou analyse en échec → **422** `DOCUMENT_QUARANTINED` (rien n’est écrit, les objets déjà stockés sont supprimés).
- **Demandes de documents** : l’annulation par réaffectation, clôture du lead ou retrait du consentement est paresseuse (chaque lecture ou téléversement rapproche l’état) et disponible via `DocumentRequestsService.closeForAssignment(assignmentId, "reassigned"|"closed")` ; la liste visiteur contient aussi les demandes annulées (`canUpload: false`), la plus récente d’abord. Les pièces fournies sont des `QuoteRequestDocument` (`documentRequestId` renseigné, `uploadedBy: visitor`), partagées avec l’affectation courante sans l’alerte générique ; elles ne sont pas retransmises au courtier suivant.
- **Pagination** : `before` est l’`id` du plus ancien message de la page déjà reçue ; un curseur inconnu donne **400**.
- **Drapeau** : `broker_visitor_messaging_enabled` vaut `true` quand aucune ligne n’existe (`FeatureFlagsService.isEnabledOrDefault`) ; `false` bloque les écritures (message, demande de documents, annulation, téléversement) et garde les lectures.
