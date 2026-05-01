# Tasks: Secure Partner License Offer Import

**Input**: Design documents from `/specs/022-secure-partner-license-offer-import/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Continuous Workflow**: Eligible. Stop on constitutional conflict, security/data leakage risk, real operational data, forbidden activation or blocking validation failure.

## Phase 1: Setup

- [X] T001 Create Spec Kit artifacts in specs/022-secure-partner-license-offer-import/
- [X] T002 Add import script paths to package.json
- [X] T003 Add fake sample data file in docs/samples/partner-offer-import.fake.json

---

## Phase 2: Foundational Guardrails

- [X] T004 Implement SHA256 verification in scripts/import-partners-core.ts
- [X] T005 Implement Zod validation and fake-data-only checks in scripts/import-partners-core.ts
- [X] T006 Implement no-secret scanning in scripts/import-partners-core.ts

---

## Phase 3: User Story 1 - Validate Import Input (Priority: P1)

- [X] T007 [US1] Add validation and checksum tests in backend/tests/unit/import-partners/import-partners-core.spec.ts
- [X] T008 [US1] Ensure dry-run writes nothing and reports skipped records

---

## Phase 4: User Story 2 - Apply Idempotent Operational Data (Priority: P1)

- [X] T009 [US2] Implement import store abstraction and memory store in scripts/import-partners-core.ts
- [X] T010 [US2] Implement Prisma apply store and CLI in scripts/import-partners.ts
- [X] T011 [US2] Support partners, partner users, licenses, coverage, offers and partner quotas
- [X] T012 [US2] Add apply/idempotency tests with fake data

---

## Phase 5: User Story 3 - Audit And Report Results (Priority: P1)

- [X] T013 [US3] Write apply-mode audit attempt/result entries
- [X] T014 [US3] Return created/updated/skipped/errors report
- [X] T015 [US3] Add audit-created tests

---

## Phase 6: Documentation And Validation

- [X] T016 Add docs/runbooks/import-partners-licenses-offers.md
- [X] T017 Run import tests with fake data only
- [X] T018 Run required final validation suite and record results
- [X] T019 Verify no real operational data is committed

## Dependencies & Execution Order

Foundational guardrails block apply-mode work. CLI documentation follows the final command shape.
