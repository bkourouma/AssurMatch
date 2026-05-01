# Runbook — License expired

## When

A partner's license is reported expired or detected expired by the dashboard alerts.

## Steps

1. Verify the license entry: status, expiration date, country, products.
2. Mark the license `expired` (or `suspended` if temporarily blocked) via the admin tooling. Audit:
   `partner_license.changed`.
3. Routing immediately excludes the partner for the scoped country/products.
4. Communicate with the partner and request a renewal document.
5. Once a renewed license document is available, follow `operational-import-partners.md` to import a
   new license entry. Then optionally reactivate the partner.

## Notes

The dashboards (spec 012) surface alerts for expired and expiring-soon licenses; use those as a daily
sanity check.
