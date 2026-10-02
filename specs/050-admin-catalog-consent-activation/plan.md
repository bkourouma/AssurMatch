# Implementation Plan: Administration du catalogue, des consentements et de l'activation pays/produit

**Branch**: `claude/inspiring-maxwell-58e67d` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/050-admin-catalog-consent-activation/spec.md`

**Continuous Workflow Eligibility**: Eligible. L'utilisateur a validé la spec le 2026-10-02 ; elle ne contient aucun marqueur `[NEEDS CLARIFICATION]`. Il s'agit d'une feature standard, sans activation de module réglementé. Le workflow s'arrête en cas d'échec de validation bloquant ou de conflit constitutionnel découvert pendant l'implémentation.

## Summary

Cette spec expose au back-office, de bout en bout, l'administration du catalogue : pays, produits, liaisons pays-produit, régimes réglementaires et textes de consentement. Elle ajoute la bascule contrôlée des flags pays et produit, dont l'activation est conditionnée par la checklist constitutionnelle et la désactivation reste toujours immédiate.

Côté consentement, le **contenu** du texte est désormais stocké, avec une empreinte calculée par le serveur, et affiché tel quel sur le site public. Le formulaire de devis devient bilingue (langue demandée, langue enregistrée sur la demande, aucun repli silencieux) et reçoit les champs génériques du PRD. Le téléphone est validé selon la règle du pays.

Enfin, le seed de référence est complété (CI, SN, liaisons, modèles de consentement) et ne réécrit plus les flags lorsqu'on le relance.

L'approche technique est détaillée dans [research.md](./research.md) (R1 à R15), le modèle de données dans [data-model.md](./data-model.md) et les routes dans [contracts/admin-catalog-api.md](./contracts/admin-catalog-api.md).

## Technical Context

**Language/Version**: TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) ; Node ≥ 24 visé (CI), validé localement sous Node 22
**Primary Dependencies**: NestJS 11 (câblage HTTP déclaratif dans `runtime-http-wiring.module.ts`), Next.js 16.3 (app router, `useActionState`), Prisma 7.8, zod 4, next-intl (site public)
**Storage**: PostgreSQL via Prisma (dépôts mémoire sous `NODE_ENV=test`) ; Redis pour le cache des flags
**Testing**: Vitest (unitaires, intégration HTTP via `createRuntimeHttpHarness`, contrats, garde-fous) ; Playwright en marqueurs de source (`npm run test:web`)
**Target Platform**: API NestJS, back-office admin Next.js, site public Next.js
**Impacted Application(s)**: Backend API ; Back-office Plateforme (`apps/admin`) ; Web Publique Client (`apps/public`, formulaire de devis uniquement) ; packages partagés (`packages/shared/contracts`) ; base de données (migration `0020`) ; scripts de seed (`scripts/preprod`, `scripts/local-app`)
**Project Type**: Marketplace B2B2C réglementée
**Performance Goals**: Une désactivation est effective en moins d'une minute (cache des flags invalidé à l'écriture). Les écrans admin chargent en moins d'une seconde avec 50 pays et 20 produits.
**Constraints**: Aucun flag sensible modifiable ; aucune ouverture publique sans checklist verte ; contenu de consentement publié immuable ; aucune route back-office dans le site public
**Scale/Scope**: 9 pays et 15 produits au référentiel ; 2 pays et 2 produits ouverts au lancement

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Rôle de plateforme technique | Pass | Aucun parcours de vente ou de souscription. Les textes `lead_transmission` doivent contenir « AssurMatch » et désigner le destinataire (R5). |
| Réglementation et consentement | Pass | Le contenu exact du consentement est stocké, affiché et prouvé par empreinte (R5). Un formulaire ne peut être publié qu'avec un consentement de la même langue, du même pays et du même produit (R6). Les contrôles de licence sont inchangés. L'ouverture publique exige au moins un partenaire licencié (R4). |
| Flags et activation | Pass | Allowlist explicite (R3). Activation conditionnée par la checklist et réservée à la conformité pour l'ouverture publique (R4). Désactivation toujours immédiate. Historique dans `FeatureFlagHistory` (R1). |
| Séparation des applications | Pass | Écrans dans `apps/admin` uniquement. Le site public ne lit que des contenus publiés par des routes publiques existantes (R6). Aucune dépendance à une session back-office. |
| Sécurité et RBAC | Pass | Classe de route protégée (authentification et MFA). Permissions de la matrice existante, sans élargissement (R12). Périmètre pays de l'Admin Pays. Motif obligatoire. Aucun export ajouté. |
| Données et audit | Pass | AuditLog sur chaque mutation et chaque refus. `createdAt`, `updatedAt` et `createdBy` renseignés. Migration additive uniquement. Historique des flags. Version et empreinte des consentements. |
| Intégrité du routage | Pass | Indirecte : la désactivation d'un pays ou d'un produit bloque les nouvelles demandes. Aucune règle de routage modifiée. |
| IA | N/A | Aucun appel IA. Les flags IA sont exclus de l'allowlist. |
| UX et contenu | Pass | `findForbiddenWording` s'applique aux consentements et aux libellés de formulaire. La mention « offre indicative » est inchangée. |
| Tests | Pass | Tests prévus : unitaires (services catalogue, flags, consentement, téléphone, formulaires), intégration HTTP (RBAC, périmètre, conditions, 409, 422), garde-fous (formulations, séparation), marqueurs Playwright admin et public. |
| Asynchrone | Pass | Aucun traitement lourd. Les écritures sont synchrones et légères. |
| Continuité du workflow | Pass | La spec est validée. Arrêt prévu si une validation bloque. |

## Project Structure

### Documentation (this feature)

```text
specs/050-admin-catalog-consent-activation/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/admin-catalog-api.md
  checklists/requirements.md
  tasks.md
```

### Source Code (repository root)

```text
packages/shared/contracts/
  catalog.contracts.ts            # schémas pays/produit/liaison/flags, allowlists, vues
  compliance.contracts.ts         # contenu de consentement, création admin, vues
  quote.contracts.ts              # langue, consentement public enrichi, phoneRule
backend/prisma/
  schema.prisma                   # Country.phone*, ConsentText.content/retiredAt, QuoteRequest.language
  migrations/0020_catalog_admin_consent_content/migration.sql
backend/src/modules/
  catalog/                        # NOUVEAU : catalog-flag.service.ts, catalog-activation-guard.ts, catalog-admin.service.ts
  countries/                      # update avec expectedUpdatedAt, phone rules, statut
  products/                       # liaisons (création internal, retrait, flags), update concurrent
  regulatory-regimes/             # dépôt mémoire et Prisma, update, retire
  consent/                        # contenu, empreinte, publication contrôlée, retrait, modèles
  quote-forms/                    # champs génériques, contrôle langue/pays/produit, pas de repli
  quote-requests/                 # langue, consentement dans la langue
  prospects/                      # règle téléphonique par pays
  activation-checklist/           # contrôle partenaire actif licencié par pays
  http-wiring/runtime-http-wiring.module.ts   # nouvelles routes admin + public enrichi
backend/src/runtime/assurmatch-runtime.ts      # composition (dépôt régimes, adaptateur consentements)
apps/admin/app/
  catalog/ (hub, countries/, products/, regimes/)
  consent-texts/
  feature-flags/ activation-checklist/ quote-form-definitions/ (évolutions)
  lib/admin-api.ts, lib/catalog-actions.ts, lib/consent-actions.ts, lib/ui/admin-shell.tsx
apps/public/app/
  [locale]/countries/[countryCode]/products/[productKey]/quote/page.tsx
  components/quote-form.tsx, lib/public-api.ts, messages/{fr,en}.json
scripts/preprod/seed-reference.ts + seeds/reference/countries.json
scripts/local-app/seed-broker-demo.ts           # contenu de consentement (compatibilité)
backend/tests/{unit,integration,contract,guardrails}/…
apps/admin/tests/*.spec.ts, apps/public/tests/*.spec.ts
```

**Structure Decision**: Pas de nouvelle application. Un nouveau dossier `backend/src/modules/catalog/` regroupe l'orchestration transverse : bascule des flags, conditions d'activation, vues agrégées. Les modules pays, produits, consentement et régimes conservent leur logique propre. Les routes admin restent dans le câblage HTTP central et les écrans dans `apps/admin`. Le site public ne reçoit que des changements de formulaire.

## Phasing (implémentation)

1. **Fondations** : contrats partagés, schéma Prisma, migration 0020, test d'inventaire des migrations.
2. **Domaine** : régimes persistés ; contenu et empreinte des consentements ; services pays et produits (concurrence, liaisons) ; `CatalogFlagService` et garde d'activation ; contrôle partenaire de la checklist ; formulaires (langue, champs génériques, contrôles de publication) ; soumission (langue) ; règle téléphonique.
3. **HTTP** : câblage des routes admin et des routes publiques enrichies ; tests d'intégration.
4. **Back-office admin** : client API, actions, écrans catalogue, consentements, flags, checklist, alerte sur les formulaires ; tests de marqueurs.
5. **Site public** : langue, texte de consentement publié, règle téléphonique, message de langue indisponible ; tests de marqueurs.
6. **Seeds** : seed de référence (CI, SN, liaisons, modèles, flags à la création seulement) ; seed démo (contenu de consentement, CI et SN).
7. **Validations finales** : génération Prisma, `prisma validate`, typecheck, lint, `npm run test`, `npm run test:web`, scan de secrets.

## Complexity Tracking

Aucune violation constitutionnelle à justifier.
