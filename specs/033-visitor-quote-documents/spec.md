# Feature Specification: Visitor Document Upload On Quote Requests

**Feature Branch**: `033-visitor-quote-documents`
**Created**: 2026-09-05
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes

## Constitutional Scope & Compliance

- **Technical platform role**: Documents are optional supporting files for an indicative quote request; the platform stores and forwards them to the responsible partner broker, it never evaluates them.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client (confirmation page upload), Back-office Plateforme (admin metadata view), Broker Back-office data (documents surface in the CRM lead detail as `prospect_provided`). Multiple scopes; journeys stay separated.
- **Affected scopes**: Countries, products (`product_document_upload_enabled`), partners (assigned broker only), roles with `quote_requests:read`.
- **Frontend separation**: Public upload uses the visitor's quote reference plus the verification token issued at submission; no back-office session.
- **Required feature flags**: `quote_request_enabled` (global), `country_quote_enabled`, `product_quote_enabled` and `product_document_upload_enabled` (default `false`, fail closed).
- **Consent and transmission**: Upload is only accepted on a quote request that already holds a valid `ConsentRecord`; the document is shared only with the partner that the routing engine assigned. Nothing is shared when the quote is unrouted, parked or non-routable.
- **Partner license controls**: Unchanged; sharing follows the existing assignment, which already required eligibility.
- **Audit and data history**: Every upload, refusal, scan verdict, share and admin read writes an AuditLog. Documents carry `createdAt/updatedAt/retentionUntil` (5 years) and a SHA-256 checksum.
- **Security and RBAC**: Public endpoint is token-bound, rate-limited (20 uploads per IP per hour), size-limited (5 MiB), MIME allow-listed (PDF, JPEG, PNG), capped at 5 documents per request. Files are scanned asynchronously; only `clean` documents are shared or downloadable. Infected files are quarantined and never forwarded. Admin metadata view needs `quote_requests:read` + MFA; file bytes are never returned by admin or public APIs. Storage keys are opaque UUIDs; file names are stored but never used as storage paths.
- **Routing impact**: None on eligibility. A document received after assignment notifies the assigned broker (`broker_document_received`).
- **AI impact**: None. Document extraction (PRD §10.2, Enterprise) belongs to the AI specs.
- **UX/content restrictions**: Copy says "documents optionnels", "transmis au courtier partenaire responsable". No promise that documents accelerate or guarantee a contract.
- **Workflow continuity**: Standard feature.

## Requirements

- Prisma `QuoteRequestDocument` (id, quoteRequestId, prospectId?, label, documentKind, fileName, mimeType, sizeBytes, checksum, storageKey, scanStatus `pending|clean|infected|failed`, scanEngine?, scanSignature?, status `uploaded|available|quarantined|removed`, sharedLeadAssignmentId?, retentionUntil, timestamps); migration `0010_quote_documents`.
- Storage port with memory (tests), local disk (`.local/documents`, local runtime) and S3-compatible (SigV4 PUT, no SDK) adapters selected by `ASSURMATCH_DOCUMENT_STORAGE=memory|disk|s3`.
- Virus scanner port with `eicar` signature scanner (default) and `clamav` INSTREAM TCP adapter selected by `ASSURMATCH_ANTIVIRUS=eicar|clamav`.
- `POST /quote-requests/:publicReference/documents?token=` multipart (`file`, `label`, `documentKind`) and `GET /quote-requests/:publicReference/documents?token=` (metadata). Public endpoints stay free of heavy synchronous work: the scan runs from the `document-scans` queue.
- `GET /admin/quote-requests/:id/documents` metadata for admins.
- On `clean` verdict: if the quote has a lead assignment, create a CRM document (`visibility: prospect_provided`) for that assignment and queue `broker_document_received` to the partner scope.
- Public confirmation page: upload form and document list when the token is present; quote form success links to it with the token.
- Admin quote request detail page lists document metadata.

## User Scenarios & Testing

### User Story 1 - Visitor adds a supporting document (P1)
1. **Given** a consented quote request and `product_document_upload_enabled=true`, **When** the visitor uploads a 200 KB PDF with the right token, **Then** 201 with `scanStatus=pending`, the file is stored under an opaque key and an AuditLog `quote_document.uploaded` exists.
2. **Given** the wrong token, **Then** 404 and audit `quote_document.refused`.
3. **Given** `product_document_upload_enabled=false`, **Then** 422 and nothing is stored.
4. **Given** a `.exe` or a 6 MiB file or a 6th document, **Then** 400 and nothing is stored.

### User Story 2 - Scan gate before sharing (P1)
1. **Given** an uploaded clean PDF on a routed quote, **When** the scan completes, **Then** the document is `available`, a `prospect_provided` CRM document exists on the assignment and a `broker_document_received` notification is queued.
2. **Given** an EICAR test file, **Then** the document is `quarantined`, no CRM document and no notification exist, and the visitor list shows the quarantine.
3. **Given** an unrouted quote, **Then** the clean document stays `available` without any sharing.

### User Story 3 - Admin reviews metadata (P2)
1. **Given** a Support Admin with MFA, **When** they read `/admin/quote-requests/:id/documents`, **Then** metadata (no bytes) is returned and audited.
2. **Given** a broker, **Then** 403.

## Validation

- `npm run validate` green; public and admin source tests updated.
