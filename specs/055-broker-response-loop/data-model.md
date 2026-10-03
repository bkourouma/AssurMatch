# Data Model: 055

Migration `0028_broker_response_loop` (additive ; numéro à réaligner par le superviseur à la fusion).

## LeadProposal (nouvelle table)
| Champ | Type | Règle |
|---|---|---|
| id | uuid | |
| leadAssignmentId | text | affectation (indexée avec `sentAt`) |
| quoteRequestId | text | demande (index) |
| partnerTenantId | text | courtier émetteur ; ≠ partenaire courant après réaffectation |
| authorId | text? | utilisateur courtier |
| channel | text | `starter` \| `crm` |
| status | text | `sent` \| `viewed` \| `responded` \| `withdrawn` (`expired` calculé) |
| message | text | ≤ 2 000, garde de formulations FR/EN |
| priceMin / priceMax | decimal(16,2)? | au moins l'un ; min ≤ max |
| currency | text | ISO 4217, défaut XOF |
| guarantees | text[] | ≤ 20 × 160 caractères |
| validUntil | timestamp | future à l'envoi |
| nonContractual | bool | toujours vrai |
| documentStorageKey, documentFileName, documentMimeType, documentSizeBytes, documentChecksum, documentScanStatus, documentScanEngine, documentScannedAt | ? | PDF sain uniquement (sinon envoi refusé) |
| sentAt, viewedAt?, respondedAt?, withdrawnAt?, withdrawnById?, withdrawReason? | | cycle de vie (seuls champs modifiables) |
| anonymizedAt? | timestamp | spec 046 |

Règles : immuable après création ; au plus 10 propositions actives (non retirées, non expirées) par affectation et courtier.

## VisitorProposalResponse (nouvelle table, ajout seul)
`id, proposalId, leadAssignmentId, quoteRequestId, partnerTenantId, type (interested|declined|question), callbackSlot? (≤100), declineReason? (price|guarantees|delay|already_insured|other), question? (≤500), createdAt`. La dernière réponse fait foi.

## BrokerCrmDocument (évolution)
Colonnes nullables ajoutées : `fileName, mimeType, sizeBytes, checksum, scanStatus, scanEngine, scannedAt`. Un document sans `scanStatus = clean` n'est jamais servi. Visibilité `internal` : aucune route visiteur ne les lit.

## Notification (enum)
`NotificationType` + `visitor_proposal_available`, `broker_visitor_response`.

## BrokerCrmLeadState (comportement)
Désormais écrit par upsert à chaque mise à jour CRM, supprimé à la réaffectation.

## Transitions
- Proposition : `sent → viewed` (ouverture de l'espace ou téléchargement) → `responded` (réponse visiteur) ; `sent|viewed|responded → withdrawn` (courtier) ; `expired` quand `validUntil` est passé.
- Affectation : `accepted|received|seen|broker_notified → contacted` à l'envoi.
- CRM (canal CRM) : statut < `devis_envoye` → `devis_envoye` (changement audité, historisé, webhook `lead.status_changed`). Jamais par une réponse du visiteur.
