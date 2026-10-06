# Runbook — Santé (spec 057, PRD K-10)

| Endpoint | Accès | Contrôle | Réponse |
| --- | --- | --- | --- |
| `GET /healthz` | public | le processus API répond | `200 {"status":"ok"}` |
| `GET /readyz` | public | base (`SELECT 1`) et Redis (`PING`), 2 s max chacun | `200 {"status":"ready","checks":{"database":"ok","redis":"ok"}}` ou `503 {"status":"not_ready","checks":{...:"down"}}` |
| `GET /admin/system/health` | Super Admin / rôles santé, MFA | base, Redis, file, etc. | détail interne |

Les corps publics sont fixes : ni version, ni hôte, ni message d'erreur, ni durée.

## Usages

- **Docker** : l'image API vérifie `/healthz` (un incident base ne fait pas redémarrer l'API en
  boucle) ; le compose production vérifie `/readyz` pour ordonner le démarrage du worker.
- **Déploiement** : `scripts/production/deploy.sh` exige `/readyz` = 200.
- **Surveillance externe** (spec 058) : sonder `https://api.<domain>/readyz` toutes les minutes ;
  alerte après 3 échecs.
- **Frontaux** : `/` (public) et `/login` (admin, courtier).
- **Worker** : fichier de battement, voir `worker.md`.

## Diagnostic d'un 503

```bash
curl -s https://api.<domain>/readyz
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml exec redis redis-cli ping
docker compose -f docker-compose.production.yml run --rm --no-deps api \
  npx prisma migrate status --schema backend/prisma/schema.prisma   # joint aussi la base
docker logs --tail 100 assurmatch-prod-api
```

`database: down` : base arrêtée, saturée ou `DATABASE_URL` invalide. `redis: down` : conteneur Redis
arrêté ou mémoire saturée. Le détail authentifié reste disponible sur `/admin/system/health`.
