# Data Model: 053

Migration `0024_broker_self_service`, écrite à la main et additive. Aucune donnée existante n'est réécrite.

## Enums
- `PartnerChangeRequestType` : `profile_change | coverage_extension`.
- `PartnerChangeRequestStatus` : `pending | accepted | rejected | cancelled`.

## PartnerChangeRequest (nouveau)
| Champ | Type | Règle |
|---|---|---|
| `id` | `String @id` | uuid |
| `partnerTenantId` | `String` | Toujours le tenant de l'acteur courtier. |
| `type` | `PartnerChangeRequestType` | |
| `status` | `PartnerChangeRequestStatus @default(pending)` | `pending → accepted | rejected | cancelled` ; décision définitive. |
| `requestedChanges` | `Json` | `profile_change` : sous-ensemble de `legalName`, `tradeName`, `registrationNumber`, `countryId` ; `coverage_extension` : `countryId` ou `productId`. |
| `previousValues` | `Json @default("{}")` | Valeurs au moment de la demande (profil). |
| `justification` | `String` | 10 à 1 000 caractères. |
| `requestedById` | `String?` | |
| `decidedById` | `String?` | |
| `decidedAt` | `DateTime?` | |
| `decisionReason` | `String?` | Motif admin (≥ 8) ou motif d'annulation. |
| `createdAt`, `updatedAt` | `DateTime` | |

Index : `(partnerTenantId, status)`, `(status, createdAt)`.

## Entités existantes utilisées
- `PartnerTenant` : champs directs (contacts, `primaryEmail`, `primaryWhatsApp`, `city`, `partnerInsurers`).
- `PartnerLicense` : renouvellement `draft` avec `renewsLicenseId` ; `draft → pending_review` à la preuve saine.
- `AccreditationDocument` : preuve `documentType = license`, rattachée à la licence.
- `User` : statut `invited | active | suspended` pour l'équipe ; rôles courtiers non propriétaires.
- `PartnerCountryAuthorization` / `PartnerProductAuthorization` : lecture et création à l'acceptation d'une extension.

## Contrats partagés (`broker-self-service.contracts.ts`)
- `brokerProfileUpdateSchema` (strict), `partnerProfileChangeRequestSchema`, `partnerCoverageExtensionRequestSchema`, `partnerRequestCancelSchema`, `partnerRequestDecisionSchema`, `adminPartnerRequestListQuerySchema` ;
- `brokerLicenseRenewalSchema`, `brokerLicenseProofUploadSchema` ;
- `brokerTeamInviteSchema`, `brokerTeamRoleChangeSchema`, `brokerTeamActionSchema` ;
- vues `BrokerAccountView`, `BrokerCoverageView`, `BrokerLicenseView`, `BrokerTeamMemberView`, `PartnerChangeRequestView`.
- `error-codes.ts` : `TEAM_LAST_OWNER`, `TEAM_SELF_ACTION`, `PARTNER_REQUEST_PENDING`, `PARTNER_REQUEST_ALREADY_DECIDED`.
