# Plan d'implémentation : CMS Content Admin (spec 072)

**Spec** : `spec.md`. **Migration réservée** : `0038_content_cms`. Les ajouts aux fichiers partagés (`schema.prisma`, `runtime-http-wiring.module.ts`, `assurmatch-runtime.ts`, `assurmatch-role-matrix.ts`, `admin-shell.tsx`, `admin-api.ts`) sont encadrés par des blocs `// Lot 9` (ou commentaire équivalent).

## Architecture
- **Contrat** (`packages/shared/contracts/content-cms.contracts.ts`, écrit par le chef de lot) : types, schémas zod par type de contenu, schéma « texte brut », vues admin et publique. Source unique pour les trois surfaces.
- **Backend** `backend/src/modules/content-cms/` : `content-cms.repository.ts` (interface + Memory + Prisma, `publishExclusively` transactionnel), `content-cms.service.ts` (cycle, quatre yeux, contrôle éditorial, audit, projection publique), `content-cms.module.ts`, `content-audit-actions.ts` (dans `audit-logs/`). Routes dans `http-wiring/content-cms-http.controllers.ts` (admin protégé AuthRequired + MfaRequired, public sans garde), enregistrées par un bloc `// Lot 9` dans `runtime-http-wiring.module.ts`.
- **DB** : `model ContentEntry` + migration SQL `0038_content_cms` (additive, `CREATE TABLE IF NOT EXISTS`, index uniques partiels pour « une seule version publiée » et « une seule version ouverte »).
- **RBAC** : `content:*` existe pour `content_admin`. Ajouter `content:read` et `content:approve` à `compliance_admin`. Les vérifications sont faites par permission (`roleHasPermission`) dans le service, plus la règle quatre yeux et la règle légale.
- **Admin** `apps/admin/app/content/` : `page.tsx` (liste + filtres), `[id]/page.tsx` (détail, historique, actions), `new/page.tsx`, `actions.ts` (server actions), formulaires texte ; entrée de menu « Contenu » ; client API dans `app/lib/admin-api.ts` (bloc Lot 9).
- **Public** `apps/public/app/lib/content-cms.ts` (fetch borné 2 s, `next: { revalidate: 60 }`, jamais d'exception) et `apps/public/app/content/cms-merge.ts` (fonctions pures de fusion, testées) ; pages FAQ, glossaire, guides (liste + détail), 4 pages légales globales + 4 pages pays utilisent le contenu fusionné ; rendu texte uniquement.

## Décisions
- Une seule table versionnée plutôt que quatre : la mécanique de cycle, d'audit et de lecture publique est identique.
- Quatre yeux par identité d'acteur (pas par rôle) : la prudence prime, un déploiement à un seul administrateur ne peut pas publier seul (voir questions au superviseur).
- Le repli statique est le défaut et reste intact : aucun import du statique dans la base.
- Lecture publique unique et agrégée (`/public-content`) pour limiter les appels et simplifier le cache.

## Validation
`npm run typecheck`, `npm run lint`, `NODE_ENV=test npx vitest run backend/tests/unit/content-cms backend/tests/integration/content-cms`, puis suite complète, `npx playwright test` sur les spécifications « sources » ajoutées.
