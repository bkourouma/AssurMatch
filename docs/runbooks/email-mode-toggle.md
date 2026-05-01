# Runbook — Email mode toggle

## When

Switch `EMAIL_PREVIEW_MODE` between `true` (no real send) and `false` (Gmail SMTP delivery).

## To go from preview to send

1. Confirm compliance signoff.
2. Confirm a controlled inbox is ready for the first real-send test.
3. Edit `/home/deployer/apps/assurmatch/.env.production`: set `EMAIL_PREVIEW_MODE=false`.
4. `docker restart assurmatch-app`.
5. Send a test email (manual or via a smoke endpoint) to the controlled inbox.
6. Verify delivery and that `AuditLog` records the send.
7. Document the change in the operations journal.

## To go from send back to preview

1. Edit env: `EMAIL_PREVIEW_MODE=true`.
2. `docker restart assurmatch-app`.

## Optional: redirect all preprod emails to a single test address

Set `EMAIL_TEST_RECIPIENT=test@example.com`. Useful when validating end-to-end flows without
contacting real broker partners.
