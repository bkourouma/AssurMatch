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

## Publish the quote form (required before any quote request)

`product_quote_enabled` alone is not enough: the public form only appears once a definition is
published for the country/product/language and bound to a published `lead_transmission` consent
text. Until then the public page renders its unavailable state and the activation checklist reports
*Parcours devis* as blocked. Publication requires `super_admin` or `compliance_admin` with MFA.

The reference seed deliberately does not create these: the consent text is a legal artifact whose
content is drafted per country, not generated.

```bash
curl -X POST https://api-assurmatch.allianceconsultants.net/admin/quote-form-definitions \
  -H "Authorization: Bearer <admin token>" -H "content-type: application/json" \
  -d '{"countryId":"<uuid>","productId":"<uuid>","language":"fr","version":"v1","status":"draft","consentTextId":"<published consent text uuid>","fields":[{"key":"vehicle_use","label":"Usage du vehicule","type":"select","required":true,"sensitivity":"public","options":["prive","professionnel"]}],"reason":"activation auto/CI YYYY-MM-DD"}'
```

```bash
curl -X POST https://api-assurmatch.allianceconsultants.net/admin/quote-form-definitions/<form-id>/publish \
  -H "Authorization: Bearer <admin token>" -H "content-type: application/json" \
  -d '{"reason": "activation auto/CI YYYY-MM-DD"}'
```

Publishing retires the previously published version for the same country, product and language in
the same transaction. The back-office screen `Formulaires devis` does the same thing with a form.

Verify:

```bash
curl https://api-assurmatch.allianceconsultants.net/countries/CI/products/auto/quote-form
```

## Rollback

`rapid-disable.md`.
