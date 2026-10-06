# Runbook — Deployment (preproduction)

> Production has its own approved, manual job since spec 057: see `deployment-production.md`.

## When

Every push on `main` triggers `.github/workflows/ci.yml`: it verifies, scans for secrets and publishes the four `sha-<commit>` images to GHCR (API, public, back-office, broker; the preproduction job still deploys the first three). **It does not deploy by default.**

Deploying needs the self-hosted runner `assurmatch-preprod` to be online, and is opt-in:

- **Manual (default way).** Actions > CI > "Run workflow", select the ref, tick `deploy_preproduction`. This rebuilds and deploys the SHA of that ref.
- **Automatic on merge.** Set the repository variable `PREPROD_AUTO_DEPLOY` to `true` (Settings > Secrets and variables > Actions > Variables). Only while the runner is online; set it back to anything else before taking the runner down.

Why it is opt-in: when `assurmatch-preprod` is offline, GitHub does not fail the deploy job. It keeps it queued for the 24 h maximum, then cancels it, and the whole run turns red even though everything else passed. `timeout-minutes` bounds execution, not queue time. A push to `main` with deployment off ends on a `preproduction-deploy-skipped` job that emits a notice naming the published image tag.

## Before deploying

Check the runner state: Settings > Actions > Runners, or

```bash
gh api repos/bkourouma/AssurMatch/actions/runners \
  -q '.total_count, (.runners[] | "\(.name)\t\(.status)\t\(.busy)")'
```

Three states, three different fixes:

| Output | Meaning | Fix |
| --- | --- | --- |
| an `assurmatch-preprod` row, `online` | ready | deploy |
| an `assurmatch-preprod` row, `offline` | registered, agent stopped | start the service on the host: `sudo ./svc.sh start` |
| no `assurmatch-preprod` row (`total_count: 0`) | not registered at all | re-register it, see below |

Either of the last two means the deploy job sits in the queue for 24 h, then gets cancelled and turns the whole run red.

### Re-registering the runner

The registration token is short-lived and belongs to a repository admin: generate it from Settings > Actions > Runners > "New self-hosted runner", use it directly on the host, never commit or paste it elsewhere.

On the preproduction host, in the runner directory:

```bash
./config.sh --url https://github.com/bkourouma/AssurMatch \
  --token <REGISTRATION_TOKEN> \
  --name assurmatch-preprod \
  --labels assurmatch-preprod \
  --unattended
sudo ./svc.sh install
sudo ./svc.sh start
```

- **The `assurmatch-preprod` label is mandatory.** The deploy job declares `runs-on: [self-hosted, assurmatch-preprod]`; without that exact label GitHub never assigns it the job, whatever the runner is named.
- Install it as a service (`svc.sh install`), not `./run.sh`: a foreground runner does not survive a host reboot and you land back on the 24 h queue.

Then verify before deploying:

```bash
gh api repos/bkourouma/AssurMatch/actions/runners \
  -q '.runners[] | "\(.name)\t\(.status)\t\([.labels[].name] | join(","))"'
```

Expect one `assurmatch-preprod` row, `online`, carrying both `self-hosted` and `assurmatch-preprod` in its labels.

## Steps

1. Confirm CI verify is green.
2. Confirm the three image tags `sha-<short>` were pushed to GHCR.
3. Watch the SSH deploy step: it pulls three images, swaps three containers (`assurmatch-app`, `assurmatch-public`, `assurmatch-backoffice`), runs health checks, prunes.
4. Verify externally:
   ```bash
   curl -fsS https://api-assurmatch.allianceconsultants.net/healthz
   curl -fsS https://api-assurmatch.allianceconsultants.net/readyz
   curl -I https://assurmatch.allianceconsultants.net
   curl -I https://backoffice-assurmatch.allianceconsultants.net
   ```
5. Spot-check `docker logs assurmatch-app` for boot errors.

## Rollback (auto)

If any health check fails, the deploy script exits non-zero. The previous image is still tagged `latest` in GHCR; rerun the rollback runbook.
