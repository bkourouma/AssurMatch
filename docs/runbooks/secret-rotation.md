# Runbook — Secret rotation

## Rotation cadence

| Secret                | Cadence | Notes                                                            |
|-----------------------|---------|------------------------------------------------------------------|
| `JWT_SECRET`          | 90 days | Rotating invalidates active tokens; broker/admin must re-login.   |
| `SESSION_SECRET`      | 90 days | Same.                                                             |
| `ENCRYPTION_KEY`      | on demand | Only rotate if a breach is suspected; coordinate with field re-encryption flow when implemented. |
| `BACKUP_PASSPHRASE`   | 180 days | Keep previous passphrase available until oldest in-retention backup expires. |
| `PII_ENCRYPTION_KEYS` / `PII_ENCRYPTION_ACTIVE_KEY_ID` | 365 days, or at once on suspected breach | Lot 8 (spec 075). Add the new key to the ring, switch the active id, run `npm run ops:backfill-pii -- --apply`, remove the old key only once no row carries its id. Never just replace the value: rows written under a removed key become unreadable. Step by step: [pii-encryption.md](pii-encryption.md#rotation). |
| `PII_BLIND_INDEX_KEY` | on demand (suspected breach only) | Lot 8 (spec 075). Changing it requires a maintenance window and `npm run ops:backfill-pii -- --reindex --apply`; until it completes, de-duplication and erasure lookups miss the rows not yet re-indexed. See [pii-encryption.md](pii-encryption.md#blind-index-key). |
| `EMAIL_SMTP_PASS`     | on demand | Generate a new Gmail app password; revoke old one in Google account. |
| `GHCR_TOKEN`          | 90 days | Update the GitHub secret. |
| `VPS_SSH_PRIVATE_KEY` | 180 days | Generate new pair, deploy new public key on VPS, update GitHub secret, remove old key from `~/.ssh/authorized_keys`. |

## Steps (any secret)

1. Generate new value (`openssl rand -base64 48` or via the relevant provider).
2. Update `/home/deployer/apps/assurmatch/.env.production` on the VPS.
3. `docker restart` the affected containers (see below).
4. Verify functionality (`curl /admin/system/health`, login flow, send a test email if SMTP).
5. Document the rotation in the operations journal with date, custodian, and confirmation of
   container restart.

| Variable             | Containers to restart                                  |
|----------------------|-------------------------------------------------------|
| `JWT_SECRET`         | `assurmatch-app`, `assurmatch-public`, `assurmatch-backoffice` |
| `SESSION_SECRET`     | same                                                   |
| `ENCRYPTION_KEY`     | `assurmatch-app`                                       |
| `EMAIL_SMTP_PASS`    | `assurmatch-app`                                       |
| `PII_ENCRYPTION_KEYS`, `PII_ENCRYPTION_ACTIVE_KEY_ID`, `PII_BLIND_INDEX_KEY` | `assurmatch-app` and `assurmatch-worker` (same values in both env files), then the backfill |
| `BACKUP_PASSPHRASE`  | none (used only by backup scripts)                     |
