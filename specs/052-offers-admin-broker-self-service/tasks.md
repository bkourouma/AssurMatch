---
description: "Task list for 052 — Offres"
---

# Tasks: 052 — Offres

**Continuous Workflow**: Eligible (spec validée le 2026-10-03).
**Tests**: obligatoires pour le RBAC, l'isolation par courtier, les versions (aucun changement public sans validation), la complétude, la validation (éligibilité et dates), le routage prioritaire (retenu, indisponible, offre falsifiée), la garde de lecture seule et la séparation des applications.

## Phase 1: Setup
- [x] T001 `packages/shared/contracts/offer-content.ts` (schémas de contenu, complétude) ; `quote.contracts.ts` (vues, réponse de soumission) ; `error-codes.ts` (`OFFER_SCOPE_NOT_COVERED`, `OFFER_INCOMPLETE`, `OFFER_VALIDATION_BLOCKED`, `OFFER_VERSION_CONFLICT`).
- [x] T002 Matrice RBAC `broker_offers:read/write` (+ miroir `apps/broker/app/lib/broker-permissions.ts`).
- [x] T003 Schéma, migration 0022 avec reprise de la v1, `prisma-migrations.spec.ts`.

## Phase 2: Backend
- [x] T004 Dépôt de versions (mémoire et Prisma) et service de cycle de vie (créer, modifier, soumettre, valider en copiant dans `Offer`, refuser, suspendre, retirer, renouveler) ; audit avant/après ; notifications in-app (R9).
- [x] T005 [US1] Routes `/broker/offers` (couverture licenciée, isolation 404, garde d'écriture, inventaire des routes d'écriture).
- [x] T006 [US2][US5] Routes `/admin/offers` (filtres et périmètre, file de validation, détail avec différences, validation avec contrôles et réservée à la conformité, refus, suspension, sponsorisation réservée à l'admin).
- [x] T007 [US4] Soumission (vérification de l'offre, `selectedOfferOutcome`) ; routage prioritaire et `RoutingDecision` ; consentement nommé (`offerId` dans le formulaire, `intendedRecipient`) ; réponse `selectedOfferPartnerRetained`.
- [x] T008 [P] Tests unitaires et d'intégration : US1 à US5, plus les cas limites de la spec.
- [x] T009 Seeds et helpers (v1 publiée), ajustement des tests RBAC du comparateur.

## Phase 3: Interfaces
- [x] T010 [US2][US5] Admin `apps/admin/app/offers` : liste filtrée, file « à valider », fiche avec versions et différences, création et modification pour un courtier, validation, refus et suspension (conformité seulement), sponsorisation ; tests de marqueurs.
- [x] T011 [US1][US3] Courtier `apps/broker/app/offers` : liste (statut, complétude, expiration), création, modification (nouvelle version), soumission, retrait, renouvellement, motif de refus visible ; lecture seule pour Agent, Read-only et compte suspendu ; navigation ; tests de marqueurs.
- [x] T012 [US4] Public : `offerId` transmis au formulaire, nom du courtier dans l'en-tête, message de confirmation selon `selectedOfferPartnerRetained` (FR et EN) ; tests de marqueurs.

## Phase 4: Validations
- [ ] T013 Validations finales : `prisma generate` et `validate`, typecheck, lint, `npm run test`, `npm run test:web`, scan de secrets, builds Next.
- [ ] T014 Carte de couverture et tâches cochées.
