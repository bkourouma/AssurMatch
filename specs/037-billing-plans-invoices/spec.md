# Feature Specification: Billing Plans, Billable Leads, Draft Invoices And Lead Packs

**Feature Branch**: `037-billing-plans-invoices`
**Created**: 2026-09-07
**Status**: Validated (user asked for autonomous implementation of the full PRD backlog)
**Validation State**: Explicitly approved
**Continuous Workflow Eligible**: Yes (standard feature; no payment, no collection, no issued invoice)

## Constitutional Scope & Compliance (Principle V)

- **Technical platform role**: AssurMatch bills its partner brokers for platform usage. It never collects an insurance premium, never issues a legally binding invoice from this module, and never takes a commission on a policy. Everything produced here is an internal draft (`draft_not_billable`) until a future, separately specified payment feature.
- **Impacted application(s)**: Backend API, database / Prisma / migrations, shared packages, Back-office Plateforme (`/billing`), Broker Back-office (consumption panel, DASH-B-008).
- **Affected scopes**: Countries (plan prices are per country and plan), partners (their plan, packs, drafts), admin country/product scopes for reads.
- **Frontend separation**: Admin routes under `/admin/billing/...`; the broker reads only its own statement under `/broker/billing/statement`.
- **Required feature flags**: `billing_enabled` (global, default false, sensitive - only the audited compliance policy path can enable it). `payments_enabled` stays false and is asserted by the module; every response keeps `paymentsEnabled: false` and `collectionEnabled: false`.
- **Consent and transmission**: No prospect data leaves the platform. The billable-lead rule reads consent, duplicate and routing metadata that already exist on the lead; no contact detail is exposed in billing responses (only counts and lead references).
- **Partner license controls**: A lead only counts when the partner was eligible at assignment time (country active, product active, broker assigned); disputes accepted by an admin remove the lead from the draft total.
- **Audit and data history**: Plan price changes, pack grants/consumptions, draft recomputation and dispute-driven credits are audited with actor, reason and before/after values. Draft invoices, plan prices and packs are persisted (migration `0012_billing_plans`).
- **Security and RBAC**: MFA required. Reads need `billing:read`; plan and pack mutations need `billing:*` (Finance Admin, Super Admin). Brokers read only their own tenant statement (Pro/Enterprise or Starter, all plans may see their consumption).
- **Routing impact**: None - billing never changes routing, eligibility or lead status.
- **AI impact**: None.
- **UX/content restrictions**: "Brouillon non facturable", "aucun encaissement", "aucune emission de facture". Never "Payer maintenant", "Facture emise", "Acheter", "Souscrire maintenant".
- **Workflow continuity**: Standard.

## Requirements

- Contracts `billing.contracts.ts`: plan price (plan, countryCode, monthly subscription, per-lead price, setup fee, currency), billable-lead evaluation result, draft invoice (lines, totals, status), lead pack (credits granted/consumed/remaining), broker statement.
- Prisma models `BillingPlanPrice`, `LeadPack`, `DraftInvoice` + migration `0012_billing_plans`; memory and Prisma repositories.
- `BillableLeadPolicy`: a lead is billable when it has a valid email or phone, an active country, an active product, a collected consent, no duplicate status, an assigned broker and complete minimum information (PRD §24); each failed criterion is returned as a reason.
- `BillingPlansService`: list and upsert plan prices per plan/country (audited, versioned by history entry).
- `LeadPacksService`: grant prepaid credits to a partner (no payment recorded), list packs and remaining balance; drafts consume pack credits before charging per-lead amounts.
- `DraftInvoiceService`: compute a partner's monthly draft (subscription + billable leads - accepted disputes - pack credits), persist it as `draft_not_billable`, list drafts for admins and for the owning broker.
- HTTP: `GET|PUT /admin/billing/plans`, `GET /admin/billing/invoices`, `POST /admin/billing/invoices/recompute`, `GET|POST /admin/billing/packs`, and `GET /broker/billing/statement`.
- Admin `/billing` page shows plan prices, drafts and packs; broker CRM home shows consumption (DASH-B-008).

## User Scenarios & Testing

1. **Given** `billing_enabled` on and a plan price for `CI`/`pro`, **When** an admin recomputes drafts, **Then** the partner draft lists the subscription line and one line per billable lead, `status` is `draft_not_billable`, `paymentsEnabled` is false, and the recompute is audited.
2. **Given** a lead without consent, a duplicate lead and a lead with no contact, **Then** the billable-lead policy returns them as non-billable with explicit reasons and they are excluded from the draft.
3. **Given** an accepted dispute on a billable lead, **Then** the draft total drops by that lead's price and a credit line appears.
4. **Given** a pack of 10 credits, **Then** the draft consumes up to 10 lead units before charging, and the remaining balance is exposed.
5. **Given** a broker, **Then** `/broker/billing/statement` returns only its tenant consumption; another tenant's statement is never reachable; a support admin cannot mutate plans (403).
6. **Given** `billing_enabled` off, **Then** admin billing mutations are refused (422) and reads still expose the disabled state.

## Validation

- `npm run validate` green; admin and broker source tests; runtime HTTP tests for plans, drafts, packs and the broker statement; migration list test updated.
