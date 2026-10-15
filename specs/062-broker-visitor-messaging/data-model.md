# Data Model: 062

Migration `0031_broker_visitor_messaging` (additive uniquement ; numéro réservé par le superviseur). Aucune colonne existante n'est supprimée ou renommée.

## LeadMessage (nouvelle table, ajout seul)
| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| quoteRequestId | text | demande (index avec `createdAt`) |
| leadAssignmentId | text | affectation = la conversation (index avec `createdAt`) |
| partnerTenantId | text | courtier de l'affectation au moment de l'envoi (index) |
| senderType | text | `broker` \| `visitor` |
| authorId | text? | utilisateur courtier (null pour le visiteur) |
| body | text | 1–2 000 caractères, texte brut ; garde de formulations pour `broker` |
| readAt | timestamp? | première lecture par le **destinataire** (seul champ de cycle de vie avec `anonymizedAt`) |
| clientRequestId | text? | clé d'idempotence fournie par le client (unique avec `leadAssignmentId` + `senderType`) |
| anonymizedAt | timestamp? | spec 046 : `body` remplacé par un marqueur |
| createdAt | timestamp | tri : `createdAt`, puis `id` |

Règles : jamais de `UPDATE` du corps ; aucune route de suppression ; 300 messages au plus par affectation.

## LeadMessageAttachment (nouvelle table, ajout seul)
`id, messageId (index), leadAssignmentId, quoteRequestId, fileName, mimeType, sizeBytes, checksum, storageKey, scanStatus (clean uniquement servi), scanEngine?, scannedAt?, anonymizedAt?, createdAt`. 0 à 3 par message. Un envoi est refusé en entier si une pièce n'est pas saine (aucun message partiel).

## LeadDocumentRequest (nouvelle table)
| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| quoteRequestId, leadAssignmentId, partnerTenantId | text | index sur l'affectation avec `status` |
| authorId | text? | utilisateur courtier |
| label | text | 1–120, garde de formulations |
| note | text? | ≤ 500, garde de formulations |
| dueAt | timestamp? | indicatif |
| status | text | `open` \| `fulfilled` \| `cancelled` |
| fulfilledAt, fulfilledDocumentCount | | |
| cancelledAt, cancelledById?, cancelReason? (`broker`\|`reassigned`\|`closed`) | | |
| anonymizedAt | timestamp? | |
| createdAt, updatedAt | | |

Au plus 10 demandes `open` par affectation. Seules les transitions `open → fulfilled` et `open → cancelled` sont permises.

## QuoteRequestDocument (évolution, colonnes nullables)
`documentRequestId text?` (index) : rattache une pièce fournie par le visiteur à une demande. `uploadedBy text?` (`visitor` par défaut). Une pièce rattachée à une demande est partagée avec l'affectation de la demande (`sharedLeadAssignmentId` renseigné) ; elle suit les règles d'accès existantes (spec 033) pour les téléchargements.

## DataRequest (nouvelle table)
| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| reference | text unique | `DR-` + 8 caractères non devinables |
| quoteRequestId | text | demande liée au jeton (index) |
| type | text | `access` \| `rectification` \| `erasure` |
| status | text | `received` \| `in_review` \| `completed` \| `rejected` |
| detail | text? | ≤ 1 000 ; donnée personnelle (jamais en log ni en e-mail) |
| locale | text | `fr` \| `en` (langue des e-mails) |
| dueAt | timestamp | `createdAt + 30 jours` (indicatif, à confirmer par pays) |
| acknowledgedAt | timestamp? | envoi de l'accusé |
| reviewedById, reviewedAt | | prise en charge |
| decidedById, decidedAt | | clôture ou rejet |
| decisionNote | text? | note interne (obligatoire au rejet), jamais envoyée au visiteur |
| erasureRequestId | text? | lien vers le flux d'effacement sur demande (spec 046) lancé à l'approbation |
| anonymizedAt | timestamp? | |
| createdAt, updatedAt | | |

Règles : une seule demande ouverte (`received`/`in_review`) par `quoteRequestId` + `type` ; transitions `received → in_review → completed|rejected` (ou `received → rejected|completed`) ; jamais d'effacement sans action explicite d'un compliance admin.

## Notification (enum `NotificationType`, ajouts)
`visitor_broker_message`, `visitor_documents_requested`, `visitor_data_request_acknowledged`, `visitor_data_request_closed`, `broker_visitor_message`, `admin_data_request_received` (alerte conformité in-app). `broker_document_received` existe déjà (spec 055) et est réutilisé.

Clés d'idempotence (`dedupeKey`) : `visitor_broker_message:{quoteRequestId}:{assignmentId}:{bucket15min}` ; idem côté courtier ; `visitor_documents_requested:{quoteRequestId}:{requestId}` ; `broker_document_received:{quoteRequestId}:{requestId}:{bucket15min}` ; `visitor_data_request_acknowledged:{dataRequestId}` ; `visitor_data_request_closed:{dataRequestId}` ; `admin_data_request_received:{dataRequestId}`.

## FeatureFlag
Ligne `broker_visitor_messaging_enabled` (global, non sensible, défaut `true`).

## Rétention (spec 046, provisoire)
Catégories `lead_message_threads`, `lead_document_requests`, `data_requests` : durées provisoires marquées « en attente de validation juridique ». Anonymisation : `body`, `fileName`, `label`, `note`, `detail` remplacés ; `reference`, horodatages, types et statuts conservés (preuve minimale).

## Transitions
- Conversation (dérivée, non stockée) : `open` si affectation actuelle acceptée, lead ouvert, consentement actif, drapeau actif ; sinon `read_only` (raisons : `consent_withdrawn`, `lead_closed`, `reassigned`, `messaging_disabled`, `partner_suspended` côté courtier).
- Demande de documents : `open → fulfilled` (premier téléversement sain) ; `open → cancelled` (courtier, réaffectation, clôture).
- Demande de données : voir ci-dessus.
- SLA : `firstVisibleReplyAt(assignment) = min(LeadProposal.sentAt, LeadMessage.createdAt where senderType = broker)`.
