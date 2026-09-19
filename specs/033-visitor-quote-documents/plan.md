# Implementation Plan: Visitor Document Upload

**Branch**: `033-visitor-quote-documents` | **Date**: 2026-09-05 | **Spec**: `specs/033-visitor-quote-documents/spec.md`

**Continuous Workflow Eligibility**: Eligible.

## Summary

Let visitors attach optional supporting documents to their quote request after submission, gate them behind product flags, scan them asynchronously and forward only clean files to the assigned partner broker, with full audit and retention.

## Technical Context

**Impacted Application(s)**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme, Broker Back-office data.
**Storage**: PostgreSQL metadata; file bytes in the storage port (memory/disk/S3). No SDK dependency: S3 PUT is signed with SigV4 using `node:crypto`.
**Async**: `document-scans` queue job per upload; in-process processor invoked after the response (memory queue) and exposed for tests.

## Constitution Check

- **Technical platform role**: Pass.
- **Regulatory and consent**: Pass. Consent already recorded on the quote; sharing bound to the assignment.
- **Feature flags**: Pass. `product_document_upload_enabled` fail closed.
- **Frontend separation**: Pass.
- **Security and RBAC**: Pass. Token binding, rate limit, MIME/size/count limits, scan gate, opaque keys, admin RBAC.
- **Data history**: Pass. Audit on every transition; retention.
- **Tests**: Pass. Unit (scanner, storage, service rules), integration HTTP (upload, gating, limits, scan sharing, admin RBAC), source tests.

## Design

1. `packages/shared/contracts/quote-document.contracts.ts`.
2. `backend/src/modules/quote-documents/`: `document-storage.port.ts`, `virus-scanner.port.ts`, `quote-documents.repository.ts`, `quote-documents.service.ts`, `quote-documents-audit-actions.ts`, `quote-documents.config.ts`.
3. `QuoteSubmissionService.authenticateVisitor(publicReference, token)`.
4. Wiring: `PublicQuoteDocumentsController` (multipart via `FileInterceptor`) and `AdminQuoteDocumentsController`.
5. Public app: `QuoteDocumentUpload` client component on the confirmation page; token propagated from the form success state.
6. Admin app: quote request detail page lists documents.

## Risks

- Disk adapter is for local runtime only; in preproduction/production the upload endpoint refuses files (`storage_not_configured`, audited) until `ASSURMATCH_DOCUMENT_STORAGE=s3` is set. Boot is not blocked because uploads are flag-gated and off by default.
- The EICAR scanner is a minimal default; ClamAV is the production path.
