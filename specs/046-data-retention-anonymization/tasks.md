# Tasks: Data Retention and Anonymization

**Impacted surfaces**: Backend API, database (migration `0018_data_retention`), shared packages, Back-office Plateforme.
**Status**: in progress.

## Wave A - Foundations (backend owner)

- [x] T001 Migration `0018_data_retention` and `schema.prisma`: `RetentionPolicy`, `AnonymizationBatch`, `anonymizedAt` + `anonymizationBatchId` on the six person rows, `Country.publicSince` with backfill; `npx prisma validate`. (deviation: added `AnonymizationBatch.erasureLookup` to record the lookup kind, never its value)
- [x] T002 Contracts `packages/shared/contracts/data-retention.contracts.ts`: categories, policy upsert, retention preview, erasure preview (exactly one of `publicReference`/`email`), approve, batch DTO without personal data.
- [x] T003 RBAC `retention:read` / `retention:*` for `compliance_admin`; flag `retention_purge_enabled: false` in `GLOBAL_FEATURE_FLAG_DEFAULTS` and in `explicitlyProtectedFeatureFlags`; guardrail `regulatory-feature-exclusions` asserts it stays false. (also added to `backend/prisma/seed.ts` and the preprod flag defaults JSON)
- [x] T004 `DocumentStoragePort.delete(storageKey)` on memory, disk and S3-compatible adapters (missing object is not an error); unit tests.
- [x] T005 `CountriesService.update` stamps `publicSince` on the first transition to `public` (FR-009); unit test. (also stamped when a country is created directly as `public`)

## Wave A - Module

- [x] T006 `retention-policies.ts`: categories, D1 defaults, 30..3650 bounds, resolution country > global > default (FR-001); unit tests.
- [x] T007 `DataRetentionRepository` memory + Prisma (policies, batches); registered in `assurmatch-runtime.ts`; guardrails `runtime-memory-boundaries` and `domain-repository-memory` lists updated. (under NODE_ENV=test the runtime now owns the memory repositories of the retention categories so the memory adapter sees the same live records)
- [x] T008 `RetentionSubjectsRepository` memory + Prisma: eligibility queries per category with anchors (D1), subject resolution for erasure (D3), anonymization writes (D5, D4), never touching the never-in-scope tables. (deviations: PartnerApplication has no `withdrawn` status, so only `rejected`; NOT NULL fingerprints that sit in unique keys become `anonymise:<rowId>`; a notification is final when its e-mail status is sent/delivered/failed and WhatsApp is not retryable)
- [x] T009 `RetentionEligibilityService` + `ErasureLookupService` (fingerprint computed in memory, never persisted) (FR-004, FR-005).
- [x] T010 `AnonymizationService`: per-category anonymizers, idempotence via `anonymizedAt`, file deletion, one `lead_data_anonymized` in-app notice per partner tenant per batch, per-category audit (D4, D5, FR-008).
- [x] T011 `DataRetentionService` facade: MFA + permission checks with audited refusals, flag gate on approve (422), batch state machine and 24 h expiry (409), policy upsert with previous/next audit (FR-002..FR-007, FR-011). (a flag-off approval moves the batch to `refused`; a new preview is needed once the flag is on)
- [x] T012 HTTP: `AdminDataRetentionController` under `admin/retention/*` in `runtime-http-wiring.module.ts`, zod parsing, status mapping (403/409/422).

## Wave A - Tests

- [x] T013 Unit tests for scenarios 1-8 of the spec (preview with flag off, approve with flag on, idempotence, row changed after preview, erasure by email storing no email or fingerprint, country override, RBAC refusals, consent and audit rows untouched).
- [x] T014 Integration test over the runtime HTTP harness: full preview -> approve cycle, 403/409/422 mapping.
- [x] T015 Runtime Postgres smoke scenario: previews and executes a small retention batch against PostgreSQL through the Prisma repositories and checks the consent record is untouched.

## Wave B - Back-office Plateforme

- [ ] T016 `admin-api.ts` readers (`readRetentionPolicies`, `readRetentionBatches`) and `apps/admin/app/lib/retention-actions.ts` server actions (policy override, retention preview, erasure preview, approve) with notices.
- [ ] T017 Page `apps/admin/app/compliance/retention/page.tsx`: policies table + override form, preview forms, batches table with counts and approve form, flag-off notice, forbidden/unauthenticated states.
- [ ] T018 Link from `/compliance`; `/compliance/retention` under the "Conformite" navigation match.
- [ ] T019 Playwright source-marker test `apps/admin/tests/data-retention.spec.ts` (endpoints, "use server", no personal data rendered, forbidden wording).

## Closing

- [ ] T020 Security/constitution review of the diff; fixes applied.
- [ ] T021 `docs/prd_coverage_map.md` row updated; `AGENTS.md` plan pointer to this spec.
- [ ] T022 `npm run validate`, `npx playwright test`, `npm run test:runtime:postgres:docker`, `git diff --check`.
