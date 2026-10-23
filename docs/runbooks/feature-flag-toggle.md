# Runbook — Feature flag toggle (any scope)

## When

Any per-scope flag flip: global, country, product, partner, plan.

## Steps

```bash
curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": <true|false>, "reason": "<who, when, why>"}'
```

The `reason` field is mandatory and shows up in `AuditLog`. Be specific: include the operator name, the
date, and the go/no-go reference if applicable.

## Sensitive flags (compliance policy path)

Sensitive flags (AI, billing, satisfaction survey, retention purge, SMS/WhatsApp, partner API and
webhooks, multi-broker routing) are refused by the route above. A compliance decision is applied
with the audited command (`feature_flag.policy_applied`, policy reference and approver recorded):

```bash
npm run ops:apply-flag-policy -- --flag satisfaction_survey_enabled --value true \
  --reference "POL-2026-048" --approved-by "Nom Prenom, DPO" --reason "Ouverture de l'enquete CI"
# in production: docker compose -f docker-compose.production.yml run --rm api \
#   node --import tsx scripts/ops/apply-flag-policy.ts --flag ... --value true --reference ... --approved-by ... --reason ...
```

The API re-reads the flags every `ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS` (30 s by default), the
worker before every cycle. Switching a flag off is always accepted; payments, e-signature, policy
issuance, claims and insurer API are refused whatever the policy.

## AI flags per country and product (spec 074)

`country_ai_enabled`, `product_ai_scoring_enabled` and `product_ai_form_assistant_enabled` are NOT changed by the route above nor by the catalogue (both refuse them). They follow the audited, protected path of the admin screen `/ai-assistance/flags` (`POST /admin/ai/scope-flags`):

- MFA is mandatory. The screen and the route only DISABLE (`super_admin`, `compliance_admin`, `ai_admin`; reason only; the actor's country/product scopes apply). Any HTTP activation is refused with 403 `ACTIVATION_VIA_OPS_ONLY` and audited (pending the owner's arbitration on a derogation to specs 035 and 050).
- Activation is an operations command with a policy reference, an approver and a reason (audit `feature_flag.policy_applied`): `npm run ops:apply-flag-policy -- --flag <country_ai_enabled|product_ai_scoring_enabled|product_ai_form_assistant_enabled> --scope-type <country|product> --scope-id <uuid> --value true --reference <ref> --approved-by "<name, role>" --reason "<text>"`.
- A `highly_sensitive` product refuses AI activation (documented exception required).
- Every refusal is audited (`feature_flag.change_refused`). The global AI flags stay on `npm run ops:apply-flag-policy` (read-only on the screen).

## Forbidden

This runbook MUST NOT be used to flip any of the following to `true` without a separate validated spec:

- `payments_enabled`
- `e_signature_enabled`
- `policy_issuance_enabled`
- `claims_enabled`
- `insurer_api_enabled`
- `ai_recommendation_enabled`
- `ai_lead_scoring_enabled`
- `ai_summary_enabled`
- `ai_broker_assistant_enabled`
- `multi_broker_routing_enabled`
- `whatsapp_enabled`
- `sponsored_offers_enabled`
- `billing_enabled`
