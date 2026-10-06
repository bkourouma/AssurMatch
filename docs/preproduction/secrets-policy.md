# Secrets policy

## Rules

1. **No secret in Git.** The repo only ships `.env.example`, `.env.preproduction.example` and the
   production examples `.env.production.{api,worker,public,admin,broker}.example` with placeholder
   values (`REDACTED`, empty, or `<domain>`).
2. **`.env*` is gitignored** (except the `.example` files). The CI verify job runs a secret-scan
   step that fails if any tracked file contains `EMAIL_SMTP_PASS=` followed by anything other than
   `REDACTED`, or contains a private key block.
3. **VPS env file** (preproduction) lives at `/home/deployer/apps/assurmatch/.env.production`, owned by
   `deployer:deployer`, mode `0600`. The pre-deploy script refuses to continue if perms are wrong.
   **Production** (spec 057) uses one file per container in `/home/deployer/apps/assurmatch/env/`
   (`api.env`, `worker.env`, `public.env`, `admin.env`, `broker.env`), mode `0600`: the frontends
   receive no secret at all, and `scripts/production/pre-deploy-check.sh` refuses a frontend file
   carrying `DATABASE_URL`, a token secret or a provider key.
4. **Generation**: `ASSURMATCH_AUTH_TOKEN_SECRET` and `ENCRYPTION_KEY` via `openssl rand -base64 48`
   (`JWT_SECRET` / `SESSION_SECRET` are not read by the code). The Gmail
   `EMAIL_SMTP_PASS` is a 16-character app password generated in Google account security settings
   (2FA must be enabled).
5. **Custodians**: documented per environment in the operations journal. Default custodian set
   includes the operator who owns `GHCR_TOKEN`, the operator who holds `BACKUP_PASSPHRASE`, and the
   compliance/operator who holds the Gmail app password.
6. **Rotation**: every 90 days for `ASSURMATCH_AUTH_TOKEN_SECRET` (logs every session out);
   `ENCRYPTION_KEY` only with a re-encryption plan (it protects stored MFA and integration secrets); every 180 days for `BACKUP_PASSPHRASE` (longer
   intervals require existing backups to remain decryptable — keep the previous passphrase available
   until oldest in-retention backup expires); on demand for Gmail app password (revoke + regenerate).
7. **Imports**: real partners/licenses/offers/users/documents NEVER enter Git. They land at
   `/home/deployer/apps/assurmatch/imports/<batch-id>/` and are processed by
   `scripts/preprod/import-partners.ts`. The directory is gitignored.
8. **Backups**: optionally encrypted with `gpg --symmetric --cipher-algo AES256` keyed by
   `BACKUP_PASSPHRASE`. Stored locally only in 013; offsite is a future improvement.

## Recovery

- Lost `ASSURMATCH_AUTH_TOKEN_SECRET` → rotate via runbook, every session is logged out.
- Lost `ENCRYPTION_KEY` → stored MFA secrets become unreadable: reset MFA for every user (`mfa-reset.md`).
- Lost Gmail app password → regenerate in Google account, update env file, restart container.
- Lost `BACKUP_PASSPHRASE` → previous backups become unrecoverable. Document the date of loss; new
  backups proceed under a new passphrase.

## Audit

Every flag flip, secret rotation, partner import and activation publique writes a durable
`AuditLog`. Compliance admins review the audit weekly during preprod.
