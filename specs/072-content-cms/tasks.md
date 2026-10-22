# Tâches : CMS Content Admin (spec 072)

**Spec** : `spec.md` — **Plan** : `plan.md`

## Phase 0 — Cadrage (chef de lot)
- [x] T000 Spec, plan, tâches, contrat partagé `content-cms.contracts.ts`.

## Phase 1 — Backend (propriétaire : agent backend)
- [ ] T001 `schema.prisma` bloc `// Lot 9` (`ContentEntry`) + migration `0038_content_cms`.
- [ ] T002 Module `content-cms` (repository Memory + Prisma, service, audit, module) + RBAC (`compliance_admin`).
- [ ] T003 Contrôleurs HTTP admin + public, bloc `// Lot 9` dans `runtime-http-wiring.module.ts` et `assurmatch-runtime.ts`.
- [ ] T004 Tests unitaires (schémas, cycle, quatre yeux, projection publique) et intégration HTTP (gardes d'accès, MFA, public sans brouillon, audit).

## Phase 2 — Back-office admin (propriétaire : agent admin)
- [ ] T005 Client API (`admin-api.ts`, bloc Lot 9), server actions, pages liste/détail/création, menu « Contenu ».
- [ ] T006 Spécification Playwright « sources » (`apps/admin/tests/content-cms.spec.ts`).

## Phase 3 — Web publique (propriétaire : agent public)
- [ ] T007 `lib/content-cms.ts`, `content/cms-merge.ts` + tests unitaires de fusion.
- [ ] T008 Branchement des pages FAQ, glossaire, guides, légales (globales et pays) ; texte brut uniquement.
- [ ] T009 Spécification Playwright « sources » (`apps/public/tests/content-cms.spec.ts`).

## Phase 4 — Validation (chef de lot)
- [ ] T010 typecheck, lint, tests unitaires/intégration, Playwright sources, secret-scan.
