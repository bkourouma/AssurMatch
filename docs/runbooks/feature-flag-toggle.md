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
