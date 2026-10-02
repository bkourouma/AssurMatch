---
description: "Task list for 050 — Administration du catalogue, des consentements et de l'activation pays/produit"
---

# Tasks: 050 — Administration du catalogue, des consentements et de l'activation

**Input**: Design documents from `specs/050-admin-catalog-consent-activation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-catalog-api.md

**Continuous Workflow**: Eligible (spec validée par l'utilisateur le 2026-10-02, plan éligible). Arrêt sur échec bloquant de validation ou conflit constitutionnel.

**Tests**: obligatoires pour le RBAC, le périmètre pays, les flags (allowlist, activation conditionnée, désactivation immédiate), le consentement (contenu, empreinte, publication, langue), les endpoints publics et la séparation des applications.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (fondations partagées)

- [x] T001 Étendre `packages/shared/contracts/catalog.contracts.ts` :
  - règles téléphoniques (`phoneDialCode`, `phoneNationalLengths`) ;
  - `expectedUpdatedAt` sur les mises à jour ;
  - `catalogFlagToggleSchema`, `countryStatusChangeSchema`, `countryProductLinkCreateSchema`, `catalogActionReasonSchema`, `regulatoryRegimeUpdateSchema` ;
  - allowlists `COUNTRY_CATALOG_TOGGLEABLE_FLAGS` et `PRODUCT_CATALOG_TOGGLEABLE_FLAGS` ;
  - vues admin (feature flag / RBAC).
- [x] T002 [P] Étendre `packages/shared/contracts/compliance.contracts.ts` : `content` et `retiredAt` sur le texte ; `adminConsentTextCreateSchema` sans empreinte ; vue `AdminConsentTextView` ; schéma de modèle (consent).
- [x] T003 [P] Étendre `packages/shared/contracts/quote.contracts.ts` : `language` sur `quoteRequestCreateSchema` (défaut `fr`) ; `content` et `language` sur `publicConsentTextSchema` ; `language` et `phoneRule` sur `publicQuoteFormResponseSchema` ; `consentSuperseded` sur la vue admin des formulaires.
- [x] T004 Mettre à jour `backend/prisma/schema.prisma` (`Country.phoneDialCode` et `phoneNationalLengths`, `ConsentText.content` et `retiredAt`, `QuoteRequest.language`), créer `backend/prisma/migrations/0020_catalog_admin_consent_content/migration.sql` (additive), et ajouter la migration à `backend/tests/integration/prisma-migrations.spec.ts` (data history).

## Phase 2: Foundational (bloquant pour toutes les stories)

- [x] T005 Créer `RegulatoryRegimesRepository` (mémoire et Prisma) et rendre `RegulatoryRegimesService` asynchrone avec `create`, `update` (`expectedUpdatedAt`), `retire` (refusé si référencé) et `list`, dans `backend/src/modules/regulatory-regimes/`. Câbler dans `backend/src/runtime/assurmatch-runtime.ts`, y compris `runtimeRepositoryModes`. Audit.
- [x] T006 `ConsentService` (`backend/src/modules/consent/consent.module.ts`, `consent-records.repository.ts`) :
  - stockage du contenu ;
  - empreinte sha256 calculée sur le contenu normalisé ;
  - `publishText` refusé si le contenu est absent ou l'empreinte incohérente, si une formulation interdite est présente, ou, pour `lead_transmission`, si `{{brokerName}}` ou « AssurMatch » manque (422 `CONSENT_TEXT_INVALID`) ;
  - `retireText` ;
  - `resolveContent(text, vars)` ;
  - modèles chargés depuis `scripts/preprod/seeds/reference/consent-templates.json` ;
  - audit.
- [x] T007 Corriger l'adaptateur de consentements des formulaires dans `assurmatch-runtime.ts` : vraie finalité, langue, pays, produit et contenu.
- [x] T008 Créer `backend/src/modules/catalog/` avec :
  - `catalog-flag.service.ts` : allowlist ; activation conditionnée et désactivation libre ; écriture du JSON et de `FeatureFlag`/`FeatureFlagHistory` via `featureFlags.service.setFlag` ; audit des succès et des refus ;
  - `catalog-activation-guard.ts` : conditions R4, réutilisation de `activationChecklist.service.read`, contrôles ciblés en ignorant le flag ou le statut en cours de modification.

  Respecte la constitution III (feature flags), VII et IX.
- [x] T009 Ajouter le contrôle pays `country_active_licensed_partner` (au moins un partenaire actif, autorisé et licencié pour le pays) dans `backend/src/modules/activation-checklist/activation-checklist.service.ts` (licence).
- [x] T010 Garde de concurrence `expectedUpdatedAt` (409 `CATALOG_UPDATE_CONFLICT`) et validation du régime référencé dans `countries.module.ts` et `products.module.ts` (data history).

## Phase 3: User Story 1 — Pays et activation (P1) 🎯 MVP

**Independent Test**: passer le Sénégal en « interne » et activer `country_comparison_enabled` ; l'activation publique est refusée avec la liste des blocages.

- [x] T011 [US1] Routes `GET/POST /admin/countries`, `GET/PATCH /admin/countries/:id`, `POST /admin/countries/:id/status`, `POST /admin/countries/:id/flags` dans `backend/src/modules/http-wiring/runtime-http-wiring.module.ts` : RBAC, périmètre pays, publication réservée à la conformité, erreurs explicites (R11).
- [x] T012 [P] [US1] Tests d'intégration `backend/tests/integration/catalog/admin-countries-runtime-http.spec.ts` :
  - CRUD ;
  - Admin Pays hors périmètre (403 et audit) ;
  - activation publique refusée par checklist (422 avec blocages) ;
  - Admin Pays qui active le public (403) ;
  - suspension immédiate ;
  - flag IA refusé ;
  - 409 concurrence.
- [x] T013 [P] [US1] Tests unitaires `backend/tests/unit/catalog/catalog-flag.service.spec.ts` : allowlist, désactivation sans condition, historique et audit.
- [ ] T014 [US1] Admin : client API (`apps/admin/app/lib/admin-api.ts`), actions (`apps/admin/app/lib/catalog-actions.ts`), pages `apps/admin/app/catalog/page.tsx` (hub), `catalog/countries/page.tsx` et `catalog/countries/[countryId]/page.tsx` (fiche, statut, flags, liaisons, résumé de checklist), entrées de navigation dans `lib/ui/admin-shell.tsx`.
- [ ] T015 [P] [US1] Tests de marqueurs `apps/admin/tests/catalog-admin.spec.ts`. Mettre à jour `catalog-foundation.spec.ts` et `admin-ux-polish.spec.ts` si besoin, sans retirer les garde-fous de formulation.

## Phase 4: User Story 2 — Produits et liaisons (P1)

- [x] T016 [US2] Services produits : liaison créée en `internal` avec flags fermés, retrait logique, flags de liaison ; résolution du flag effectif `product && (link ?? true)` pour le parcours public, les offres et la checklist (`products.module.ts`, `products.repository.ts`, `public-journey-flag-policy.ts`).
- [x] T017 [US2] Routes `GET/POST /admin/products`, `GET/PATCH /admin/products/:id`, `POST /admin/products/:id/flags`, `GET/POST /admin/countries/:id/products`, `POST /admin/countries/:id/products/:productId/retire`, `POST /admin/countries/:id/products/:productId/flags`.
- [x] T018 [P] [US2] Tests d'intégration `backend/tests/integration/catalog/admin-products-runtime-http.spec.ts` :
  - `product_quote_enabled` refusé sans formulaire ;
  - `product_public_enabled` refusé sans consentement ;
  - revue manuelle d'un produit sensible réservée à la conformité ;
  - flags SN × Voyage sans effet sur CI × Voyage ;
  - suspension globale.
- [ ] T019 [US2] Admin : pages `catalog/products/page.tsx` et `catalog/products/[productId]/page.tsx`, formulaires de liaison et de flags de liaison sur la fiche pays.

## Phase 5: User Story 3 — Textes de consentement (P1)

- [x] T020 [US3] Routes `GET /admin/consent-texts`, `GET /admin/consent-texts/templates`, `GET /admin/consent-texts/:id` (aperçu), `POST /admin/consent-texts`, `POST /admin/consent-texts/:id/publish`, `POST /admin/consent-texts/:id/retire`.
- [x] T021 [P] [US3] Tests d'intégration `backend/tests/integration/consent/admin-consent-texts-runtime-http.spec.ts` :
  - empreinte calculée ;
  - formulation interdite (422) ;
  - destinataire absent (422) ;
  - texte publié immuable ;
  - Admin Pays qui publie (403) ;
  - nouvelle version, formulaires signalés ;
  - audit.
- [x] T022 [P] [US3] Tests unitaires du contenu, de l'empreinte et de la résolution des variables dans `backend/tests/unit/consent/consent-content.spec.ts`.
- [x] T023 [US3] Route publique du formulaire : contenu résolu, langue, `phoneRule`, 404 `QUOTE_FORM_LANGUAGE_UNAVAILABLE` (sans repli). La soumission valide le consentement dans la langue de la demande et stocke `language` (`quote-form-definition.service.ts`, `quote-submission.service.ts`, `quote-requests.repository.ts`, wiring).
- [ ] T024 [US3] Admin : pages `consent-texts/page.tsx` (liste, création depuis un modèle) et `consent-texts/[consentTextId]/page.tsx` (aperçu, publication, retrait), actions `lib/consent-actions.ts`, navigation.

## Phase 6: User Story 4 — Formulaires bilingues complets (P1)

- [x] T025 [US4] `quote-form-definition.service.ts` :
  - champs génériques ajoutés d'office, libellés selon la langue ;
  - publication refusée si le consentement n'est pas de la même langue, du même pays et du même produit ;
  - `consentSuperseded` dans la vue admin.
- [x] T026 [US4] Téléphone par pays dans `backend/src/modules/prospects/prospect-identity.service.ts`, avec la règle passée depuis la soumission ; ancien comportement conservé si le pays n'a pas de règle.
- [x] T027 [P] [US4] Tests :
  - unitaires : `quote-form-definition.service.spec.ts` (génériques, langue), `prospect-identity.service.spec.ts` (+225 avec 10 chiffres, +221 avec 9 chiffres, refus) ;
  - intégration publique : langue `en`, 404 de langue indisponible, consentement EN vérifié à la soumission.
- [ ] T028 [US4] Site public :
  - `getPublicQuoteForm` envoie la locale ;
  - la page affiche le message de langue indisponible avec un lien ;
  - `quote-form.tsx` affiche le contenu du consentement publié au lieu du libellé fixe, envoie `language`, et utilise `phoneRule` pour l'aide et le `pattern` ;
  - messages `fr.json` et `en.json` (séparation public/back-office).
- [ ] T029 [P] [US4] Tests de marqueurs publics `apps/public/tests/public-quote-form.spec.ts` (langue, contenu du consentement, téléphone) ; parité des clés i18n.
- [ ] T030 [US4] Admin `quote-form-definitions` : filtre de langue, alerte « consentement remplacé » (FR-019).

## Phase 7: User Story 5 — Checklist actionnable et seed (P2)

- [ ] T031 [US5] `apps/admin/app/activation-checklist/page.tsx` : filtres pays et produit, lien « Corriger » par contrôle (GET uniquement ; le test « pas de PATCH/POST » est conservé), libellé du nouveau contrôle partenaire.
- [ ] T032 [US5] `apps/admin/app/feature-flags/page.tsx` : bascule des flags globaux non sensibles existants (PATCH existant via une action), flags sensibles en lecture seule ; mise à jour de `apps/admin/tests/feature-flags.spec.ts` sans retirer les marqueurs de garde.
- [x] T033 [US5] `scripts/preprod/seed-reference.ts` et `seeds/reference/countries.json` :
  - CI et SN en fr et en, avec règles téléphoniques ;
  - flags et statut écrits à la création seulement ;
  - liaisons CI/SN × auto/voyage (`internal`, flags fermés) ;
  - consentements brouillons FR et EN par pays, avec contenu et empreinte, depuis `consent-templates.json`.
- [x] T034 [US5] `scripts/local-app/seed-broker-demo.ts` et helpers de test (`backend/tests/integration/runtime-http-test-utils.ts`, `helpers/comparator-quote-seed.ts`, smoke `runtime-postgres`) : contenu de consentement conforme et empreinte calculée.

## Phase 8: User Story 6 — Régimes (P3)

- [x] T035 [US6] Routes `GET/POST /admin/regulatory-regimes`, `PATCH /admin/regulatory-regimes/:id`, `POST /admin/regulatory-regimes/:id/retire` et tests d'intégration (retrait refusé si référencé, persistance).
- [ ] T036 [US6] Admin : page `catalog/regimes/page.tsx` (liste, création, édition, retrait).

## Phase 9: Polish & validations

- [x] T037 Mettre à jour `backend/tests/integration/runtime-route-inventory.spec.ts` (nouveaux contrôleurs) et les contrats OpenAPI de `specs/001-socle-plateforme/contracts/foundation-api.openapi.yaml` si les tests de contrat l'exigent.
- [ ] T038 Garde-fous : formulations interdites dans les nouveaux écrans et les modèles de consentement ; séparation (aucun import back-office dans `apps/public`).
- [ ] T039 Validations finales : `prisma generate`, `prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test` (`NODE_ENV=test`), `npm run test:web`, `node scripts/ci/secret-scan.mjs`.
- [ ] T040 Mettre à jour `docs/prd_coverage_map.md` (catalogue désormais atteignable) et cocher les tâches.

## Dependencies & Execution Order

- La phase 1, puis la phase 2, bloquent tout le reste.
- Backend : les US1 à US4 dépendent de T008 et T010. La US3 précède T025, à cause du contrôle de langue du consentement.
- L'interface admin (T014, T019, T024, T030, T031, T032, T036) commence une fois les routes de sa story câblées. Elle peut avancer en parallèle du site public (T028), car les fichiers sont disjoints.
- Les seeds (T033, T034) passent après T006 (calcul de l'empreinte).
- La phase 9 vient en dernier.
