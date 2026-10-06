# Data Model: 050

Migration `0020_catalog_admin_consent_content`, écrite à la main au format des migrations précédentes. Elle n'ajoute que des colonnes facultatives : aucune donnée existante n'est perdue ni réécrite.

## Modifications Prisma

### Country
| Champ | Type | Règle |
|---|---|---|
| `phoneDialCode` | `String?` | Nouveau. Format `+` puis 1 à 4 chiffres. Null : ancienne normalisation générique. |
| `phoneNationalLengths` | `Int[]` (défaut `[]`) | Nouveau. Chaque valeur entre 6 et 12. Vide : ancienne normalisation. |
| `regulatoryRegimeId` | `String?` | Inchangé. Doit référencer un régime existant non retiré lors d'une mise à jour (R9). |

Statuts (`CountryStatus`, inchangé) : `draft → internal → partner_test → pilot → public`, `* → suspended → (internal | pilot | public)`, `* → retired` (terminal). Passer en `public` exige les conditions R4. Passer en `suspended` ou `retired` est toujours permis.

### CountryProduct
| Champ | Type | Règle |
|---|---|---|
| `status` | `String` | Création admin : `internal`. Valeurs : `internal`, `pilot`, `public`, `suspended`, `retired`. |
| `flags` | `Json` | Création admin : tous les flags produit à `false`, sauf `product_manual_review_required: true`. Une clé absente hérite du flag produit (R2). |

Le retrait d'une liaison est une suppression logique : statut `retired` et flags à `false`, avec audit.

### ConsentText
| Champ | Type | Règle |
|---|---|---|
| `content` | `String?` (`TEXT`) | Nouveau. Obligatoire pour toute création admin et pour toute publication. |
| `contentHash` | `String` | Calculée par le serveur : `sha256` du contenu normalisé (LF, espaces de bord retirés), en hexadécimal. |
| `retiredAt` | `DateTime?` | Nouveau. Renseigné au retrait. |

Statuts : `draft → review → published → retired`. Un texte publié est immuable ; seule la transition vers `retired` reste possible.

### QuoteRequest
| Champ | Type | Règle |
|---|---|---|
| `language` | `String` (défaut `"fr"`) | Nouveau. Langue du formulaire soumis (`fr` ou `en`). |

### RegulatoryRegime
Le modèle est inchangé, mais désormais lu et écrit via `PrismaRegulatoryRegimesRepository`. Statuts : `draft → active → suspended → active`, `* → retired`. Le retrait est refusé si un pays le référence.

### FeatureFlag / FeatureFlagHistory
Schéma inchangé. Les bascules du catalogue écrivent une ligne de journal :
- `scopeType = country`, avec `scopeId = countryId` ;
- `scopeType = product`, avec `scopeId = productId` (flag global du produit) ou `productId@countryId` (liaison).

## Contrats partagés (packages/shared/contracts)

- `catalog.contracts.ts` :
  - `countryCreateSchema` et `countryUpdateSchema` acceptent `phoneDialCode` et `phoneNationalLengths` ; `countryUpdateSchema` accepte `expectedUpdatedAt`.
  - Nouveaux schémas :
    - `catalogFlagToggleSchema { key, value, reason }`
    - `countryStatusChangeSchema { status, reason }`
    - `countryProductLinkCreateSchema { productId, reason }`
    - `catalogActionReasonSchema { reason }`
    - `regulatoryRegimeUpdateSchema`
  - Allowlists `COUNTRY_CATALOG_TOGGLEABLE_FLAGS` et `PRODUCT_CATALOG_TOGGLEABLE_FLAGS`.
  - Vues `AdminCountryView`, `AdminProductView`, `AdminCountryProductLinkView`.
- `compliance.contracts.ts` :
  - `adminConsentTextCreateSchema { purpose, countryId, productId?, channel, recipientCategory, language, version, content, reason }`, sans empreinte ;
  - `consentTextSchema.contentHash` reste requis côté domaine (le service le calcule quand un contenu est fourni) ;
  - nouveau champ `content?` ;
  - `consentTextTemplateSchema` ;
  - vue `AdminConsentTextView` (avec `contentHash`, `content`, `publishedAt`, `retiredAt`, `supersededBy?`).
- `quote.contracts.ts` :
  - `publicConsentTextSchema` gagne `content` (variables résolues), `language`, `templateHash` (= `contentHash`) ;
  - `publicQuoteFormResponseSchema` gagne `language` et `phoneRule { dialCode, nationalLengths } | null` ;
  - `quoteRequestCreateSchema` gagne `language` (`fr` | `en`, défaut `fr`) ;
  - vue admin des formulaires : `consentSuperseded: boolean`.

## Règles de validation

| Règle | Où | Erreur |
|---|---|---|
| Flag hors allowlist | `CatalogFlagService` | 403 `CATALOG_FLAG_NOT_TOGGLEABLE` |
| Activation pays sans checklist verte | `CatalogFlagService` / statut pays | 422 `ACTIVATION_BLOCKED` avec `blockers[]` |
| Activation publique par un rôle non conformité | idem | 403 |
| `product_quote_enabled` sans formulaire publié | idem | 422 `QUOTE_FORM_REQUIRED` |
| `product_public_enabled` sans consentement publié | idem | 422 `CONSENT_TEXT_REQUIRED` |
| Revue manuelle désactivée sur un produit sensible sans rôle conformité | idem | 403 |
| Consentement : formulation interdite / destinataire absent / « AssurMatch » absent / contenu vide | `ConsentService.publishText` | 422 `CONSENT_TEXT_INVALID` |
| Texte publié modifié | `ConsentService` | 409 |
| Formulaire publié avec un consentement d'une autre langue, d'un autre pays ou d'un autre produit | `QuoteFormDefinitionService.assertPublishable` | 422 (« consent text … does not match ») |
| Formulaire indisponible dans la langue demandée | route publique | 404 `QUOTE_FORM_LANGUAGE_UNAVAILABLE` + `availableLanguages` |
| Téléphone hors règle pays | `ProspectIdentityService` | 400 (« Phone is invalid for country ») |
| `expectedUpdatedAt` périmé | services pays, produit et régime | 409 `CATALOG_UPDATE_CONFLICT` |
| Régime retiré alors qu'il est référencé | `RegulatoryRegimesService` | 409 |
