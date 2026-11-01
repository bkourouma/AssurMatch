# Runbook — Deployment (preproduction)

> Production has its own approved, manual job since spec 057: see `deployment-production.md`.

## Topology

Alliance VPS `147.93.44.169` (`ssh alliance`: user `deployer`, port 2222), shared with the other
Alliance applications. Host nginx terminates TLS; every container binds to `127.0.0.1` only.

| URL | Surface | Container | Port |
| --- | --- | --- | --- |
| `https://assurmatch.allianceconsultants.net` | Web Publique Client | `assurmatch-preprod-public` | 3601 |
| `https://backoffice-assurmatch.allianceconsultants.net` | Back-office Plateforme | `assurmatch-preprod-admin` | 3602 |
| `https://pro-assurmatch.allianceconsultants.net` | Broker Back-office | `assurmatch-preprod-broker` | 3603 |
| `https://api-assurmatch.allianceconsultants.net` | Backend API | `assurmatch-preprod-api` | 3600 |
| SSH tunnel only | Mailpit (captured e-mails) | `assurmatch-preprod-mailpit` | 3625 |

Plus `assurmatch-preprod-worker` (no port, one replica), `assurmatch-preprod-postgres` and
`assurmatch-preprod-redis` (compose network only). Compose file: `docker-compose.preprod-vps.yml`,
project `assurmatch-preprod`, run from `/home/deployer/apps/assurmatch-preprod`:

```
/home/deployer/apps/assurmatch-preprod/
  docker-compose.yml, deploy.sh, pre-deploy-check.sh, backup-db.sh   copied by each deployment
  .env                 deployed image tags (compose interpolation for manual commands)
  deploy-history.log   one line per successful deployment
  env/                 api.env worker.env public.env admin.env broker.env postgres.env (0700 / 0600)
  backups/             postgres-<label>-<date>.sql.gz (0700)
```

Preproduction e-mails go to Mailpit and are **never delivered**. Read them through a tunnel:
`ssh -L 8025:127.0.0.1:3625 alliance`, then `http://localhost:8025`.

## When

Every push on `main` triggers `.github/workflows/ci.yml`: verify, secret-scan, then the four
`sha-<commit>` images are published to GHCR (API, public, back-office, broker; the frontends compile
the `PREPROD_*_URL` repository variables). With the repository variable `PREPROD_AUTO_DEPLOY=true`,
`deploy-preproduction` then deploys on the VPS and `verify-preproduction` checks the public URLs.

- **Automatic on merge** (default once the runner is online): `PREPROD_AUTO_DEPLOY=true`. Set it to
  anything else before taking the runner down.
- **Manual**: Actions > CI > "Run workflow", select the ref, tick `deploy_preproduction`. Deploys the
  SHA of that ref.

Why it stays switchable: when `assurmatch-preprod` is offline, GitHub does not fail the deploy job. It
keeps it queued for the 24 h maximum, then cancels it, and the whole run turns red even though
everything else passed. With deployment off, a push ends on `preproduction-deploy-skipped`, which names
the published image tag.

## What a deployment does

`scripts/preprod/deploy.sh`, on the runner (checkout of the commit), as `deployer`:

1. copies the compose file and the preprod scripts into `/home/deployer/apps/assurmatch-preprod`;
2. `pre-deploy-check.sh`: env files present, mode 0600, mandatory variables, `APP_ENV=preproduction`,
   a database URL naming a preproduction database, no secret in the frontends, no forbidden module;
3. pulls the five application images of the commit;
4. starts PostgreSQL, Redis and Mailpit (no-op when healthy);
5. dumps the database (`backups/postgres-pre-deploy-*.sql.gz`) when a deployment is recorded — a failed
   dump stops everything before any change;
6. `prisma migrate deploy` + `migrate status` with the **new** API image; on the first deployment only,
   the idempotent reference seed (`ASSURMATCH_SEED_REFERENCE=1` forces it again);
7. swaps api, worker, public, admin, broker;
8. health: API `/readyz`, public `/`, admin `/login`, broker `/login`, worker running without restart;
9. success: records the tags in `.env` and `deploy-history.log`; failure: restarts the previous tags
   (containers only — migrations are never reverted, they must stay backward compatible) and fails.

## Host preparation (one time, done 2026-11-01)

1. **DNS** (Hostinger, zone `allianceconsultants.net`): A records to `147.93.44.169` for `assurmatch`,
   `backoffice-assurmatch`, `api-assurmatch` and `pro-assurmatch`.
2. **Env files**: from a checkout on the VPS, `sh scripts/preprod/bootstrap-env.sh`. Secrets are
   generated on the host, existing files are never overwritten. Keep a copy of `env/` in the secret
   store: losing `ENCRYPTION_KEY` or the PII keys makes the data unreadable.
3. **nginx + TLS**:
   ```bash
   sudo cp deploy/nginx/security-headers.conf /etc/nginx/snippets/assurmatch-security-headers.conf
   # HTTP-only first (the default server answers 444 to unknown hosts), then one certificate per name:
   sudo certbot certonly --webroot -w /var/www/html -d assurmatch.allianceconsultants.net
   sudo certbot certonly --webroot -w /var/www/html -d backoffice-assurmatch.allianceconsultants.net
   sudo certbot certonly --webroot -w /var/www/html -d api-assurmatch.allianceconsultants.net
   sudo cp deploy/nginx/assurmatch-preprod.conf /etc/nginx/sites-available/assurmatch-preprod
   sudo ln -sfn /etc/nginx/sites-available/assurmatch-preprod /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Broker: same with `pro-assurmatch.allianceconsultants.net` and `assurmatch-preprod-broker.conf`,
   once its DNS record exists.
4. **Daily backup** (crontab of `deployer`):
   `30 2 * * * sh /home/deployer/apps/assurmatch-preprod/backup-db.sh >> /home/deployer/apps/assurmatch-preprod/backups/backup.log 2>&1`
5. **Repository variables** (Settings > Secrets and variables > Actions > Variables):
   `PREPROD_API_URL=https://api-assurmatch.allianceconsultants.net`,
   `PREPROD_PUBLIC_URL=https://assurmatch.allianceconsultants.net`,
   `PREPROD_ADMIN_URL=https://backoffice-assurmatch.allianceconsultants.net`,
   `PREPROD_BROKER_URL=https://pro-assurmatch.allianceconsultants.net`, then `PREPROD_AUTO_DEPLOY=true`.
   Changing a URL needs a rebuild: the frontends compile them.
6. **Runner** (below), then **first Super Admin** (below).

## Runner

Check its state: Settings > Actions > Runners, or

```bash
gh api repos/bkourouma/AssurMatch/actions/runners \
  -q '.runners[] | "\(.name)\t\(.status)\t\([.labels[].name] | join(","))"'
```

| Output | Meaning | Fix |
| --- | --- | --- |
| an `assurmatch-preprod` row, `online` | ready | deploy |
| an `assurmatch-preprod` row, `offline` | registered, agent stopped | `cd ~/actions-runner-assurmatch && sudo ./svc.sh start` |
| no `assurmatch-preprod` row | not registered | register it, see below |

Registering (directory `/home/deployer/actions-runner-assurmatch`, same runner version as the other
runners of the host). The registration token is short-lived and belongs to a repository admin
(`gh api -X POST repos/bkourouma/AssurMatch/actions/runners/registration-token -q .token`): use it
directly on the host, never commit or paste it elsewhere.

```bash
./config.sh --url https://github.com/bkourouma/AssurMatch --token <REGISTRATION_TOKEN> \
  --name assurmatch-preprod --labels assurmatch-preprod --work _work --unattended
sudo ./svc.sh install deployer
sudo ./svc.sh start
```

- **The `assurmatch-preprod` label is mandatory**: the deploy job declares
  `runs-on: [self-hosted, assurmatch-preprod]`.
- Install it as a service, not `./run.sh`: a foreground runner does not survive a reboot.
- The repository is public and the runner has the server in hand: no job targeting it may ever run on
  `pull_request`. Keep fork pull requests behind approval (Settings > Actions > General > "Require
  approval for all external contributors").

## First Super Admin

Once, after the first deployment (`docs/runbooks/bootstrap-admin.md`):

```bash
cd /home/deployer/apps/assurmatch-preprod
docker compose run --rm --no-deps api node --import tsx scripts/ops/bootstrap-super-admin.ts \
  --email <e-mail> --display-name "<First Last>"
```

The command prints a one-time `https://backoffice-assurmatch.allianceconsultants.net/activate?token=...`
link (password, then MFA enrolment). Further accounts are created from the back-office; their
invitation e-mails land in Mailpit.

## Operations

```bash
cd /home/deployer/apps/assurmatch-preprod
docker compose ps
docker compose logs --tail 100 api worker
curl -fsS http://127.0.0.1:3600/readyz
```

Manual rollback to a known commit (images still on the host, or `docker login ghcr.io` first):

```bash
cd /home/deployer/apps/assurmatch-preprod
ASSURMATCH_IMAGE_TAG=sha-<good-commit> sh deploy.sh
```

Restore a dump (the dumps drop and recreate every object; data written since the dump is lost):

```bash
cd /home/deployer/apps/assurmatch-preprod
docker compose stop api worker
gunzip -c backups/postgres-<label>-<date>.sql.gz | docker exec -i assurmatch-preprod-postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose start api worker
```

External checks:

```bash
curl -fsS https://api-assurmatch.allianceconsultants.net/readyz
curl -fsSI https://assurmatch.allianceconsultants.net
curl -fsSI https://backoffice-assurmatch.allianceconsultants.net/login
curl -fsSI https://pro-assurmatch.allianceconsultants.net/login
```

The first preproduction attempt (May 2026, `docker run` of three containers) left
`/home/deployer/apps/assurmatch` (old env file and data) and the Docker network `assurmatch-preprod`
on the host. The compose stack does not use them.
