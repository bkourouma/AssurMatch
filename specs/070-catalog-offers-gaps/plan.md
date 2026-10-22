# Implementation Plan: Écarts PRD catalogue et offres (spec 070)

**Spec** : [spec.md](./spec.md) | **Lot** : 4 des écarts PRD | **Migration** : `0034_catalog_offers_gaps` (additive)

**Continuous Workflow Eligibility** : feature standard, aucune activation de module réglementé ; aucun `[NEEDS CLARIFICATION]`. Arrêt en cas d'échec de validation bloquant ou de conflit constitutionnel.

## Surfaces impactées
Backend API ; Back-office Plateforme/Admin ; Back-office Courtier (types d'offres, résumé IA) ; packages partagés ; base de données (Prisma, migration) ; scripts de seed de référence. Pas de changement du site public.

## Modèle de données (additif)
- `ProductCategory` : `nameEn`, `description`, `sortOrder`.
- `Product` : `legalNotice` (JSON `{fr?, en?}` de `{legalText?, disclaimer?}`), `requiredDocumentKinds` (liste, vocabulaire `quoteDocumentKinds`), `version`.
- `ProductVersion` : une ligne par changement de conditions (snapshot, diff, auteur, motif).
- `Insurer` (+ enum `InsurerStatus`) : référentiel par pays, unique `(countryId, code)`.
- `Offer.insurerId`, `OfferVersion.insurerId` : lien optionnel ; `insurerName` conservé.
- `ActivationAttestation` : attestation manuelle d'un contrôle (portée pays ou produit, auteur, date, note, révocation).
- Reprise de données dans la migration : un assureur par `(pays, insurerName)` distinct existant, lien posé sur les offres, version 1 de chaque produit. Aucune ligne existante n'est supprimée ni réécrite.

## Décisions
1. **Catégories** : 14 clés kebab (`auto-moto`, `sante`, `voyage`, `habitation`, `vie-epargne`, `entreprise`, `transport`, `agricole`, `scolaire`, `microassurance`, `credit-caution`, `cyber`, `evenementiel`, `construction`) créées `active`, jamais réécrites au rejeu ; les anciennes catégories à 5 clés de la recette existante restent en base (non supprimées).
2. **Documents requis** : même vocabulaire que les justificatifs visiteur (`quoteDocumentKinds`) pour que l'étape documents du lot 1 les consomme sans traduction ; exposés par `GET /countries/:code/products/:key/requirements` (produit public uniquement).
3. **Versions de produit** : seul le contenu crée une version ; statut et flags restent dans l'historique des flags et l'audit.
4. **Offre privée** : suit le même cycle de versions que les autres offres (hypothèse prudente, réversible) mais la politique de publication la refuse (`offer_private`) ; créée par le courtier (`indicative` ou `private`) ou l'administrateur (avec un partenaire).
5. **Offre assureur** : création réservée à l'administrateur, validation par la conformité (règle existante de spec 052).
6. **Résumé IA** : nouveau type d'assistance admin `offer_summary` derrière `ai_summary_enabled` + pays ; seuls les résumés validés par un humain sont lus ; le courtier ne peut pas déclencher la génération.
7. **Attestations** : posées par `compliance_admin`/`super_admin` avec MFA ; chaque contrôle attestable est dans une liste blanche partagée ; la note du plan de désactivation exige une référence. Le contrôle « conformité a validé l'ouverture » n'est pas dupliqué : l'ouverture est déjà un acte réservé à la conformité (spec 050 R4).
8. **Rétro-compatibilité de la checklist** : les dépendances nouvelles (attestations, règles de routage, règles de scoring) sont optionnelles ; absentes, les contrôles correspondants sont omis (tests construits à la main). Le runtime les fournit toujours.

## Impacts connus hors périmètre
Les parcours d'ouverture publique des tests E2E et des seeds de démo (`scripts/local-app`, `backend/prisma/seed.ts`, `tests/e2e/senegal-opening.spec.ts`) doivent désormais fournir les règles de routage et de scoring, les disclaimers FR et EN, les documents requis éventuels et les attestations pour ouvrir un pays ou un produit.

## Validation
`npm run typecheck`, `npm run lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `prisma validate`, `node scripts/ci/secret-scan.mjs`.
