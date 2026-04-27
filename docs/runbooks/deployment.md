# Runbook — Deployment

## When

Every push on `main` triggers `.github/workflows/ci.yml`. Manual deployments use the same workflow via the GitHub UI ("Re-run jobs").

## Steps

1. Confirm CI verify is green.
2. Confirm the three image tags `sha-<short>` were pushed to GHCR.
3. Watch the SSH deploy step: it pulls three images, swaps three containers (`assurmatch-app`, `assurmatch-public`, `assurmatch-backoffice`), runs health checks, prunes.
4. Verify externally:
   ```bash
   curl -I https://api-assurmatch.allianceconsultants.net/admin/system/health
   curl -I https://assurmatch.allianceconsultants.net
   curl -I https://backoffice-assurmatch.allianceconsultants.net
   ```
5. Spot-check `docker logs assurmatch-app` for boot errors.

## Rollback (auto)

If any health check fails, the deploy script exits non-zero. The previous image is still tagged `latest` in GHCR; rerun the rollback runbook.
