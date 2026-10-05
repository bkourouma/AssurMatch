# Research: 052 — Offres

## Constats (audit du code, 2026-10-03)

| # | Constat | Preuve |
|---|---|---|
| C1 | `Offer` ne porte aucune version : seulement `OfferHistory`, un journal. `update` écrase les champs et ne remet pas la validation à zéro, donc une offre validée reste publique après modification. | `schema.prisma:971-1023`, `offer-admin.service.ts:63` |
| C2 | `validate` ne vérifie ni complétude, ni éligibilité, ni dates, ni statut. | `offer-admin.service.ts:107` |
| C3 | `GET /admin/offers` ignore le périmètre pays. `PATCH` vérifie le pays du corps, pas celui de l'offre stockée. | `runtime-http-wiring.module.ts:360-400` |
| C4 | Aucune route ni page d'offres côté courtier. Aucune permission `offers:` pour les rôles courtier. | `assurmatch-role-matrix.ts`, `apps/broker/app` |
| C5 | `selectedOfferId` est enregistré sans vérification et n'est pas lu par le routage. `RoutingDecision` ne référence aucune offre. | `quote-submission.service.ts:245`, `quote-routing.service.ts:73-129` |
| C6 | Toute la lecture publique (catalogue, scoring, comparaison, popularité) lit les colonnes de `Offer`. | `public-offer-catalog.service.ts`, `offer-scoring.ts` |
| C7 | L'expiration est calculée à la lecture. Aucun rappel n'existe. | `offer-publication-policy.ts` |
| C8 | `adminOfferUpsertSchema` applique la garde de formulations et vérifie l'ordre des dates, mais pas l'ordre des prix. | `quote.contracts.ts:146-195` |

## Décisions

### R1 — Versions : `Offer` reste la projection publiée
- **Decision**: Nouvelle table `OfferVersion`. Elle porte le contenu complet, le numéro, le statut, l'auteur, la soumission et la décision (décideur, date, motif). La ligne `Offer` reste **la projection de la version publiée** :
  - à la validation d'une version, son contenu est copié dans `Offer` (statut `active`, `validationStatus` `validated`) ;
  - un brouillon ou une version soumise ne touche **jamais** les colonnes de contenu de `Offer`.

  Une offre jamais publiée garde `Offer.status = draft` et `validationStatus = pending`. Elle n'est donc pas publique : la règle de publication existante l'exclut. `Offer` reçoit les colonnes `publishedVersionId`, `pendingVersionId`, `offerType` (`indicative|partner`) et `withdrawnAt`.
- **Rationale**: Toute la lecture publique (C6) reste inchangée, donc la régression est quasi nulle. FR-002 et FR-014 sont garantis par construction.
- **Alternatives considered**: Faire lire au public la table des versions (réécriture du catalogue, du scoring et des tests) ; un statut `pending` sur `Offer` (perdrait la version publiée pendant la revue).

### R2 — Statuts de version
Enum `OfferVersionStatus` : `draft`, `submitted`, `published`, `archived`, `withdrawn`.
- **Refus** : la version repasse en `draft`, avec `lastDecision = rejected` et un motif.
- **Suspension** : `Offer.status = suspended`, et la version publiée reste `published`. Lever la suspension revient à une nouvelle validation de la même version, par la conformité.
- **Retrait** par le courtier : `Offer.status = retired` et version `withdrawn`.
- **Expiration** : statut effectif calculé (`validUntil <= now`).
- **Renouvellement** : nouvelle version portant de nouvelles dates.

### R3 — Complétude et validations partagées
- **Decision**: Fonction pure `offerCompleteness(content)`, placée dans `packages/shared/contracts/offer-content.ts` et réutilisée par l'API, l'admin et le portail courtier.
  - **Minimum** : nom, assureur, au moins une garantie, prime ou fourchette, `validUntil` futur, source.
  - **Score** : pourcentage de champs PRD renseignés.
  - Le schéma de contenu ajoute `indicativePriceMin <= indicativePriceMax` et conserve la garde de formulations et l'ordre des dates.
- **À la validation**, le serveur revérifie :
  - le minimum de complétude ;
  - les mentions indicatives ;
  - les dates ;
  - l'éligibilité du courtier pour le pays et le produit (`publicOfferPartnerEligibility` existant : `active`, capacité, autorisations, licence valide).

### R4 — RBAC
- **Decision**: Nouvelles permissions dans la matrice :
  - `broker_offers:read` : tous les rôles courtier ;
  - `broker_offers:write` : `broker_owner_starter`, `broker_owner_pro`, `broker_manager`.

  Elles sont reflétées dans `apps/broker/app/lib/broker-permissions.ts`.
- **Côté admin** :
  - `offers:read` reste filtré par le périmètre pays (corrige C3) ;
  - créer ou modifier pour le compte d'un courtier exige `offers:update`, avec le périmètre vérifié sur le pays **stocké** ;
  - valider, refuser, suspendre ou lever une suspension est réservé à `compliance_admin` et `super_admin`. C'est une restriction de l'existant, qui autorisait `admin_pays` et `content_admin`.
- **Sponsorisation** : admin seulement. Le schéma de contenu courtier exclut `isSponsored`, `sponsorLabel` et `displayPriority`.

### R5 — Routes courtier
`/broker/offers` (classe protégée) :
- `GET /`, `GET /:id` (avec versions) ;
- `POST /` (création, v1 brouillon) ;
- `PATCH /:id` : modifie la version en cours, ou en crée une à partir de la publiée ;
- `POST /:id/submit`, `/:id/withdraw`, `/:id/renew`.

Les écritures passent par `brokerWriteActor` et sont ajoutées à `BROKER_TENANT_WRITE_GUARDED` (inventaire de la spec 051). Le périmètre est le `partnerTenantId` de l'acteur. Une offre d'un autre courtier renvoie 404.
- **Couverture** : licence valide et autorisations actives pour le pays et le produit (via `partners.service` et `partnerLicenses.service.eligible`).

### R6 — Routes admin
`/admin/offers` :
- `GET` (filtres, avec un paramètre `queue=submitted`), `GET /:id` (versions et différences) ;
- `POST` (création pour un courtier), `PATCH /:id` (versionné) ;
- `POST /:id/validate` (valide la version soumise), `/:id/reject` (nouveau), `/:id/suspend`.

La validation sans version soumise renvoie 409.

### R7 — Routage vers le courtier de l'offre
- **Soumission** : l'offre choisie est vérifiée (existe, publiée selon la règle de publication, non expirée, même pays et même produit).
  - Champs de `QuoteRequest` : `selectedOfferOutcome` (`accepted|ignored`) et `selectedOfferIgnoredReason`.
  - Si elle est acceptée, `preferredPartnerTenantId` est passé au routage.
- **Routage** (`quote-routing.service.ts`), après le calcul des éligibles et avant la sélection :
  - si le courtier préféré est éligible (éligibilité déterministe, quota compris), il est sélectionné **seul**, avec la raison `selected_offer_partner` et quel que soit le mode, sauf `manual` qui reste manuel ;
  - sinon, le routage standard s'applique, avec la raison `selected_offer_partner_unavailable:<motif>`.
- **Journal** : `RoutingDecision` reçoit `selectedOfferId` et `selectedOfferOutcome` (`retained|unavailable|none`).
- **Réponse de soumission** : elle ajoute `selectedOfferPartnerRetained: boolean | null`.

### R8 — Consentement nommé
- **Formulaire** : `GET …/quote-form?language=&offerId=`. Si l'offre est publique pour ce pays et ce produit, et son courtier éligible, la variable `{{brokerName}}` est résolue avec le nom commercial du courtier (sinon la raison sociale). L'empreinte du modèle est inchangée.
- **Destinataire prévu** : à la soumission avec offre retenue, le `ConsentRecord.intendedRecipient` vaut `partner:<partnerTenantId>`.
- **Site public** : il transmet `offerId` au chargement du formulaire, affiche le nom du courtier dans l'en-tête du formulaire, et affiche un message de confirmation selon `selectedOfferPartnerRetained`.

### R9 — Notifications courtier
Notifications in-app existantes, avec de nouveaux types : `offer_validated`, `offer_rejected`, `offer_suspended`, `offer_expiring`.
- **J-15** : l'alerte est créée de façon idempotente, une fois par version, au moment où le courtier ou l'admin consulte la liste d'offres. La page affiche aussi un badge calculé.
- **Hors périmètre** : un ordonnanceur dédié, prévu par la spec 061.

### R10 — Migration 0022
- **Ajouts** :
  - table `OfferVersion` et enum `OfferVersionStatus` ;
  - colonnes `Offer.publishedVersionId`, `pendingVersionId`, `offerType` et `withdrawnAt` ;
  - colonnes `QuoteRequest.selectedOfferOutcome` et `selectedOfferIgnoredReason` ;
  - colonnes `RoutingDecision.selectedOfferId` et `selectedOfferOutcome` ;
  - valeurs de type de notification.
- **Reprise des données** : `INSERT INTO "OfferVersion" SELECT …` crée la version 1 de chaque offre existante. Elle est `published` si l'offre est validée, `draft` sinon, et `publishedVersionId` est renseigné. La migration n'ajoute et ne réécrit rien d'autre.

### R11 — Seeds et tests
Le seed démo, les helpers de test et le smoke Postgres créent une version 1 publiée pour chaque offre active. Les tests RBAC du comparateur sont ajustés à la restriction de R4.

### R12 — Hors périmètre
Offres assureur et offres privées, résumé et cohérence par IA, nom du courtier retenu sur la confirmation et le suivi (spec 054), ordonnanceur d'expiration (spec 061).

## Écarts retenus à l'implémentation (2026-10-03)

- **Règle de routage exclusive** : une règle `exclusive` reste une contrainte déterministe. Le courtier de l'offre n'est prioritaire que s'il est le partenaire exclusif ; sinon, la décision enregistre `selected_offer_partner_unavailable:exclusive_rule` (principe VII).
- **Mode manuel** : la demande est mise en attente ; la décision enregistre l'offre avec le résultat `unavailable`.
- **Courtier obligatoire** : une offre sans courtier ne peut pas être validée (`partner_missing`). La couverture licenciée est aussi vérifiée quand l'admin rattache un courtier.
- **Modification d'une version soumise** : elle la renvoie en brouillon, et une nouvelle soumission est requise.
- **Offre ignorée** : `selectedOfferId` reste stocké, avec `selectedOfferOutcome = ignored`. Une offre ignorée ne compte pas dans la popularité.
- **Codes HTTP** : les décisions admin répondent 201 (défaut Nest, attendu par les tests existants). Côté courtier, la soumission et le retrait répondent 200.
