# API contract: 055 (courtier authentifié et visiteur avec jeton 054)

## Côté visiteur (Web Publique Client, sans session back-office)

### Statut de suivi — champ ajouté
`GET /quote-requests/:publicReference?token=…` (contrat 054 inchangé, plus `proposals`) :
```json
{
  "status": "proposal_available",
  "brokers": [{ "partnerName": "…", "status": "proposal_available", "since": "ISO" }],
  "proposals": [{
    "id": "uuid",
    "partnerName": "Cabinet …",
    "message": "…",
    "priceMin": 85000, "priceMax": 110000,
    "currency": "XOF",
    "guarantees": ["Responsabilité civile"],
    "validUntil": "ISO",
    "hasDocument": true,
    "status": "sent|viewed|responded|expired|closed",
    "sentAt": "ISO",
    "nonContractualNotice": "Proposition indicative non contractuelle, à confirmer par le courtier",
    "canRespond": true,
    "visitorResponse": { "type": "interested|declined|question", "callbackSlot": "…", "declineReason": "price|guarantees|delay|already_insured|other", "question": "…", "at": "ISO" }
  }]
}
```
- `priceMin`/`priceMax`/`visitorResponse` et ses champs sont facultatifs. Plus récente d'abord. Les propositions retirées ne figurent jamais ; après un retrait du consentement `proposals` vaut `[]`. `closed` = proposition d'un courtier dont la demande a été réaffectée, ou lead clôturé : `canRespond: false`. `nonContractualNotice` est dans la langue de la demande (`fr`/`en`).
- Ouvrir l'espace marque les propositions `sent` comme `viewed` (audité).

### PDF d'une proposition
`GET /quote-requests/:publicReference/proposals/:proposalId/document?token=…`
- **200** binaire `application/pdf`, `Content-Disposition: attachment`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. Audité (`lead_proposal.document_downloaded`).
- **404** `{ code: "VISITOR_ACCESS_DENIED" }` pour un jeton faux/expiré/révoqué, une proposition d'une autre demande, retirée, sans fichier sain, ou après retrait du consentement.
- Limite : 60/h par IP.

### Suite donnée par le visiteur
`POST /quote-requests/:publicReference/proposals/:proposalId/responses?token=…`, corps :
```json
{ "type": "interested", "callbackSlot": "Demain 10h-12h" }
{ "type": "declined", "declineReason": "price" }
{ "type": "question", "question": "La franchise est-elle incluse ?" }
```
- `callbackSlot` ≤ 100 (avec `interested` seulement), `declineReason` dans la liste fermée (avec `declined` seulement), `question` 1–500 (obligatoire et seulement avec `question`). Chaînes vides ignorées.
- **201** `{ "recorded": true, "proposalId": "uuid", "type": "interested", "at": "ISO" }` ; le visiteur affiche « Le courtier vous recontactera ». Aucun libellé « acceptée », « contrat » ni « souscrire ».
- **400** saisie invalide ; **404** `VISITOR_ACCESS_DENIED` (jeton ou proposition d'une autre demande) ; **409** `{ code: "PROPOSAL_NOT_RESPONDABLE" }` (retirée, expirée, clôturée, consentement retiré) ; **429** au-delà de 10/h par IP ou 5/h par proposition.
- N'affecte jamais le statut CRM ; notifie le courtier (boîte in-app + e-mail pointeur).

## Côté courtier (session back-office, MFA)

| Méthode | Route | Canal |
|---|---|---|
| GET | `/broker/{starter\|crm}/leads/:leadId/proposals` | liste du courtier courant |
| POST | `/broker/{starter\|crm}/leads/:leadId/proposals` | envoi (JSON, ou multipart `payload` JSON + `file` PDF) |
| POST | `/broker/{starter\|crm}/leads/:leadId/proposals/:proposalId/withdraw` | `{ reason? ≤500 }` |
| GET | `/broker/{starter\|crm}/leads/:leadId/proposals/:proposalId/document` | PDF, `no-store`, audité |
| POST | `/broker/crm/leads/:leadId/documents` | multipart `file` + `label` (document interne analysé) ; JSON = référence historique |
| GET | `/broker/crm/leads/:leadId/documents/:documentId/file` | fichier sain, audité |

Corps d'envoi : `{ message (1–2000), priceMin?, priceMax? (au moins un, min ≤ max), currency (ISO, défaut XOF), guarantees (≤ 20 × 160), validUntil (ISO futur) }`.

Réponse liste :
```json
{ "items": [{ "id": "…", "leadAssignmentId": "…", "status": "sent|viewed|responded|withdrawn|expired", "message": "…", "priceMin": 1, "priceMax": 2, "currency": "XOF", "guarantees": [], "validUntil": "ISO", "document": { "fileName": "…", "mimeType": "application/pdf", "sizeBytes": 1 }, "sentAt": "ISO", "viewedAt": "ISO", "respondedAt": "ISO", "withdrawnAt": "ISO", "withdrawReason": "…", "nonContractualNotice": "…", "responses": [{ "id": "…", "type": "question", "question": "…", "createdAt": "ISO" }] }],
  "activeCount": 1, "maxActive": 10, "canSend": true, "blockers": ["not_accepted|lead_closed|consent_withdrawn|limit_reached"], "suggestedNextStatus": "negociation" }
```

Refus d'envoi : 403 (`PARTNER_SUSPENDED`, rôle lecture seule, agent non assigné, autre tenant, Starter sur `/broker/crm`), 409 `LEAD_NOT_ACCEPTED` / `LEAD_CLOSED` / `PROPOSAL_LIMIT_REACHED`, 422 `LEAD_CONSENT_WITHDRAWN` / `FORBIDDEN_WORDING` (formulation citée dans `message`) / `DOCUMENT_QUARANTINED` / `DOCUMENT_INVALID`, 400 saisie. Retrait d'une proposition déjà retirée : 409 `PROPOSAL_NOT_ACTIVE`. Aucune route de modification d'une proposition envoyée.

Détails de lead : `contact` complet et `contactVisibility: "full"` pour le courtier affecté (audit `broker_lead.contact_revealed`) ; `contactVisibility: "masked"` et `contact = { emailMasked?, phoneMasked? }` après retrait du consentement.

Toutes les écritures courtier sont dans `BROKER_TENANT_WRITE_GUARDED` (`sendProposal`, `withdrawProposal` Starter ; `proposal`, `withdrawProposal`, `document` CRM).
