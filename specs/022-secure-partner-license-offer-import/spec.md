# Feature Specification: Secure Partner License Offer Import

**Feature Branch**: `022-secure-partner-license-offer-import`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "Complete secure operational import for partners, licenses, users, and offers with JSON primary format, dry-run default, explicit --apply, SHA256 checksum verification, Zod validation, idempotent upserts, audit logs, import report, fake sample data only, no real operational data committed, runbook and tests."
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes - explicitly approved standard operational tooling feature with no `[NEEDS CLARIFICATION]` markers.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: The import tool manages internal partner setup data. It does not sell insurance, bind coverage, collect premiums, issue policies, e-sign documents, process claims, call insurer APIs or recommend offers.
- **Impacted application(s)**: Backend API data model/runtime tooling, scripts, docs, tests and shared operational process. Web Publique Client is not modified.
- **Affected scopes**: Partners, partner users, partner licenses, country/product coverage, offers, quotas represented on partners and audit logs.
- **Frontend separation**: No frontend route, layout or access policy changes. Public and back-office journeys remain separate.
- **Required feature flags**: No feature flags are enabled. Imported offers stay governed by existing status, validation and feature-flag rules.
- **Consent and transmission**: No lead transmission is performed by the import. Consent requirements for future routing remain unchanged.
- **Partner license controls**: Licenses are imported with status, country/product scope and expiration dates so existing eligibility checks can block invalid or expired licenses.
- **Audit and data history**: Apply mode writes audit entries for import attempts and results; offer updates append history where implemented by the store.
- **Security and RBAC**: The CLI requires explicit `--apply`, checksum verification and fake sample data. No real partner, contact, license or offer data is committed.
- **Routing impact**: Partner quotas and coverage are imported where modeled. Routing rules are skipped unless already modeled; no automatic routing activation is added.
- **AI impact**: N/A. No AI module, prompt, model call or recommendation is introduced.
- **UX/content restrictions**: Imported offers remain indicative data and must include public disclaimers when exposed by existing public surfaces.
- **Workflow continuity**: Eligible with stop conditions for secret leakage, real operational data, checksum bypass, production activation or validation failure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate Import Input (Priority: P1)

As an operations maintainer, I want partner import files validated before any write so malformed, real, secret-bearing or unverified data never reaches runtime storage.

**Why this priority**: A bulk import touches regulated partner and offer data, so fail-closed validation is the primary safety control.

**Independent Test**: Run the importer in dry-run mode against fake JSON, bad checksum, missing fake-data marker and secret-like values.

**Acceptance Scenarios**:

1. **Given** a fake JSON import with matching SHA256 checksum, **When** dry-run runs, **Then** validation succeeds and no writes occur.
2. **Given** a checksum mismatch, **When** import runs, **Then** it is refused before validation or writes.
3. **Given** input lacks the fake-data declaration or contains secret-like values, **When** import runs, **Then** it is refused with report errors.

---

### User Story 2 - Apply Idempotent Operational Data (Priority: P1)

As an authorized operator, I want `--apply` to upsert fake partner, user, license, coverage and offer data idempotently so repeated runs produce stable results.

**Why this priority**: Operations needs safe repeatability before real partner onboarding is ever allowed.

**Independent Test**: Apply the same fake payload twice to a test store and verify first run creates records, second run updates/skips without duplicates.

**Acceptance Scenarios**:

1. **Given** a valid fake import and explicit `--apply`, **When** import runs, **Then** partners, users, licenses, coverage and offers are upserted.
2. **Given** the same import has already been applied, **When** it runs again, **Then** report counts show idempotent updates or skips and no duplicate logical records.
3. **Given** no `--apply` flag is present, **When** import runs, **Then** it remains dry-run and writes nothing.

---

### User Story 3 - Audit And Report Results (Priority: P1)

As a compliance maintainer, I want import attempts and outcomes auditable and summarized so operational changes can be reviewed.

**Why this priority**: Partner/license/offer setup is sensitive and must leave durable evidence.

**Independent Test**: Run apply mode against fake data and assert audit entries plus report counts for created, updated, skipped and errors.

**Acceptance Scenarios**:

1. **Given** apply mode succeeds, **When** import completes, **Then** audit entries record attempt and success with checksum and counts.
2. **Given** validation fails, **When** import exits, **Then** the report lists errors and no write audit is created.
3. **Given** routing rules are present but not modeled, **When** import runs, **Then** they are skipped explicitly in the report.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide `scripts/import-partners.ts` as the operational import entry point.
- **FR-002**: JSON MUST be the primary supported import format.
- **FR-003**: The importer MUST default to dry-run and require explicit `--apply` for writes.
- **FR-004**: The importer MUST require and verify a SHA256 checksum for the input file.
- **FR-005**: The importer MUST validate input with Zod before any write.
- **FR-006**: The importer MUST require fake sample data markers and reject secret-like or real-looking operational values.
- **FR-007**: Apply mode MUST idempotently upsert partners, partner users, partner licenses, country/product coverage, offers and modeled quotas.
- **FR-008**: Routing rules MUST be imported only if already modeled; otherwise they MUST be skipped and reported.
- **FR-009**: Apply mode MUST write audit entries for import attempt and result.
- **FR-010**: Reports MUST include created, updated, skipped and errors.
- **FR-011**: Tests MUST cover validation, dry-run, apply mode with fake data, no secrets, audit creation and idempotency.
- **FR-012**: The runbook MUST document operational import for partners/licenses/offers using fake sample data only.
- **FR-013**: No real partner, license, contact or offer data may be committed.

### Key Entities *(include if feature involves data)*

- **PartnerImportPayload**: Versioned JSON payload with fake-data marker, batch id and arrays of partners, users, licenses, coverage and offers.
- **PartnerImportReport**: Counts created, updated, skipped and errors, plus checksum and dry-run/apply mode.
- **PartnerTenant**: Partner operational tenant with plan, status, quota and capacity.
- **PartnerUser**: User associated to a partner tenant and role.
- **PartnerLicense**: License evidence with status, issuing authority, country/product scope and expiration.
- **CoverageAuthorization**: Country/product authorization for partner eligibility.
- **Offer**: Indicative offer data with validity period and public disclaimers.
- **AuditLog**: Attempt/result evidence for apply-mode imports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of checksum mismatches are refused before writes.
- **SC-002**: 100% of default executions are dry-run unless `--apply` is present.
- **SC-003**: Applying the same fake import twice creates no duplicate logical records.
- **SC-004**: 100% of apply-mode successful imports create audit evidence.
- **SC-005**: 0 real partner, license, contact, offer or secret values are committed.
- **SC-006**: 0 forbidden regulated modules are activated.

## Assumptions

- Country/product catalog entries may be upserted as synthetic internal records only for fake imports.
- CSV remains out of scope until a safe, simple operational need appears.
- The importer is a CLI tool for local/controlled operator use and is not exposed through public frontend routes.
