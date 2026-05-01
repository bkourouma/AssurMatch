# Runbook — Activate a country publicly

## Prerequisites

- Country present in seeded catalog.
- Mentions legales / privacy / terms published for the country.
- At least one validated, licensed partner authorized for the country.
- Smoke tests pass for the country (catalog, quote consented, quote refused, license-expired).
- Per-scope go/no-go checklist signed (`specs/013-preproduction-launch-readiness/checklists/go-no-go.md`).

## Steps

```bash
# Acting as a Super Admin actor with valid MFA
curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id-country-public-CI> \
  -H "Authorization: Bearer <admin token>" \
  -d '{"value": true, "reason": "country CI go-no-go signed by compliance YYYY-MM-DD"}'
```

Verify:

```bash
curl https://api-assurmatch.allianceconsultants.net/countries
```

The country must now appear publicly. Document the activation in the operations journal.

## Rollback

Set the flag back to `false` (`rapid-disable.md`). Audit captures both events.
