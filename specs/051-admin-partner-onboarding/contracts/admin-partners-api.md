# API contract: 051

Les routes `/admin/*` exigent une authentification et une MFA. Chaque mutation exige `reason` (8 caractères au moins). Les erreurs suivent le format de la spec 050 : `{ statusCode, code, message, blockers? }`.

Abréviations des colonnes de permission :
- **CO** : `compliance_admin` ou `super_admin` (contrôle de rôle explicite) ;
- **AP** : `admin_pays`, limité à son périmètre pays.

## Courtiers
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/partners` | `partners:read` | `?status&countryId&plan&licenseExpiringWithinDays` | `AdminPartnerView[]` |
| GET | `/admin/partners/:id` | `partners:read` | — | `AdminPartnerDetailView` |
| POST | `/admin/partners` | `partners:create` (AP pour son pays) | `partnerAdminCreateSchema` | 201, statut `draft` / 409 doublon RCCM |
| PATCH | `/admin/partners/:id` | `partners:update` (AP) | champs, `expectedUpdatedAt`, `reason` | 200 / 409 |
| POST | `/admin/partners/:id/status` | `pending_compliance` : `partners:update` ; autres transitions : CO | `{ status, reason }` | 200 / 409 `PARTNER_TRANSITION_INVALID` / 422 `PARTNER_ACTIVATION_BLOCKED` |
| POST | `/admin/partners/:id/authorizations/countries` | `partners:update` + périmètre | `{ countryId, reason }` | 201 / 422 (licence requise pour ce pays) |
| POST | `/admin/partners/:id/authorizations/countries/:countryId/withdraw` | idem | `{ reason }` | 200 |
| POST | `/admin/partners/:id/authorizations/products` | `partners:update` | `{ productId, reason }` | 201 |
| POST | `/admin/partners/:id/authorizations/products/:productId/withdraw` | idem | `{ reason }` | 200 |
| POST | `/admin/partners/:id/users` | `users:create` ou `partners:update` + périmètre | `{ email, displayName, role, reason }` | 201 (e-mail d'activation) / 422 si le courtier est résilié |

## Licences
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| POST | `/admin/partners/:id/licenses` | `licenses:create` (AP) | `{ licenseNumber, issuingAuthority, countryId, productIds[], effectiveDate, expirationDate, reason }` | 201, statut `draft` |
| POST | `/admin/partners/:id/licenses/:licenseId/validate` | CO | `{ reason }` | 200 / 422 `LICENSE_DOCUMENT_REQUIRED` / 422 si expirée |
| POST | `/admin/partners/:id/licenses/:licenseId/suspend` | CO | `{ reason }` | 200 |
| POST | `/admin/partners/:id/licenses/:licenseId/revoke` | CO | `{ reason }` | 200 |
| POST | `/admin/partners/:id/licenses/:licenseId/renew` | `licenses:create` | champs d'une nouvelle licence + `reason` | 201 (référence l'ancienne) |

## Documents et contrat
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| POST | `/admin/partners/:id/documents` | `documents:create` (AP) | multipart : `file`, `documentType`, `licenseId?`, `reason` | 201, avec `scanStatus` |
| POST | `/admin/partners/:id/documents/:documentId/review` | CO | `{ decision, reason }` | 200 / 422 `DOCUMENT_QUARANTINED` si non sain |
| GET | `/admin/partners/:id/documents/:documentId/file` | `documents:read` (pas `support_admin`) | — | octets du fichier (audité) / 422 si en quarantaine |
| POST | `/admin/partners/:id/contracts` | `partners:update` | `{ version, signedAt, signatoryName, documentId, reason }` | 201 / 422 si le document n'est pas sain ou n'est pas de type contrat |

## Candidatures
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/partners/applications` | existant (super, admin_pays, compliance) | `?status&countryId` | liste (e-mail de contact masqué hors CO) |
| GET | `/admin/partners/applications/:id` | idem | — | détail |
| POST | `/admin/partners/applications/:id/review` | `partner_applications:review` | `{ reason }` | 200 |
| POST | `/admin/partners/applications/:id/convert` | CO | `{ reason }` | 201 `{ application, partnerTenantId, licenseId }` / 409 déjà décidée / 422 onboarding pays désactivé |
| POST | `/admin/partners/applications/:id/reject` | CO | `{ rejectionReasonCode, reason }` | 200 / 409 |

## Utilisateurs (modifié)
`POST /admin/users` : 422 pour un courtier inexistant ou résilié, un rôle courtier sans courtier, ou un rôle admin avec un courtier.

## Authentification et portail courtier (modifié)
- `POST /auth/login` : refus avec un message neutre pour un utilisateur d'un courtier `retired`.
- Toute route protégée : 401 pour un acteur d'un courtier `retired`.
- `GET /auth/me` : ajoute `partnerTenantStatus`.
- Routes d'écriture courtier : 403 `PARTNER_SUSPENDED` pour un acteur d'un courtier `suspended`.

## Entreprise (modifié)
`PUT /broker/enterprise/sla` (route existante) : 422 si la cible est plus lâche que `slaTargetMinutes`.
