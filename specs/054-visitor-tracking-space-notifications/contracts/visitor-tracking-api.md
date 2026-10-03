# API contract: 054 (routes publiques, sans session back-office)

## Statut de suivi
`GET /quote-requests/:publicReference?token=…`
- **200** :
  ```json
  {
    "publicReference": "QR-…",
    "language": "fr",
    "country": { "isoCode": "CI", "name": "…" },
    "product": { "key": "auto", "name": "…" },
    "status": "received|in_review|transmitted|in_progress|proposal_available|closed|not_transmitted",
    "brokers": [ { "partnerName": "…", "status": "transmitted|in_progress|proposal_available|closed", "since": "ISO" } ],
    "timeline": [ { "step": "received|in_review|transmitted|accepted|reassigned|closed|consent_withdrawn|not_transmitted", "at": "ISO", "partnerName?": "…" } ],
    "consent": { "withdrawn": false, "withdrawnAt?": "ISO" },
    "tokenExpiresAt": "ISO|null"
  }
  ```
  - `proposal_available` et les propositions seront ajoutés par la spec 055, avec un champ `proposals` additionnel. Le contrat de 054 ne change pas.
  - Ni les réponses du formulaire ni les coordonnées complètes ne sont jamais renvoyées.
- **404** `{ code: "VISITOR_ACCESS_DENIED" }` pour une référence inconnue, un jeton faux, expiré ou révoqué, ou une demande anonymisée. Le corps est identique dans tous les cas.
- Limite de débit : 60 requêtes par heure par IP.

## Renvoi de lien
`POST /quote-requests/tracking-link`, corps `{ publicReference, email, locale?: "fr"|"en", website?: "" }` (champ pot de miel).
- Réponse toujours **202** `{ accepted: true }`.
- Limites : 5 par heure par IP ; 3 par heure par référence. Au-delà : **429**.

## Routes existantes, désormais vérifiées par `VisitorAccessService`
`GET|POST /quote-requests/:ref/documents?token=`, `POST /quote-requests/:ref/consent-withdrawal?token=` (envoie maintenant un e-mail de confirmation, une seule fois).

## Enquête
`GET|POST /satisfaction-surveys/:ref?token=` : inchangées. Le jeton envoyé dans l'e-mail est désormais réel.

## Soumission
`POST /quote-requests` : la réponse contient `verificationToken`, un jeton `VisitorAccessToken` valable 30 jours. Le champ `brokerName` n'est plus codé en dur : il est renseigné quand une affectation existe.
