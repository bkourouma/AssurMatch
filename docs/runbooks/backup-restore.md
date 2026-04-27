# Runbook — Backup and restore

## Backup (automatic, daily on the VPS)

- `02:00 UTC`: `scripts/preprod/backup-postgres.sh` runs.
- `02:30 UTC`: `scripts/preprod/backup-uploads.sh` runs.
- Retention 14 days, encrypted with `gpg --symmetric --cipher-algo AES256` if `BACKUP_PASSPHRASE` set.

Configure crontab:

```
0 2 * * * /home/deployer/apps/assurmatch/scripts/preprod/backup-postgres.sh >> /home/deployer/apps/assurmatch/backups/backup.log 2>&1
30 2 * * * /home/deployer/apps/assurmatch/scripts/preprod/backup-uploads.sh >> /home/deployer/apps/assurmatch/backups/backup.log 2>&1
```

## Manual backup

```bash
ssh deployer@<vps>
/home/deployer/apps/assurmatch/scripts/preprod/backup-postgres.sh
/home/deployer/apps/assurmatch/scripts/preprod/backup-uploads.sh
```

## Restore test (mandatory before global go)

Follow the manual procedure inside `scripts/preprod/restore-test.sh`. Restore on a separate temporary
database, verify counts on `AuditLog`, `FeatureFlag`, `PartnerLicense`, drop the temporary database.

## Notes

- Offsite backup is a future improvement. Currently local only.
- Losing `BACKUP_PASSPHRASE` makes existing encrypted backups unrecoverable. Document custodian.
