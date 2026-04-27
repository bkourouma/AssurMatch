# Runbook — Activate a product within a country

## Prerequisites

- Country already activated publicly.
- Product present in seeded catalog.
- Form definition + required documents + disclaimers configured for the country/product.
- At least one valid offer indicative attached to a licensed partner for this country/product.
- Per-scope go/no-go signed.

## Steps

```bash
curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id-product-public-auto-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "product auto/CI activation YYYY-MM-DD"}'
```

Verify:

```bash
curl https://api-assurmatch.allianceconsultants.net/countries/CI/products
```

Optional: also flip `product_quote_enabled=true` per decision.

## Rollback

`rapid-disable.md`.
