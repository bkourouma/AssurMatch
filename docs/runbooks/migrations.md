# Runbook — Prisma migrations

`backend/prisma/migrations` contient **20 migrations** au 2026-10-03 (`ls backend/prisma/migrations`
fait foi). Chaque spec qui modifie le schéma livre sa propre migration.

## Production (spec 057, PRD K-04)

Automatique : le job `deploy-production` (`scripts/production/deploy.sh`) exécute, avec la nouvelle
image API et **avant** de remplacer un conteneur :

```bash
docker compose -f docker-compose.production.yml run --rm --no-deps -T api \
  npx prisma migrate deploy --schema backend/prisma/schema.prisma
docker compose -f docker-compose.production.yml run --rm --no-deps -T api \
  npx prisma migrate status --schema backend/prisma/schema.prisma
```

Un échec arrête le déploiement ; les conteneurs en service ne sont pas touchés. Les migrations ne
sont jamais annulées automatiquement : elles doivent rester compatibles avec l'image précédente
(voir `deployment-production.md`, « Migrations et retour arrière »). Sauvegarde préalable
obligatoire pour toute migration destructive (`backup-restore.md`).

## Préproduction

```bash
ssh deployer@<vps>
docker exec assurmatch-app npx prisma migrate deploy --schema /app/backend/prisma/schema.prisma
docker exec assurmatch-app npx prisma migrate status --schema /app/backend/prisma/schema.prisma
```

## Statut

Si `migrate status` n'est pas propre, ne pas servir de trafic. Analyser la divergence ; si
nécessaire, revenir au déploiement précédent et créer une migration corrective dans une nouvelle spec.
