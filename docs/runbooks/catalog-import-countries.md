# Runbook — Country catalog import

## When

Adding or updating a country in `scripts/preprod/seeds/reference/countries.json`.

## Steps

1. Edit the JSON. Keep flags fail-closed (false) for the new entry.
2. Open a PR, get review, merge to `main`. CI builds and deploys new images.
3. On the VPS:
   ```bash
   docker exec assurmatch-app npm run seed:reference
   ```
4. Verify in `/admin/dashboard` that the country appears with status `draft` and all flags false.
5. To activate publicly later, follow `activation-country.md`.

## Notes

- The seed is idempotent.
- Adding a hors-CIMA country requires creating a `RegulatoryRegime` entry first (via the admin tools or via a separate spec).
