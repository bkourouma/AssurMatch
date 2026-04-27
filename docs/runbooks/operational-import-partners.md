# Runbook — Operational partners import

## Bundle layout

```
/home/deployer/apps/assurmatch/imports/<batch-id>/
  manifest.json          (sha256 per file)
  partners.json
  licenses.json
  offers.json
  users.json
  documents/<files>
```

## Steps

```bash
ssh deployer@<vps>
cd /home/deployer/apps/assurmatch

# Place the bundle (out-of-Git delivery, e.g. SCP from a compliance workstation)
mkdir -p imports/2026-04-27-001
# scp from the source workstation: scp -r ./bundle/* deployer@<vps>:.../imports/2026-04-27-001/

# Dry-run (default — verifies sha256, validates rows, no writes)
docker exec assurmatch-app npm run import:partners -- --batch /app/imports/2026-04-27-001

# Apply (only after dry-run is clean)
docker exec assurmatch-app npm run import:partners -- --batch /app/imports/2026-04-27-001 --apply
```

Audit entries appear at `/admin/audit-logs` with `correlationId = batch-id`.

## Notes

- 013 ships the SAFE skeleton: dry-run + sha256 verification. The `--apply` write phase is a follow-up
  task; until it's implemented, the script logs an explicit warning and stops without touching the
  database.
- Cryptographic signing of bundles is deferred to a future hardening spec.
- Real partner data NEVER enters Git.
