# Feature Specification: Admin Activation Checklist Surface

**Feature Branch**: `026-admin-activation-checklist`
**Created**: 2026-05-03
**Status**: Implemented

## Constitutional Scope

- **Impacted surfaces**: Back-office Plateforme/Admin, Backend API, shared packages. Web Publique Client, Broker Back-office, database/Prisma migrations and payments are not impacted.
- **Role**: Read-only operational readiness surface for platform admins before country/product/partner public exposure.
- **Forbidden behavior**: No flag mutation, country/product activation, partner activation, license validation, offer publication, routing, payment, policy issuance, e-signature, claims, insurer API, webhook or AI action.
- **Security**: Auth + MFA required. Allowed roles are Super Admin, Admin Pays, Compliance Admin and Support Admin. Broker roles are refused and audited.
- **Audit**: Successful reads emit `activation_checklist.read`; refusals emit `activation_checklist.refused`.

## User Story

An authorized admin opens `/activation-checklist` and sees blocking and warning readiness controls covering global public flags, country flags/status, product flags/status, published quote form, published consent, partner active/capacity/authorizations/license and validated active offers.

## Requirements

- Expose `GET /admin/activation-checklist` with optional `country`, `product`, `partnerId` filters.
- Return a read-only DTO with `summary` and `sections`.
- Use existing persisted/runtime services only; no schema migration.
- Fail closed for missing MFA, forbidden role and out-of-scope country/product filters.
- Keep sponsored offers as a warning control unless explicitly enabled elsewhere.
- Add admin UI navigation and a page that renders the checklist without mutation buttons.

## Validation

- Backend integration coverage: runtime HTTP happy path and broker refusal.
- Admin Playwright source coverage: API client, page, nav, read-only wording and forbidden public wording checks.
