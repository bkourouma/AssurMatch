# Implementation Plan: Secure Partner License Offer Import

**Branch**: `022-secure-partner-license-offer-import` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-secure-partner-license-offer-import/spec.md`

**Continuous Workflow Eligibility**: Eligible. The user explicitly approved continuous Spec Kit workflow and local commit after validations. No `[NEEDS CLARIFICATION]` markers remain.

## Summary

Add a secure JSON-first operational import CLI for fake partner setup data. The tool verifies SHA256, validates with Zod, defaults to dry-run, requires explicit `--apply` for writes, rejects secret-like or real-looking input, idempotently upserts partners/users/licenses/coverage/offers/quotas where modeled, writes apply-mode audit logs and produces a created/updated/skipped/errors report.

## Technical Context

**Language/Version**: TypeScript strict on Node >=24.15.0, Prisma 7 with `@prisma/adapter-pg`, Zod 4, Vitest 4.
**Primary Dependencies**: Existing `zod`, Prisma Client, `tsx`, Node crypto/fs/path. No new dependency is required.
**Storage**: PostgreSQL via Prisma for apply mode; in-memory test store for focused unit tests.
**Testing**: Unit tests for validation, checksum, dry-run, fake-data guardrails, apply mode, audit creation and idempotency; final full suite.
**Target Platform**: Local/controlled operator shell, Windows PowerShell compatible.
**Impacted Application(s)**: Backend API data/tooling and docs. Web Publique Client and Back-office UI are not modified.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Small controlled import batches complete synchronously with clear report; no public endpoint workload.
**Constraints**: No real operational data, no secrets, no default writes, no regulated activation, no public route changes.
**Scale/Scope**: Fake sample data import only; JSON primary; CSV deferred.

## Constitution Check

- **Technical platform role**: Pass. Operational data setup only; no sale/subscription/issuance/payment/claims/insurer API/AI recommendation.
- **Regulatory and consent**: Pass/N/A. No lead transmission or consent creation.
- **Feature flags and activation**: Pass. No flags are enabled.
- **Frontend application separation**: Pass. No frontend code changes.
- **Security and RBAC**: Pass. CLI requires checksum, fake-data marker, dry-run default and explicit apply; runbook warns operator scope.
- **Data and auditability**: Pass. Apply mode writes audit attempts/results; imported licenses/offers preserve validity/status fields.
- **Routing integrity**: Pass. Coverage and quotas are imported where modeled; no routing rule activation is added.
- **AI control**: N/A.
- **UX and content safety**: Pass. Offers remain indicative and include disclaimers.
- **Testing discipline**: Pass. Focused tests cover validation, dry-run, apply, no secrets, audit and idempotency.
- **Async and reliability**: N/A. No async workload added.
- **Continuous workflow safety**: Pass.

## Project Structure

### Documentation (this feature)

```text
specs/022-secure-partner-license-offer-import/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/import-partners.md
  tasks.md
docs/runbooks/import-partners-licenses-offers.md
docs/samples/partner-offer-import.fake.json
```

### Source Code (repository root)

```text
scripts/
  import-partners-core.ts
  import-partners.ts
backend/tests/unit/import-partners/
  import-partners-core.spec.ts
package.json
```

**Structure Decision**: Keep reusable validation/report/store logic in `scripts/import-partners-core.ts` for fast unit tests, and keep Prisma CLI wiring in `scripts/import-partners.ts`.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Post-Design Constitution Check

- **Security/data leakage**: Pass. Fake-data-only validation and no-secret scan are required.
- **Regulated activation**: Pass. Imported entities keep status/validation gates; flags are not touched.
- **Audit**: Pass. Apply writes attempt/result audit logs.
- **Testing**: Pass. Unit tests plus final validation suite cover the risk surface.
