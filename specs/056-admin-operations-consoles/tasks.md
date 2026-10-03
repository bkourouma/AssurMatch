---
description: "Task list for 056 — Consoles d'exploitation admin"
---

# Tasks: 056 — Consoles d'exploitation admin

**Continuous Workflow**: Eligible (spec validée par délégation le 2026-10-03).
**Tests**: obligatoires pour le RBAC et la MFA de chaque route, le périmètre pays, le masquage PII, la persistance de la revue, le refus sans consentement (SC-09), le statut des messages, les filtres et l'export restreint des journaux d'audit, et les marqueurs des écrans admin.

## Phase 1: Setup
- [ ] T001 Contrat `packages/shared/contracts/admin-operations.contracts.ts` (requêtes paginées, décision de revue, statut de message, filtres d'audit, vues).
- [ ] T002 Schéma Prisma + migration `0026_admin_operations` ; liste de `backend/tests/integration/prisma-migrations.spec.ts`.

## Phase 2: Backend
- [ ] T003 `AuditLogRepository.search` (mémoire et Prisma) avec filtres et pagination.
- [ ] T004 `ContactMessagesRepository.findById/updateStatus` et `ContactMessagesService.updateStatus` (audit).
- [ ] T005 `QuoteSubmissionService` : `routeAfterReview`, `applyReviewOutcome`, `notifyVisitorOfReviewOutcome`, `assignManually` élargi ; suppression de la revue en mémoire.
- [ ] T006 [US1] Module `admin-operations` : accès, périmètre, masquage ; console des demandes (liste, fiche).
- [ ] T007 [US2] Service de revue (file, décisions, consentement, `RoutingDecision`, audit).
- [ ] T008 [US3] Console des affectations ; [US6] historique de routage.
- [ ] T009 [US5] Console d'audit (recherche, export CSV restreint).
- [ ] T010 Routes HTTP (`admin-operations-http.controllers.ts`), lectures historiques assainies, câblage runtime.
- [ ] T011 [P] Tests d'intégration `backend/tests/integration/admin-operations/` (RBAC, périmètre, persistance, export, contact).

## Phase 3: Interfaces admin
- [ ] T012 `apps/admin/app/lib/operations-api.ts` + server actions.
- [ ] T013 [US1][US2] Pages `/quote-requests`, `/quote-requests/[quoteRequestId]`, `/operations/quote-review`.
- [ ] T014 [US3][US4] Pages `/lead-assignments`, `/operations/contact-messages`.
- [ ] T015 [US5][US6] Pages `/compliance/audit-logs` (+ route d'export), `/routing/anomalies`, `/routing/history` ; navigation et onglets.
- [ ] T016 Tests de marqueurs `apps/admin/tests/admin-operations-consoles.spec.ts`.

## Phase 4: Validations
- [ ] T017 typecheck, lint, `npx vitest run`, `npx playwright test apps/admin`, `npx next build` (admin), scan de secrets.
