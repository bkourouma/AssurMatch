# Tâches : IA visiteur, écarts PRD §10.1 / COMP-010 (spec 068)

**Spec** : `spec.md` — **Plan** : `plan.md`

## Phase 1 — Backend (propriétaire : agent backend)

- [ ] T001 Contrat : `visitor_guarantee_explainer` et `visitor_compare_explainer` dans `ai.contracts.ts` (types + schémas de requête).
- [ ] T002 Passerelle : flag `ai_summary_enabled`, prompts, garde-fous de non-recommandation pour `visitor_*`.
- [ ] T003 `TemplateAiProvider` : rendus FR/EN des deux types (et `visitor_form_help`).
- [ ] T004 `VisitorAiService` : port des offres publiées, résolution serveur et validation pays/produit ; branchement `// Lot 2 (spec 068)` dans `assurmatch-runtime.ts`.
- [ ] T005 Tests unitaires et d'intégration HTTP (flux complet, flag fermé sans appel fournisseur, garde-fous, minimisation, quotas, offres hors périmètre, `visitor_form_help`).

## Phase 2 — Web publique : garanties et comparaison (propriétaire : agent front A)

- [ ] T006 `VisitorAiAssistant` : modes `guarantees` et `compare`, `language` envoyé, mention « Contenu généré par IA… ».
- [ ] T007 Montage sur le détail d'offre et la comparaison (une ligne chacun, contexte pays/produit retrouvé si absent).
- [ ] T008 Messages FR/EN (`VisitorAi.modes.*`, `VisitorAi.fieldHelp.*`) et spécification Playwright « sources ».

## Phase 3 — Web publique : aide par champ (propriétaire : agent front B)

- [ ] T009 `visitor-field-help.tsx` (contexte, cache par champ, slot « ? »), slot dans `Field`.
- [ ] T010 Montage minimal dans `quote-form.tsx` (fournisseur autour de la grille).
- [ ] T011 Spécification Playwright « sources » de l'aide par champ.

## Phase 4 — Validation (chef de lot)

- [ ] T012 `npm run typecheck`, `npm run lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `node scripts/ci/secret-scan.mjs`.
