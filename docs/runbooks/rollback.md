# Runbook — Rollback

## When

Health check fails after a deploy, or a regression is discovered post-merge.

## Steps

```bash
ssh deployer@<vps>
cd /home/deployer/apps/assurmatch
PREV_SHA=<previous-good-sha>

for IMG in assurmatch assurmatch-public assurmatch-backoffice; do
  docker pull ghcr.io/bkourouma/${IMG}:sha-${PREV_SHA}
done

docker stop assurmatch-app assurmatch-public assurmatch-backoffice || true
docker rm   assurmatch-app assurmatch-public assurmatch-backoffice || true

docker run -d --name assurmatch-app --restart unless-stopped \
  --env-file .env.production -p 127.0.0.1:3600:3600 \
  -v $(pwd)/uploads:/app/uploads -v $(pwd)/data:/app/data \
  ghcr.io/bkourouma/assurmatch:sha-${PREV_SHA}

docker run -d --name assurmatch-public --restart unless-stopped \
  --env-file .env.production -p 127.0.0.1:3601:3601 \
  ghcr.io/bkourouma/assurmatch-public:sha-${PREV_SHA}

docker run -d --name assurmatch-backoffice --restart unless-stopped \
  --env-file .env.production -p 127.0.0.1:3602:3602 \
  ghcr.io/bkourouma/assurmatch-backoffice:sha-${PREV_SHA}

curl -fsS http://127.0.0.1:3600/admin/system/health
docker image prune -f
```

Document the rollback in the operations journal with the SHA returned to and the reason.
