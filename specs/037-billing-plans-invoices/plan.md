# Implementation Plan: Billing Plans, Billable Leads, Draft Invoices And Lead Packs

**Spec**: `specs/037-billing-plans-invoices/spec.md`
**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Back-office Plateforme, Broker Back-office.

1. Contracts: plan price, billable evaluation, draft invoice, pack, broker statement.
2. Prisma models + migration `0012_billing_plans` + migrations test update.
3. Repository (memory + Prisma) for plan prices, packs and drafts.
4. `BillableLeadPolicy`, `BillingPlansService`, `LeadPacksService`, `DraftInvoiceService` in `backend/src/modules/billing`.
5. Runtime + HTTP wiring (admin routes, broker statement).
6. Admin `/billing` page and broker consumption panel; source tests.
7. Runtime HTTP tests; `npm run validate`.
