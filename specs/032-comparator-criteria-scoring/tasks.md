# Tasks: Comparator Criteria, Score And Comparison

**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme.

- [x] T001 [US1] Extend offer contracts (query, summary, detail, admin upsert, compare response) and add `scoring-rule.contracts.ts`.
- [x] T002 [US1] Prisma: offer criteria columns, `ScoringRule` model, migration `0009_offer_comparison`; repositories mapping; migrations test.
- [x] T003 [US1] Pure scoring engine `offer-scoring.ts` with unit tests.
- [x] T004 [US1,US2] Catalog service: new filters, sorts, popularity/partner resolvers, score attachment, `compare()`; unit tests.
- [x] T005 [US3] `ScoringRulesService` + repository (memory/Prisma), audit, RBAC/scope; unit tests.
- [x] T006 [US1,US2,US3] HTTP wiring: public compare (both wiring paths), admin scoring rules, admin offers CRUD/validate/suspend (OFFER-001/007 were not exposed over HTTP before); runtime `publicOfferContext`; integration tests.
- [x] T007 [US1,US2] Public app: data-driven offers page, `/compare` page, detail page, quote preselection (`selectedOfferId`), async `params` on public pages; public source tests.
- [x] T008 [US3] Admin app: `/scoring` page (rules + offer validation/suspension), actions, forms, nav, admin-api, source test; offer admin service maps criteria fields.
- [x] T009 Run typecheck, lint, full tests; tick tasks.

## Deferred follow-ups

- COMP-010 (AI explanation of differences) belongs to the AI specs.
- Popularity is counted over quote requests per list call; move to an indexed counter when volumes grow.
- Admin offer creation UI with criteria fields (today: API + validation/suspension UI).
