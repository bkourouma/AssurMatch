# Implementation Plan: Admin/Auth Operations UI Batch

**Input**: Approved 015-018 follow-up request
**Branch**: `014-auth-users-persistence`

## Technical Context

- TypeScript strict monorepo with Next.js app router for `apps/admin` and `apps/broker`.
- NestJS runtime HTTP APIs already expose `/auth/*`, `/admin/users/*`, and broker endpoints.
- Prisma/PostgreSQL runtime persistence from 014 remains the source of truth.
- Node engine requirement: `>=24.15.0`.

## Architecture

- Keep public visitor app isolated; do not add public imports/routes for back-office UX.
- Add thin server-side API clients in admin/broker apps.
- Add server actions for form submissions; redirect back to pages with sanitized notice/error state.
- Keep role/scope decisions and audit logging in backend user/auth controllers.
- Add operator scripts/docs for Windows local/preprod launch paths.

## Tests & Validation

- Source-level Playwright tests assert UI files contain required flows and no public app imports.
- Backend 014 auth/user integration tests remain authoritative for RBAC, audit and persistence.
- Final validation should include typecheck, lint, Vitest, Playwright, build, Prisma validate, audit, diff check, and secret scan.

## Risks

- MFA enrollment cannot verify a real TOTP in UI without the authenticator device; UI exposes the enrollment secret and backup codes returned by backend.
- Mailpit is documented for verification; SMTP delivery remains dependent on runtime SMTP configuration.
- Broker team management uses existing tenant-scoped `/admin/users` list rather than adding new write endpoints.
