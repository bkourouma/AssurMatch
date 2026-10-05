# Data Model: 051

Migration `0021_partner_onboarding_lifecycle`, écrite à la main et additive. Les nouvelles valeurs d'enum sont ajoutées avec `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. Aucune donnée existante n'est réécrite.

## Enums
- `PartnerStatus` : `+ active_test`.
- `LicenseStatus` : `+ superseded`.
- `DocumentType` : `+ partnership_contract`.
- Nouveau `AccreditationScanStatus` : `pending | clean | infected | failed`.

## PartnerTenant (colonnes ajoutées)
| Champ | Type | Règle |
|---|---|---|
| `countryId` | `String?` | Pays principal. Requis à la création par l'admin, et pour le périmètre de l'Admin Pays. |
| `adminContactName/Email/Phone` | `String?` | E-mail valide ; téléphone E.164 ou selon la règle du pays. |
| `commercialContactName/Email/Phone` | `String?` | idem |
| `partnerInsurers` | `String[]` (défaut `[]`) | Noms, 0 à 20 entrées. |
| `slaTargetMinutes` | `Int?` | Entre 5 et 10 080 minutes. |
| `statusReason` | `String?` | Motif de la dernière transition. |
| `previousActiveStatus` | `PartnerStatus?` | Renseigné à la suspension. |

Index unique partiel `(countryId, registrationNumber)` lorsque les deux colonnes sont renseignées.

Transitions (statut effectif « Expiré » calculé, R1) :
- `draft → pending_compliance` ;
- `pending_compliance → active_test | active` (conditions) ;
- `active_test ↔ active` (conditions) ;
- `active_test | active → suspended` ;
- `suspended → previousActiveStatus` (conditions) ;
- `* → retired` (terminal).

## PartnerStatusHistory (nouveau)
`id, partnerTenantId, fromStatus, toStatus, reason, actorId, createdAt`, avec un index sur `(partnerTenantId, createdAt)`.

## PartnerLicense (colonnes ajoutées)
`statusReason String?`, `renewsLicenseId String?`.
Statuts : `draft → pending_review → valid → suspended | revoked | superseded` ; `suspended → valid` (réactivation, si non expirée) ; `expired` est calculé à la lecture (date dépassée).

## PartnerLicenseHistory (nouveau)
`id, licenseId, partnerTenantId, fromStatus, toStatus, reason, actorId, createdAt`.

## AccreditationDocument (colonnes ajoutées)
`fileName String?`, `mimeType String?`, `sizeBytes Int?`, `scanStatus AccreditationScanStatus @default(pending)`, `scanEngine String?`, `scannedAt DateTime?`, `reviewReason String?`.
Le statut de revue existant (`DocumentStatus`) passe de `uploaded` à `accepted`, `rejected` ou `superseded`. L'acceptation exige `scanStatus = clean`.

## PartnerContract (nouveau)
`id, partnerTenantId, version, signedAt, signatoryName, documentId, recordedById, createdAt`, avec unicité `(partnerTenantId, version)`.

## PartnerCountryAuthorization / PartnerProductAuthorization (colonnes ajoutées)
`withdrawnAt DateTime?`, `withdrawalReason String?`. `status` vaut `active` ou `withdrawn` (valeurs écrites par l'application).

## PartnerApplication (colonnes ajoutées)
`rejectionReasonCode String?`, `locale String @default("fr")`, `decidedAt DateTime?`. Les champs existants `reviewedById`, `reviewedAt`, `reviewNote` et `partnerTenantId` sont désormais renseignés.

## Contrats partagés
- `partner.contracts.ts` :
  - enum de statut étendu, `partnerAdminCreateSchema` et `partnerAdminUpdateSchema` (avec `expectedUpdatedAt` et `reason`) ;
  - `partnerStatusTransitionSchema { status, reason }`, `partnerAuthorizationSchema { countryId | productId, reason }` ;
  - licences : `partnerLicenseCreateSchema`, `partnerLicenseActionSchema { reason }`, `partnerLicenseRenewSchema` ;
  - `accreditationDocumentReviewSchema { decision: accepted|rejected, reason }`, `partnerContractCreateSchema` ;
  - `partnerUserInviteSchema { email, displayName, role, reason }` ;
  - vues `AdminPartnerView`, `AdminPartnerDetailView` (licences, documents sans clé de stockage, contrats, couverture, utilisateurs, historique, `activationBlockers`, `effectiveStatus`).
- `partner-application.contracts.ts` : `partnerApplicationDecisionSchema` ({ `convert` | `reject` + `rejectionReasonCode` | `review` }, `reason`) et `locale` facultatif à la soumission.
- `error-codes.ts` : `PARTNER_ACTIVATION_BLOCKED`, `PARTNER_SUSPENDED`, `PARTNER_TRANSITION_INVALID`, `LICENSE_DOCUMENT_REQUIRED`, `DOCUMENT_QUARANTINED`, `APPLICATION_ALREADY_DECIDED`.
