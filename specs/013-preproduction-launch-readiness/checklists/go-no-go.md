# Go/No-Go Checklist (per scope)

This checklist gates **public activation** of a scope. There is no global "go" button. A scope = a country, a product within a country, or a partner within a country/product.

## A. Preprod-readiness pre-check (one-time, before any scope activation)

- [ ] CI verify green on `main`.
- [ ] CI build-and-deploy succeeded; container responds 200 on `/admin/system/health`.
- [ ] Three domains resolve over HTTPS with valid certs.
- [ ] CORS strict on all three; no wildcard.
- [ ] Security headers present on all three (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, basic CSP).
- [ ] `.env.production` on the VPS is `0600`, owned by `deployer`, contains all mandatory vars.
- [ ] Reference seed applied; PG/Redis/queues healthy.
- [ ] Sensitive flags fail-closed in DB (payments, e_signature, policy_issuance, claims, insurer_api, ai_recommendation, ai_lead_scoring, ai_summary, ai_broker_assistant, whatsapp, sponsored_offers, multi_broker_routing, billing).
- [ ] At least one Super Admin account created with MFA enrolled.
- [ ] Backup cron in place; one restore test executed and documented.
- [ ] Audit visible at `/admin/audit-logs`; entries durable in PostgreSQL.
- [ ] No `.env*` (other than `.env*.example`) and no `imports/` content tracked by Git.
- [ ] `npm audit --audit-level=high` clean.
- [ ] Smoke list (Quickstart §E) passes against the deployed environment.

## B. Country activation checklist (per country)

- [ ] Country present in seeded reference catalog with correct ISO code, currency, languages, timezone, regulatory regime.
- [ ] Mentions legales, politique de confidentialite, conditions d'utilisation **published** for this country (file references stored in DB / docs).
- [ ] Consent text(s) published for this country and the products to be opened.
- [ ] At least one validated, licensed partner authorized for this country (license valid, dates current).
- [ ] Routing rules for this country reviewed and approved by compliance.
- [ ] Smoke checks executed against this country: catalog, quote consented, quote refused, license-expired exclusion, dashboard gating.
- [ ] AuditLog visible for the activations that already occurred for this country (consent publish, partner activation).
- [ ] Compliance officer signoff (named person + date + reason) recorded as the `reason` field when flipping the flag.

→ **If all checked**, flip `country_public_enabled=true` (scopeId = country uuid). Optionally flip `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled` per decision.

## C. Product activation checklist (per product within a country)

- [ ] Product present in seeded reference catalog with metadata.
- [ ] Form definition (`QuoteFormDefinition`) published for this country/product.
- [ ] Required documents list defined; upload pipeline tested.
- [ ] Disclaimers ("offre indicative", "prix a confirmer par le courtier partenaire") visible in the public form.
- [ ] Comparison rules reviewed.
- [ ] Sensitivity classification confirmed (`product_sensitive_data_enabled` set deliberately).
- [ ] At least one offer indicative valide non expiree exists for this product within this country, attached to a licensed partner.
- [ ] Routing rules tested for this product/country combo (smoke).
- [ ] AI flags for this product remain `false` unless explicitly approved.
- [ ] Compliance officer signoff recorded in the activation `reason`.

→ **If all checked**, flip `product_public_enabled=true` (scopeId = `country|product`). Optionally flip `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled` per decision.

## D. Partner activation checklist (per partner)

- [ ] Partner imported via secured operational import (audit visible).
- [ ] Plan recorded (Starter | Pro | Enterprise).
- [ ] License(s) valid, dates current, scopes (country, products) match the activations targeted.
- [ ] Accreditation documents present in the upload volume; checksums match DB rows.
- [ ] Contact channel verified (email reachable, MFA enrolment for owner).
- [ ] Quotas configured; capacity status `available` or `limited` deliberately.
- [ ] Routing rules respect the partner's authorizations.
- [ ] AuditLog confirms `partner.imported` and `partner_license.imported` for this partner.
- [ ] Compliance officer signoff recorded.

→ **If all checked**, set partner status to `active`. Optionally flip `country_broker_onboarding_enabled` or partner-scoped flags as decided.

## E. Forbidden activations

These remain `false` and require a separate spec/process to ever flip:

- `payments_enabled`
- `e_signature_enabled`
- `policy_issuance_enabled`
- `claims_enabled`
- `insurer_api_enabled`
- `ai_recommendation_enabled`
- `ai_lead_scoring_enabled`
- `ai_summary_enabled`
- `ai_broker_assistant_enabled`
- `multi_broker_routing_enabled` (unless explicit product/compliance decision)
- `whatsapp_enabled`
- `sponsored_offers_enabled` (unless explicit product/compliance decision)

Activation of any of these via the dashboards endpoints is **not authorized by spec 013**. They require a dedicated spec.

## F. Roll-back plan attached to every scope activation

Every flag flip records (in `AuditLog.reason`) the rollback procedure: who can flip back, in what conditions, with what communication to partners. The rapid-disable runbook (`docs/runbooks/rapid-disable.md`) must be tested at least once per quarter.
