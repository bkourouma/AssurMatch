# API contract: 050

Toutes les routes `/admin/*` exigent une session authentifiée avec MFA vérifiée (classe de route protégée). Chaque corps de mutation contient `reason` (au moins 8 caractères). Les réponses d'erreur gardent le format standard `{ statusCode, code, message, ... }`.

## Pays

| Méthode | Chemin | Permission | Corps / requête | Réponse |
|---|---|---|---|---|
| GET | `/admin/countries` | `countries:read` (filtré par périmètre) | — | `AdminCountryView[]` |
| GET | `/admin/countries/:id` | `countries:read` + périmètre | — | `AdminCountryView` (avec liaisons et résumé de checklist) |
| POST | `/admin/countries` | `countries:create` | `countryCreateSchema` + `reason` | 201 `AdminCountryView` (statut `draft`, flags à `false`) |
| PATCH | `/admin/countries/:id` | `countries:update` + périmètre | champs éditables + `expectedUpdatedAt?` + `reason` | 200 / 409 |
| POST | `/admin/countries/:id/status` | `countries:update` + périmètre ; `public` : `compliance_admin` ou `super_admin` | `{ status, reason }` | 200 / 403 / 422 `ACTIVATION_BLOCKED` |
| POST | `/admin/countries/:id/flags` | idem (`country_public_enabled=true` : conformité) | `{ key, value, reason }` | 200 / 403 / 422 |

## Produits et liaisons

| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/products` | `products:read` | `?countryId=` | `AdminProductView[]` |
| GET | `/admin/products/:id` | `products:read` | — | `AdminProductView` |
| POST | `/admin/products` | `products:create` | `productCreateSchema` + `reason` | 201 |
| PATCH | `/admin/products/:id` | `products:update` | champs + `expectedUpdatedAt?` + `reason` | 200 / 409 |
| POST | `/admin/products/:id/flags` | `products:update` | `{ key, value, reason }` | 200 / 403 / 422 |
| GET | `/admin/countries/:id/products` | `products:read` + périmètre pays | — | `AdminCountryProductLinkView[]` |
| POST | `/admin/countries/:id/products` | `products:update` + périmètre pays | `{ productId, reason }` | 201 (statut `internal`, flags fermés) / 409 si la liaison existe |
| POST | `/admin/countries/:id/products/:productId/retire` | `products:update` + périmètre | `{ reason }` | 200 |
| POST | `/admin/countries/:id/products/:productId/flags` | `products:update` + périmètre | `{ key, value, reason }` | 200 / 403 / 422 |

## Régimes réglementaires

| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/regulatory-regimes` | `countries:read` | — | `RegulatoryRegime[]` |
| POST | `/admin/regulatory-regimes` | `countries:create` | `regulatoryRegimeSchema` + `reason` | 201 / 409 si la clé existe |
| PATCH | `/admin/regulatory-regimes/:id` | `countries:update` | champs + `expectedUpdatedAt?` + `reason` | 200 / 409 |
| POST | `/admin/regulatory-regimes/:id/retire` | `countries:update` | `{ reason }` | 200 / 409 si le régime est référencé |

## Textes de consentement

| Méthode | Chemin | Permission | Corps | Réponse |
|---|---|---|---|---|
| GET | `/admin/consent-texts` | `consent:read` | `?countryId&productId&purpose&language&status` | `AdminConsentTextView[]` |
| GET | `/admin/consent-texts/templates` | `consent:read` | — | modèles du seed (clé, finalité, langue, contenu) |
| GET | `/admin/consent-texts/:id` | `consent:read` | `?preview=1` | vue + `preview` (variables résolues avec des valeurs d'exemple) |
| POST | `/admin/consent-texts` | `consent:create` | `adminConsentTextCreateSchema` | 201 (statut `draft`, empreinte calculée) / 409 si la version existe |
| POST | `/admin/consent-texts/:id/publish` | `consent:approve` | `{ reason }` | 200 / 422 `CONSENT_TEXT_INVALID` |
| POST | `/admin/consent-texts/:id/retire` | `consent:approve` | `{ reason }` | 200 |

## Flags globaux (existant, désormais utilisé par l'interface)

`PATCH /admin/feature-flags/:id { value, reason }` : inchangé. La politique sensible refuse toujours les flags réglementés.

## Public (modifié)

`GET /countries/:countryCode/products/:productKey/quote-form?language=fr|en`
- 200 : `{ formDefinitionId, version, language, fields[], phoneRule, consent: { consentTextId, version, language, contentHash, content, purpose, recipientCategory } }`. Le `content` a ses variables résolues côté serveur ; `contentHash` est celle du modèle publié.
- 404 `QUOTE_FORM_LANGUAGE_UNAVAILABLE` `{ availableLanguages: string[] }` : aucun formulaire publié dans cette langue. Il n'y a plus de repli silencieux.

`POST /quote-requests` : le corps accepte `language` (`fr` | `en`, défaut `fr`). La vérification du consentement utilise le formulaire publié dans cette langue, et le téléphone est validé selon la règle du pays.
