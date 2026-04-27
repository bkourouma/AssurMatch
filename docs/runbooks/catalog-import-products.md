# Runbook — Product catalog import

## When

Adding or updating a product in `scripts/preprod/seeds/reference/products.json`.

## Steps

1. Edit the JSON. Default flags must be fail-closed (`product_public_enabled=false`, `product_quote_enabled=false`, etc.).
2. PR + review + merge.
3. On the VPS:
   ```bash
   docker exec assurmatch-app npm run seed:reference
   ```
4. To activate publicly later for a country/product pair, follow `activation-product.md`.
