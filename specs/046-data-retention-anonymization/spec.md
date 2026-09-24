# Feature Specification: Data Retention and Anonymization

**Feature Branch**: `046-data-retention-anonymization`
**Created**: 2026-09-24
**Status**: Implemented and validated 2026-09-24
**Validation State**: Validated. The four product decisions (default durations, execution mode, erasure on request, broker CRM coverage) were taken by the product owner on 2026-09-24 and are recorded as D1 to D4. No `[NEEDS CLARIFICATION]`.
**Continuous Workflow Eligible**: Yes.

## Why this spec exists

AssurMatch stores the personal data of visitors in twelve tables: prospects, quote requests and their
answers, uploaded documents, broker CRM notes and proposals built on a lead, AI traces, contact
messages, partner applications, the waiting list, webhook payloads and notification references.

Several of those rows already carry a `retentionUntil` date (10 years for a quote request, 5 for a
document, 3 for the waiting list). **Nothing ever reads it.** There is no purge, no anonymization, no
screen where a compliance officer can see what is due, and no way to act on a visitor who asks for
their data to be erased. The PRD coverage map lists "retention/anonymization operations" as missing,
priority P0.

Constitution principle VI frames the constraint: the V1 simplicity must not erase the traces needed
for audit and disputes, and a deletion or anonymization of personal data must keep the minimal proof
that compliance requires. Principle IV requires every sensitive action to be scoped, permissioned and
audited. This spec gives the platform a controlled, audited, reversible-until-approved way to stop
keeping personal data longer than needed.

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: Unchanged. Retention is an internal data-protection operation. It creates no public promise and no visitor-facing content.
- **Impacted application(s)**: Backend API (new `data-retention` module; small additions to countries, quote documents storage, feature flags, RBAC), database (migration `0018`), shared packages (contracts, RBAC matrix), Back-office Plateforme (new `/compliance/retention` page). The Broker Back-office receives an in-app notice through the existing inbox with **no code change**. The Web Publique Client is **not touched**.
- **Affected scopes**: Global defaults, with per-country overrides. An `admin_pays` does not get the retention permission; only `compliance_admin` and `super_admin` do.
- **Frontend separation**: Unchanged. Every route is under the protected `admin` controller prefix; nothing is exposed to the public app or to the broker API.
- **Required feature flags**: `retention_purge_enabled` (global, default `false`, sensitive and explicitly protected: it can only be turned on through the compliance policy path with a reference and an approver). Policies can be read and edited and previews computed with the flag off; **executing** a batch requires it on.
- **Consent and transmission**: `ConsentRecord` rows are **never** anonymized or deleted (proof of consent). Anonymizing a quote request does not re-route, re-notify or re-transmit anything.
- **Partner license controls**: Not touched.
- **Audit and data history**: `AuditLog` rows are **never** anonymized by this feature (they are already PII-masked and carry their own 10-year `retentionUntil`). Every policy change, preview, approval, execution, per-category outcome and refusal is audited. The batch row itself is the durable proof: who, when, why, which category, how many rows, which ids.
- **Security and RBAC**: New permissions `retention:read` and `retention:*`, granted to `compliance_admin` (and `super_admin` through `*:*`). MFA is required for every retention call, read included. Refusals are audited before being thrown.
- **Routing impact**: None. An anonymized quote request keeps its status, routing decision and assignments; only personal content is removed.
- **AI impact**: AI traces (`AIInteraction` outputs, `QuoteAISummary` references) are in scope as a data category. No model is called.
- **UX/content restrictions**: Admin copy only, unaccented French like the rest of the back-office. The broker notice states that the personal data of a request was anonymized under the platform retention policy; it never names the visitor.
- **Data minimisation**: The erasure lookup by email computes the existing fingerprint in memory and **never stores the email or the fingerprint** on the batch; the batch stores target row ids only.
- **Workflow continuity**: Not interrupted.

## Decisions

### D1 - Default retention durations (product owner, 2026-09-24)

Defaults live in code (`DEFAULT_RETENTION_POLICIES`) and can be overridden globally or per country from
the admin. Bounds: 30 to 3650 days.

| Category | Rows | Default | Anchor |
|---|---|---|---|
| `quote_requests` | QuoteRequest answers, Prospect identity, lead comments, broker CRM content (D4), AI summaries of the request | 730 days | last activity: the latest of the quote `updatedAt` and any assignment `lastBrokerActionAt` |
| `quote_documents` | Uploaded files and their names | 180 days | document `createdAt` |
| `contact_messages` | ContactMessage | 365 days | `createdAt` |
| `partner_applications` | PartnerApplication **with a rejected review status only** (the status enum has no withdrawn value) | 365 days | `reviewedAt` (else `updatedAt`) |
| `waitlist` | WaitlistEntry | 365 days | the country `publicSince` (new column) once the country opened; an entry of a country that never opened stays until its existing `retentionUntil` (3 years) |
| `ai_traces` | AIInteraction outputs and minimization reports | 365 days | `occurredAt` |
| `webhook_payloads` | PartnerWebhookDelivery payload, final statuses only | 90 days | `createdAt` |
| `messaging_references` | Notification `payloadReference`, MessagingDelivery `recipientMasked`, final statuses only | 90 days | `createdAt` |

Never in scope: `ConsentRecord`, `AuditLog`, `FeatureFlagHistory`, `OfferHistory`, `RoutingRuleHistory`,
`RoutingDecision`, billing rows, user accounts of partners and admins.

### D2 - Execution is manual and two-step (product owner, 2026-09-24)

1. **Preview**: a compliance admin asks for a preview (all categories or a subset, globally or for one
   country). The backend computes the eligible rows with the effective policies, freezes their ids on a
   new `AnonymizationBatch` (`status = previewed`, expires after 24 hours, capped at 500 subjects per
   category) and returns the counts per category. A preview changes no personal data and works with the
   flag off.
2. **Approve**: the same or another compliance admin approves the batch with a reason. With
   `retention_purge_enabled` on, the backend re-checks each frozen row (still eligible, not already
   anonymized), anonymizes it, and marks the batch `executed` with the final counts. With the flag off
   the approval is refused (HTTP 422) and audited.

There is no scheduled job and no automatic purge. A second approver is **not** required (small team); the
approver is recorded and may be the requester.

### D3 - Erasure on request, admin side (product owner, 2026-09-24)

A compliance admin who receives an erasure request (by email, phone or letter; no public form in this
spec) previews an erasure batch by **public reference** or by **email**, with a mandatory reason. The
backend resolves every row of that person: the prospect(s) with that email fingerprint, their quote
requests, documents, lead comments and CRM content, contact messages, waiting-list entries and partner
applications with that email. Retention durations do not apply. Approval works exactly like D2.

### D4 - Broker CRM content is anonymized with the lead (product owner, 2026-09-24)

Anonymizing a quote request extends to what brokers wrote on its lead assignments: CRM notes, task
titles, reminder messages, proposal notes, dispute comments, lead action comments, CRM pipeline
history reasons, CRM lead state tags (emptied), and CRM document labels and storage keys (security
review, 2026-09-24). Coded fields such as `QuoteRequest.refusalReason` / `manualReviewReason` and the
`AIInteraction.scope` stay as they are. Rows keep their ids, dates, statuses and amounts so pipeline history and
billing stay consistent. Each partner tenant concerned receives **one** in-app notice per batch
(`lead_data_anonymized`) with the count and the public references, through the existing
`MessagingDispatchService.publishInApp`.

### D5 - What "anonymized" means, per row

- Free text and identity fields are replaced by a fixed marker (`[anonymise]`) or `null` when nullable.
- Email and phone fingerprints are cleared: an unsalted fingerprint of a known email is re-identifiable.
- JSON answers (`QuoteRequest.payload`) become `{ "anonymized": true }`; webhook payloads become `{ "anonymized": true }`.
- Stored files are deleted through a new `DocumentStoragePort.delete(storageKey)`; the document row keeps its id, checksum and dates, with `fileName = "document-anonymise"`.
- Rows that model a person (`Prospect`, `QuoteRequest`, `ContactMessage`, `PartnerApplication`, `WaitlistEntry`, `QuoteRequestDocument`) gain `anonymizedAt`. A row with `anonymizedAt` is never selected again: the operation is idempotent.
- Kept as minimal proof: ids, public references (random, non-identifying), country and product, statuses, timestamps, the consent record link, and the batch that did it (`anonymizationBatchId`).

## Requirements

- **FR-001** Effective policy resolution: country override, then global override, then code default, per category.
- **FR-002** `GET /admin/retention/policies?countryId=` returns the effective policy per category with its source (`default`, `global`, `country`).
- **FR-003** `PUT /admin/retention/policies` upserts an override `{ countryId?, category, retentionDays, reason }`, bounded 30..3650, audited with previous and next values. `DELETE` of an override is expressed as `retentionDays: null` and reverts to the next level.
- **FR-004** `POST /admin/retention/batches/preview` `{ countryId?, categories?, reason }` creates a `previewed` retention batch (D2).
- **FR-005** `POST /admin/retention/batches/erasure-preview` `{ publicReference? , email?, reason }` (exactly one of the two) creates a `previewed` erasure batch (D3). An unknown subject yields an empty batch, not an error that reveals existence.
- **FR-006** `POST /admin/retention/batches/:id/approve` `{ reason }` executes a previewed, unexpired batch when the flag is on (D2); refuses with 422 when off, 409 when the batch is expired or not `previewed`.
- **FR-007** `GET /admin/retention/batches` (latest 50) and `GET /admin/retention/batches/:id` return batch metadata and counts, never personal data.
- **FR-008** Anonymizers per category implement D5 and D4, are idempotent, and never touch the never-in-scope tables.
- **FR-009** `CountriesService.update` stamps `publicSince` on the first transition to `public`; the migration backfills it from `updatedAt` for countries already public.
- **FR-010** `DocumentStoragePort.delete` on the memory, disk and S3-compatible adapters; a missing object is not an error.
- **FR-011** Every call requires MFA and `retention:read` (reads) or `retention:*` (writes); refusals are audited.
- **FR-012** Admin page `/compliance/retention`: effective policies with an override form, retention preview form, erasure preview form, batches table with counts and an approve form, and a visible notice when `retention_purge_enabled` is off. Linked from the compliance page and the navigation match.

## User Scenarios & Testing

1. **Preview with the flag off** - Given quote requests older than the policy, when a compliance admin previews, then a batch lists the counts per category, no row is modified, and the approve action explains that the flag is off.
2. **Approve with the flag on** - Given a previewed batch, when approved, then the quote answers, prospect identity, documents (file deleted), broker CRM content and AI outputs are anonymized; consent records and audit logs are untouched; each partner tenant gets one notice; the batch is `executed` with counts.
3. **Idempotence** - Approving the same batch twice is refused (409); previewing again does not select already anonymized rows.
4. **Row changed after preview** - A quote request that received broker activity after the preview is no longer eligible and is skipped at approval, counted as `skipped`.
5. **Erasure by email** - Given a prospect with two quote requests, a contact message and a waiting-list entry under the same email, an erasure preview by email finds all four subjects; approval anonymizes them; the batch stores no email and no fingerprint.
6. **Country override** - A 365-day override for one country makes its 400-day-old requests eligible while the same age elsewhere is not.
7. **RBAC** - `admin_pays`, `support_admin`, a broker and an actor without MFA are refused and audited.
8. **Never in scope** - After any execution, `ConsentRecord` and `AuditLog` rows are byte-identical.

## Validation

`npm run validate`, `npx playwright test`, `npm run test:runtime:postgres:docker` (the Prisma repository
exercised against PostgreSQL), plus the migration applied on the local stack.

## Explicit non-goals

- No public erasure form and no visitor self-service (a later spec).
- No scheduled or automatic purge.
- No hard delete of rows (anonymization only; files are the one thing deleted).
- No change to `AuditLog` retention or to consent records.
- No legal opinion: the D1 durations are the product owner's prudent defaults and remain configurable per country once validated by counsel.
