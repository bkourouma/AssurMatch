# Tasks: Visitor Document Upload

**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client, Back-office Plateforme.

- [x] T001 [US1] Contracts `quote-document.contracts.ts`, notification type `broker_document_received`, index export.
- [x] T002 [US1] Prisma model + enums, migration `0010_quote_documents`, migrations test.
- [x] T003 [US2] Storage port (memory/disk/S3 SigV4) and scanner port (EICAR/ClamAV) with config resolution and unit tests.
- [x] T004 [US1,US2] Repository (memory/Prisma) and `QuoteDocumentsService` (upload rules, listing, scan processing, sharing, notifications, audit).
- [x] T005 [US1,US3] HTTP: public multipart upload/list, admin metadata; runtime wiring; `authenticateVisitor`; manual-assignment and reassignment sharing hooks; integration tests. Error filter now maps rate limits to 429.
- [x] T006 [US1] Public app: confirmation page upload/list, token propagation from the quote form; source test.
- [x] T007 [US3] Admin app: quote request detail documents; admin-api; source test.
- [x] T008 Validate (typecheck, lint, tests); tick tasks.

## Notes

- Pre-existing gap fixed on the way: CRM documents were persisted without the mandatory `partnerTenantId` column.
- Broker-side download of prospect documents (bytes) is not exposed yet; the CRM lists the document with an opaque storage key. A signed-download endpoint belongs to the broker CRM documents follow-up.
