# Data Model: Preproduction Seed and Import

This document specifies which data is **versioned in Git as reference seed** and which is **imported on the VPS via secured scripts**. No new persistent entity is introduced; this is an operational view of existing AssurMatch entities.

## Two tracks

| Track | Stored in | Loaded by | Sensitivity |
|-------|-----------|-----------|-------------|
| Reference (R) | Git, under `scripts/preprod/seeds/reference/*.json` | `scripts/preprod/seed-reference.ts` | None — public, synthetic, parameterized |
| Operational confidential (O) | VPS only, under `/home/deployer/apps/assurmatch/imports/<batch-id>/` | `scripts/preprod/import-partners.ts` | High — never committed |

## R — Reference catalogs (versioned in Git)

### R.1 Countries

`countries.json` — array of:

```json
{
  "isoCode": "CI",
  "name": "Cote d'Ivoire",
  "currency": "XOF",
  "languages": ["fr"],
  "timezone": "Africa/Abidjan",
  "regulatoryFamily": "cima",
  "regulatoryRegimeId": "<uuid of seeded regime>",
  "status": "draft",
  "flags": {
    "country_public_enabled": false,
    "country_quote_enabled": false,
    "country_comparison_enabled": false,
    "country_broker_onboarding_enabled": false,
    "country_ai_enabled": false,
    "country_waitlist_enabled": false
  }
}
```

Target list spans CIMA, FANAF, and any hors-CIMA country product/compliance prescribes. Final list provided before /speckit.tasks.

### R.2 Currencies

`currencies.json` — minimal currency table mirroring ISO 4217 entries used by the country list (`XOF`, `XAF`, `EUR`, `USD`, `MAD`, etc.).

### R.3 Languages

`languages.json` — language codes with display names (`fr`, `en`, `pt`, `ar`, …).

### R.4 Regulatory regimes

`regulatory-regimes.json` — generic regimes:

- `cima` — generic CIMA template.
- `fanaf` — generic FANAF template.
- `domestic-<isoCode>` — placeholder for hors-CIMA regimes (filled in by compliance per country).

### R.5 Product categories

`product-categories.json` — categories mapping the PRD: personal-lines, commercial-lines, life-savings, microassurance, specialty.

### R.6 Products

`products.json` — array of:

```json
{
  "key": "auto",
  "name": "Assurance auto",
  "category": "personal-lines",
  "defaultFlags": {
    "product_public_enabled": false,
    "product_quote_enabled": false,
    "product_comparison_enabled": false,
    "product_document_upload_enabled": false,
    "product_sensitive_data_enabled": false,
    "product_manual_review_required": true,
    "product_ai_scoring_enabled": false,
    "product_ai_form_assistant_enabled": false
  }
}
```

Full list (templates):

- auto, moto, sante, voyage, habitation, vie-epargne, entreprise, transport, agricole, scolaire, microassurance, credit-caution, cyber, evenementiel, construction, others-as-prescribed.

### R.7 Default feature flags

`feature-flags.defaults.json` — mirrors `backend/src/modules/feature-flags/default-flags.ts` exactly. Every sensitive flag stays `false`. Used to bootstrap a fresh preprod database.

### R.8 Statuses

`statuses.json` — documented enums for partners (`draft`, `pending_compliance`, `active`, `suspended`, `retired`, `test`), licenses (`valid`, `expiring_soon`, `expired`, `blocked`, etc.), offers, lead assignments, CRM pipeline, AI states. Reference only — the source of truth remains the TypeScript code.

### R.9 Consent text templates (no PII, no real legal text)

`consent-templates.json` — parameterized templates per language and purpose. The actual published text per country/product is provided by compliance and is either imported on the VPS or curated and committed only after compliance signoff. Templates do **not** count as legally published until promoted.

## O — Operational confidential data (imported on the VPS)

Each batch is a directory `imports/<batch-id>/` containing:

- `manifest.json` — metadata (batch id, author, signature, file list, sha256).
- `partners.json` — partner records (legal name, trade name, registration number, plan, contact emails, WhatsApp, quotas, capacity status, status, country authorizations, product authorizations).
- `licenses.json` — license records (partnerLegalName, license number, issuing authority, country isoCode, productKeys, status, effective/expiration dates).
- `offers.json` — offer records (partnerLegalName, country isoCode, productKey, name, indicative price min/max, currency, validity period, sponsorship marker).
- `users.json` — broker advisor users (email, role, partnerLegalName, mfa requirement).
- `documents/<filename>` — accreditation document files referenced by license records.

### Validation rules

- All emails normalized lowercase.
- All countries must exist in the seeded reference catalog.
- All product keys must exist in the seeded reference catalog.
- License `expirationDate` ≥ `effectiveDate`; `expirationDate` ≥ today.
- Partner is unique on (`legalName`, `registrationNumber`); license is unique on (`partnerLegalName`, `licenseNumber`).
- Offer `validUntil` > `validFrom`; status accepted = `draft` or `validated` only at import time (no `active` directly).
- User email + role must respect the role matrix (`packages/shared/rbac/assurmatch-role-matrix.ts`).

### Audit per import

For each row imported, the import script writes an `AuditLog`:

- `partner.imported` / `partner_license.imported` / `offer.imported` / `user.imported`
- targetType: `Partner` / `PartnerLicense` / `Offer` / `User`
- targetId: row id
- scope: `{ batchId, source: "operational-import" }`
- result: `success` or `failed` (with reason)
- correlationId: batch id

### Idempotency

- Re-running a batch with the same `manifest.json` is a no-op for unchanged rows.
- Updates require a new `manifest.json` with `mode: "update"` or `mode: "upsert"` per row.
- Deletions require an explicit `mode: "soft-delete"` or `mode: "retire"`; physical deletion is never performed by import.

### Rollback

- For each successful batch, the script writes `imports/<batch-id>/rollback.json` capturing the prior state of touched rows.
- The runbook documents how to reapply `rollback.json` via the same script in `--rollback` mode.

## Activation publique flow (read-only)

Activation does not run through the import scripts. Operators flip feature flags via the existing admin endpoint with audit. The plan does not introduce a new activation entity.

## Future spec hooks

If a future spec introduces multi-region partners, audit roll-ups, or scheduled activation, this data model would extend rather than replace the two tracks above.
