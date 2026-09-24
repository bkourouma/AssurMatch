# Feature Specification: Billing Foundation Without Payments

**Feature Branch**: `027-billing-foundation-no-payments`
**Created**: 2026-05-03
**Status**: Implemented and security-hardened

## Constitutional Scope

- **Impacted surfaces**: Backend API, Back-office Plateforme/Admin, shared packages. No Web Publique Client, Broker Back-office, database migration, payment provider or production deployment impact.
- **Role**: Read-only finance foundation that exposes current-period accepted lead counters and draft, non-billable references for internal finance review. These counters are not billable-lead determinations.
- **Forbidden behavior**: No payment collection, premium collection, invoice issuance, policy sale, public checkout, broker payment action, payment provider integration, `payments_enabled` activation or mutation.
- **Access**: Super Admin and scoped Finance Admin with MFA may read. Broker/support/content roles are refused and audited.
- **Audit**: Reads emit `billing.foundation.read`; refusals emit `billing.foundation.refused`.

## Requirements

- Expose `GET /admin/billing/foundation` with optional `partnerId`, `page`, and `pageSize`.
- Return `paymentsEnabled=false` and `collectionEnabled=false` as literals in the contract.
- Use existing partners and lead assignments; no billing tables or migrations in this slice.
- Mark all generated references as draft non-billable references with `draft_not_billable`; no invoice document, final numbering, email or storage is created.
- Keep `billing_enabled` protected by sensitive feature flag mutation policy and `payments_enabled=false`.
- Render an admin `/billing` page with no mutation controls.

## Validation

- Backend runtime HTTP tests cover finance read, no-payment literals, draft status and broker refusal.
- Admin Playwright source tests cover route/client/read-only/no-payment copy.
