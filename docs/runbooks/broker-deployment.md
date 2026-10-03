# Runbook — Déploiement de l'app courtier (spec 057, PRD K-02)

Le Broker Back-office est une application authentifiée **distincte** : image propre, conteneur
propre, domaine propre (`pro.<domain>` à titre indicatif). Il n'est jamais servi par l'image admin
ni fusionné avec l'app publique (constitution III).

| Élément | Valeur |
| --- | --- |
| Dockerfile | `apps/broker/Dockerfile` (Next.js, utilisateur non root) |
| Image | `ghcr.io/bkourouma/assurmatch-broker:sha-<commit>` (générique) et `:production-sha-<commit>` (URL de production compilées) |
| Port | 3603 (`127.0.0.1` sur l'hôte) |
| Santé | `GET /login` (healthcheck de l'image et du déploiement) |
| Variables | `.env.production.broker.example` : `NODE_ENV`, `APP_ENV`, `NEXT_PUBLIC_ASSURMATCH_API_URL`, `NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL` — aucun secret, pas de `DATABASE_URL` |
| Service compose | `broker` (`docker-compose.production.yml`), `assurmatch-broker` (`docker-compose.preproduction.yml`) |
| vhost | bloc `pro.<domain>` de `deploy/nginx/assurmatch-production.conf.example` (`X-Frame-Options DENY`, `noindex`) |

## Construire à la main

```bash
docker build -f apps/broker/Dockerfile \
  --build-arg NEXT_PUBLIC_ASSURMATCH_API_URL=https://api.<domain> \
  --build-arg NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL=https://api.<domain> \
  --build-arg REQUIRE_NEXT_PUBLIC=NEXT_PUBLIC_ASSURMATCH_API_URL \
  -t assurmatch-broker:production .
```

Les `NEXT_PUBLIC_*` sont figés au build : changer l'URL de l'API impose une reconstruction.

## Liens entrants

- Le site public pointe vers le portail via `NEXT_PUBLIC_ASSURMATCH_BROKER_URL` (build de l'image publique, variable `PROD_BROKER_URL`).
- Les e-mails envoyés aux courtiers utilisent `BROKER_APP_URL` (`api.env`, `worker.env`).

## Vérifier

```bash
curl -fsSI https://pro.<domain>/login
docker compose -f docker-compose.production.yml ps broker
```

## Préproduction

Le job CI de préproduction (inchangé par la spec 057) ne déploie pas encore le courtier ; l'image
générique est publiée par `build-images`. Pour l'ajouter, suivre le même schéma que
`assurmatch-backoffice` (port 3603, vhost dédié) une fois le runner `assurmatch-preprod` rétabli (K-03).
