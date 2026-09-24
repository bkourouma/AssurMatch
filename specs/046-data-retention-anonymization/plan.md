# Implementation Plan: Data Retention and Anonymization

**Spec**: `specs/046-data-retention-anonymization/spec.md`
**Impacted surfaces**: Backend API, database / Prisma / migrations (`0018_data_retention`), shared packages (contracts, RBAC matrix), Back-office Plateforme (`apps/admin`). Broker Back-office receives in-app notices through existing code only. Web Publique Client untouched.
**Blocked on**: nothing. Branch stacked on `fix/patch-semantics-scripts-typecheck` (PR 11), itself stacked on PR 10.

## Architecture

New module `backend/src/modules/data-retention/`, following the billing module pattern (plain classes,
`deps` injection, memory repository for tests, Prisma repository selected in `assurmatch-runtime.ts`).

- `retention-policies.ts` - `RETENTION_CATEGORIES`, `DEFAULT_RETENTION_POLICIES` (D1), bounds, resolution (FR-001).
- `data-retention.repository.ts` - `DataRetentionRepository` (policies, batches) with `MemoryDataRetentionRepository` / `PrismaDataRetentionRepository`.
- `retention-subjects.repository.ts` - selection and anonymization of the target rows. Memory and Prisma variants. It is the only file that knows the twelve tables. Prisma has no relations on these models, so cascades (quote request -> assignments -> CRM rows) are explicit queries by id.
- `retention-eligibility.service.ts` - computes eligible ids per category from policies and anchors (D1), capped at 500.
- `erasure-lookup.service.ts` - resolves a subject by public reference or email (fingerprint via `ProspectIdentityService`, in memory only) (D3).
- `anonymization.service.ts` - applies D5/D4 per category, idempotent, deletes files through `DocumentStoragePort.delete`, publishes one broker notice per tenant.
- `data-retention.service.ts` - the facade the HTTP controller calls: RBAC + MFA, flag gate, preview, approve, list, policies, audit.
- `data-retention-audit-actions.ts` - `retention.policy.changed`, `retention.batch.previewed`, `retention.batch.approved`, `retention.batch.executed`, `retention.batch.refused`, `retention.access.refused`, `retention.category.anonymized`.

Contracts in `packages/shared/contracts/data-retention.contracts.ts` (zod). RBAC: `retention:read` and
`retention:*` on `compliance_admin`. Flag `retention_purge_enabled` in global defaults and in the
explicitly protected list.

Schema (migration `0018_data_retention`):
- `RetentionPolicy` (id, countryId nullable, category, retentionDays, reason, updatedById, createdAt, updatedAt; unique countryId+category - with a partial unique index for the null country).
- `AnonymizationBatch` (id, kind `retention|erasure`, status `previewed|executed|refused|expired`, countryId?, categories String[], reason, requestedById, approvedById?, approvalReason?, targets Json (ids per category), counts Json, previewExpiresAt, approvedAt?, executedAt?, createdAt, updatedAt).
- `anonymizedAt DateTime?` and `anonymizationBatchId String?` on Prospect, QuoteRequest, QuoteRequestDocument, ContactMessage, PartnerApplication, WaitlistEntry.
- `publicSince DateTime?` on Country, backfilled from `updatedAt` where `status = 'public'`.

HTTP: a new `AdminDataRetentionController` in `runtime-http-wiring.module.ts`, protected, under `admin/retention/*`.

Admin: `apps/admin/app/compliance/retention/page.tsx` + `apps/admin/app/lib/retention-actions.ts` ("use server"), readers in `admin-api.ts`, a link from `/compliance`, and `/compliance/retention` covered by the existing "Conformite" navigation match.

## Sequencing rationale

1. **Wave A - backend owner** (one agent): schema + migration, contracts, RBAC, flag, storage delete, `publicSince`, module, HTTP wiring, unit + integration tests, guardrail list updates, runtime Postgres smoke scenario. The admin UI depends on the HTTP contract, so it waits.
2. **Wave B - back-office owner** (one agent): admin readers, server actions, page, link, Playwright source-marker test.
3. **Read-only review in parallel with wave B**: security/constitution review of wave A's diff.
4. **Supervisor**: reconcile, run the full validation, update the PRD coverage map, open the PR.

## Risks

- **Conflict with the uncommitted back-office redesign** living in the main checkout (another session). Wave B only adds new files plus two one-line edits (`compliance/page.tsx` link, `admin-shell.tsx` match); those are the expected merge points.
- **Unsalted fingerprints** remain a weakness of the existing identity service; this spec only clears them on anonymized rows. Salting is a separate change.
- **Large backlogs**: the 500-per-category cap means several batches may be needed; the preview reports `more remaining`.
- **S3 delete** cannot be exercised locally; covered by a unit test on the request it builds.
