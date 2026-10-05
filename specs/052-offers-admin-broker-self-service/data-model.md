# Data Model: 052

Migration `0022_offer_versions_selected_offer_routing`. Elle est additive, avec une reprise de données qui crée la version 1 de chaque offre existante.

## OfferVersion (nouveau)

Contenu (repris de `adminOfferUpsertSchema`) :
- `id`, `offerId`, `versionNumber Int` ;
- `name`, `shortDescription?`, `guaranteeSummary?`, `exclusionsSummary?`, `insurerName?` ;
- `guarantees Json`, `guaranteeLevel?`, `deductibleAmount?`, `coverageCeiling?`, `processingDelayDays?`, `paymentFlexibility?` ;
- `requiredDocuments String[]`, `sourceOfInformation?` ;
- `indicativePriceMin?`, `indicativePriceMax?`, `currency`, `pricingUnit?` ;
- `validFrom`, `validUntil`, `publicDisclaimers String[]` ;
- `isSponsored`, `sponsorLabel?`, `displayPriority`.

Cycle de vie et traçabilité :
- `status OfferVersionStatus` (`draft|submitted|published|archived|withdrawn`) ;
- `completenessScore Int` ;
- `authorId?`, `authorRole` (`broker|admin`), `submittedAt?` ;
- `decidedById?`, `decidedAt?`, `lastDecision?` (`validated|rejected`), `decisionReason?` ;
- `createdAt`, `updatedAt`.

Contraintes :
- `@@unique([offerId, versionNumber])` ;
- une seule version `published` et une seule version `draft|submitted` par offre, garanties par l'application (index partiels dans le SQL).

## Offer (colonnes ajoutées)

`publishedVersionId String?`, `pendingVersionId String?`, `offerType String @default("indicative")` (`indicative|partner`), `withdrawnAt DateTime?`.

Les colonnes de contenu de `Offer` contiennent **uniquement** le contenu de la version publiée, sauf pour une offre jamais publiée : `status draft`, `validationStatus pending`, et contenu de la v1 pour l'affichage admin, jamais public.

Transitions de `Offer.status` :
- `draft` → `active` (première validation) ;
- `active` → `suspended` → `active` (nouvelle validation par la conformité) ;
- `active` → `retired` (retrait).

Le statut effectif « expirée » est calculé.

## QuoteRequest (colonnes ajoutées)
`selectedOfferOutcome String?` (`accepted|ignored`), `selectedOfferIgnoredReason String?`.

## RoutingDecision (colonnes ajoutées)
`selectedOfferId String?`, `selectedOfferOutcome String?` (`retained|unavailable|none`).

## Notification
Types ajoutés : `offer_validated`, `offer_rejected`, `offer_suspended`, `offer_expiring`.

## Contrats partagés
- `offer-content.ts` (nouveau) :
  - `offerContentSchema` (sans sponsorisation) et `adminOfferContentSchema` (avec sponsorisation) ;
  - `offerCompleteness()` et `OFFER_COMPLETENESS_REQUIRED`.
- `quote.contracts.ts` :
  - `adminOfferUpsertSchema` réutilise le contenu et ajoute `partnerTenantId` et `reason` ;
  - `offerRejectSchema { reason }` ;
  - vues `AdminOfferDetailView` (versions, différences) et `BrokerOfferView` ;
  - réponse de soumission avec `selectedOfferPartnerRetained`.
- RBAC : `broker_offers:read` et `broker_offers:write`.
