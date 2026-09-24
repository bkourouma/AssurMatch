# Tasks: Partner API And Webhooks Foundation

**Impacted surfaces**: Backend API, shared packages, runtime config, audit logs, database / Prisma / migrations, Back-office Partenaires / Plateforme admin read surface.

- [x] T001 Create spec with constitutional scope and stop conditions.
- [x] T002 Add contract sketch for future Partner API and webhook envelope.
- [x] T003 Decide first event set and payload minimization rules.
- [x] T004 Design API key hash-at-rest storage and migrations.
- [x] T005 Design webhook endpoint storage, verification and delivery logs.
- [x] T006 Design rate limits, replay protection, idempotency and retry/dead-letter policy.
- [x] T007 Implement only after explicit approval of migration/secrets/deployment risks.
- [x] T008 Validate backend contracts, Prisma migration, HTTP runtime paths, admin surface and local release browser pass.
- [x] T009 Implement approved production delivery policy: tenant allow-list, DNS/IP checks, redirect blocking, worker env gate and redacted delivery persistence.
- [x] T010 Validate delivery worker guardrails, allow-list migration and admin visibility.
