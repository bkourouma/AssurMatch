# Tâches : écarts PRD catalogue et offres (spec 070)

**Spec** : `spec.md` | **Plan** : `plan.md`

- [x] T001 Prisma + migration additive `0034_catalog_offers_gaps` (catégories, `legalNotice`, `requiredDocumentKinds`, `version`, `ProductVersion`, `Insurer`, `ActivationAttestation`, `insurerId`) avec reprise des assureurs et des versions 1.
- [x] T002 US1/US2 Catégories produit (service, dépôts mémoire/Prisma, contrôleur), champs produit `legalNotice` / `requiredDocumentKinds`, versions et diff, exigences publiques, garde §36 (`products/**`, `catalog/**`, `catalog.contracts.ts`).
- [x] T003 US3/US4 Référentiel Assureur, lien offre-assureur, types d'offre `insurer` et `private`, politique de publication `offer_private`, tests de non-exposition (`insurers/**`, `offers/**`, `offer-content.ts`, `insurer.contracts.ts`).
- [x] T004 US5 Résumé IA d'offre `offer_summary` (type d'assistance admin, guardrails, service de lecture seule admin/courtier).
- [x] T005 US6 Checklists §35/§36, attestations manuelles (dépôt, service, contrôleur), `productActivationBlockers`.
- [x] T006 Câblage runtime et HTTP (`lot4-catalog-http.controllers.ts`, blocs `// Lot 4 (spec 070)`), tests d'intégration HTTP `lot4-*`.
- [x] T007 Back-office admin : catégories, formulaire produit, historique, attestations de la checklist.
- [x] T008 Back-office admin et courtier : types d'offre, assureur lié, référentiel Assureur, encart résumé IA en lecture seule.
- [x] T009 Seed de référence : 14 catégories (jamais réécrites), `insurers.json`, catégorie des produits posée seulement si absente.
- [x] T010 Réparation des tests, fixtures et seeds d'ouverture publique ; codes d'erreur.
- [x] T011 Validations : typecheck, lint, vitest, Playwright, `prisma validate`, scan de secrets.
