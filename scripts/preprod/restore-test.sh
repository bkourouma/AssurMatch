#!/usr/bin/env sh
# AssurMatch backup restore-test. Manual procedure. NEVER run against the live preprod DB.
#
# Usage:
#   1. Copy a recent backup from $BACKUP_DIR/postgres/postgres-<date>.sql.gz[.gpg] to a workspace.
#   2. If encrypted, decrypt:
#        gpg --batch --yes --decrypt --passphrase "$BACKUP_PASSPHRASE" \
#            --output workspace/dump.sql.gz workspace/postgres-<date>.sql.gz.gpg
#   3. Provision a temporary PostgreSQL database (separate from preprod):
#        createdb -h localhost -U postgres assurmatch_restore_test
#   4. Restore:
#        gunzip -c workspace/dump.sql.gz | psql "postgresql://postgres@localhost/assurmatch_restore_test"
#   5. Verify integrity:
#        psql ... -c "SELECT count(*) FROM \"AuditLog\";"
#        psql ... -c "SELECT count(*) FROM \"FeatureFlag\";"
#        psql ... -c "SELECT count(*) FROM \"PartnerLicense\";"
#   6. Document the restore-test result in the operations journal (date, source backup, counts, anomalies).
#   7. Drop the temporary database:
#        dropdb -h localhost -U postgres assurmatch_restore_test
#
# This is a dry-run helper; it will NOT execute anything destructive automatically.
echo "[restore-test] Read this script's comments and run the steps manually."
exit 0
