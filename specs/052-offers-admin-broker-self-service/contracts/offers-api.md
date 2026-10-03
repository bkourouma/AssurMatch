# API contract: 052

Les routes back-office exigent une authentification et une MFA. Les mutations admin exigent `reason` (8 caractères au moins). Les mutations courtier exigent `reason` à la soumission et au retrait. Les erreurs suivent le format `{ statusCode, code, message, blockers? }`.

## Courtier — `/broker/offers`
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/broker/offers` | `broker_offers:read` | `?status&countryId&productId` | `BrokerOfferView[]` (version publiée + version en cours, complétude, expiration) |
| GET | `/broker/offers/:id` | idem | — | vue détaillée + versions / 404 si l'offre est à un autre courtier |
| POST | `/broker/offers` | `broker_offers:write` + écriture permise | `offerContentSchema` + `countryId`, `productId` | 201 (v1 brouillon) / 422 `OFFER_SCOPE_NOT_COVERED` / 400 (formulations, dates, prix) |
| PATCH | `/broker/offers/:id` | idem | contenu + `expectedUpdatedAt` | 200 (modifie la version en cours, ou crée la version N+1 depuis la publiée) / 409 |
| POST | `/broker/offers/:id/submit` | idem | `{ reason? }` | 200 / 422 `OFFER_INCOMPLETE` avec `blockers` |
| POST | `/broker/offers/:id/withdraw` | idem | `{ reason }` | 200 (retrait public, ou abandon de la version en cours) |
| POST | `/broker/offers/:id/renew` | idem | `{ validFrom, validUntil }` | 201 (nouvelle version) |

Toutes les écritures figurent dans `BROKER_TENANT_WRITE_GUARDED`. Un courtier suspendu reçoit 403 `PARTNER_SUSPENDED`.

## Admin — `/admin/offers`
| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/offers` | `offers:read` + périmètre | `?countryId&productId&partnerTenantId&status&sponsored&expiringWithinDays&queue=submitted` | liste |
| GET | `/admin/offers/:id` | idem | — | `AdminOfferDetailView` (versions, différences publiée/soumise) |
| POST | `/admin/offers` | `offers:update` + périmètre | `adminOfferUpsertSchema` | 201 (v1 brouillon, `authorRole: admin`) |
| PATCH | `/admin/offers/:id` | `offers:update` + périmètre **stocké** | contenu (sponsorisation comprise) + `expectedUpdatedAt` + `reason` | 200 (version) |
| POST | `/admin/offers/:id/submit` | `offers:update` | `{ reason }` | 200 |
| POST | `/admin/offers/:id/validate` | CO (`compliance_admin`, `super_admin`) | `{ reason }` | 200 / 409 sans version soumise ni suspension / 422 `OFFER_VALIDATION_BLOCKED` avec `blockers` |
| POST | `/admin/offers/:id/reject` | CO | `{ reason }` | 200 / 409 |
| POST | `/admin/offers/:id/suspend` | CO | `{ reason }` | 200 |

L'ancien corps de `validate`, `{ validationStatus, reason }`, reste accepté : `validationStatus: "rejected"` équivaut à un refus.

## Public (modifié)
- `GET /countries/:c/products/:p/quote-form?language=&offerId=` : le consentement est résolu avec le nom du courtier de l'offre s'il est éligible ; ajoute `offerPartnerName?`.
- `POST /quote-requests` : `selectedOfferId` est vérifié. La réponse ajoute `selectedOfferPartnerRetained: boolean | null` (`null` sans offre).
