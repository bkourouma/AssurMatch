# Reference seed (committed in Git)

This directory holds **non-sensitive reference data** versioned in the repo. The seed script
`scripts/preprod/seed-reference.ts` reads these files and upserts the corresponding rows in PostgreSQL.
The script is idempotent: running it again on an already-seeded database is a no-op for unchanged rows.

| File | Role |
|------|------|
| `countries.json` | Catalog of 9 CIMA countries with default flags fail-closed |
| `currencies.json` | Currencies referenced by the countries |
| `languages.json` | Language codes used by countries / texts |
| `regulatory-regimes.json` | CIMA / FANAF / national-template generic regimes |
| `product-categories.json` | Product category enum mirror |
| `products.json` | Catalog of 15 PRD products with default flags fail-closed |
| `feature-flags.defaults.json` | Mirrors `backend/src/modules/feature-flags/default-flags.ts` for fresh-init seeding |
| `consent-templates.json` | Parameterized consent templates (no real legal text) |

## What is NOT here

Real partners, real licences, real offers, real advisor users, real contact emails, real accreditation
documents — they live OUT of Git and are imported on the VPS via `scripts/preprod/import-partners.ts`.
See `specs/013-preproduction-launch-readiness/contracts/seed-import-contract.md`.

## Adding more countries / products later

Edit the relevant JSON, send a PR, run `seed-reference.ts` after merge. The script upserts; existing
rows are updated only on diff. Public activation of the new country/product follows the per-scope
go/no-go checklist (`specs/013-preproduction-launch-readiness/checklists/go-no-go.md`).
