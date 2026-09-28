# Runbook — Deployment

## When

Every push on `main` triggers `.github/workflows/ci.yml`: it verifies, scans for secrets and publishes the three `sha-<commit>` images to GHCR. **It does not deploy by default.**

Deploying needs the self-hosted runner `assurmatch-preprod` to be online, and is opt-in:

- **Manual (default way).** Actions > CI > "Run workflow", select the ref, tick `deploy_preproduction`. This rebuilds and deploys the SHA of that ref.
- **Automatic on merge.** Set the repository variable `PREPROD_AUTO_DEPLOY` to `true` (Settings > Secrets and variables > Actions > Variables). Only while the runner is online; set it back to anything else before taking the runner down.

Why it is opt-in: when `assurmatch-preprod` is offline, GitHub does not fail the deploy job. It keeps it queued for the 24 h maximum, then cancels it, and the whole run turns red even though everything else passed. `timeout-minutes` bounds execution, not queue time. A push to `main` with deployment off ends on a `preproduction-deploy-skipped` job that emits a notice naming the published image tag.

## Before deploying

Check that the runner is online: Settings > Actions > Runners, or

```bash
gh api repos/bkourouma/AssurMatch/actions/runners \
  -q '.runners[] | "\(.name)\t\(.status)\t\(.busy)"'
```

`offline` means the deploy will hang for 24 h. Bring the runner back up first.

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
