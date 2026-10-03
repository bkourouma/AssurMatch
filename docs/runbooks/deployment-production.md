# Runbook — Déploiement en production (spec 057)

La préproduction garde son propre runbook (`deployment.md`) et son job CI inchangé. Ce document
couvre la **production**, qui n'existe qu'à partir de la spec 057.

## Topologie

```
Internet ── nginx (TLS, 4 vhosts) ──┬── 127.0.0.1:3601  public   (assurmatch-public:production-sha-*)
                                    ├── 127.0.0.1:3602  admin    (assurmatch-backoffice:production-sha-*)
                                    ├── 127.0.0.1:3603  broker   (assurmatch-broker:production-sha-*)
                                    └── 127.0.0.1:3600  api      (assurmatch:sha-*)
                      worker (assurmatch:sha-*, pas de port, 1 réplique) ── PostgreSQL, Redis, SMTP
                      redis, clamav (réseau compose interne)
                      PostgreSQL : managé/externe (défaut) ou profil compose `bundled-db`
```

Fichier : `docker-compose.production.yml` (projet compose `assurmatch-production`).
Domaine : **non décidé (D-10)**. Rien n'est codé en dur ; voir « Paramètres de domaine ».

## Pré-requis uniques (opérations manuelles)

1. **Domaine et DNS** : 4 enregistrements vers l'hôte : `<domain>`, `admin.<domain>`, `pro.<domain>`,
   `api.<domain>` (noms indicatifs, PRD K-01).
2. **TLS** : certbot sur l'hôte (`certbot certonly --webroot -w /var/www/certbot -d ...` pour les 4
   noms), renouvellement par timer systemd + `reload nginx`.
3. **nginx** : `deploy/nginx/assurmatch-production.conf.example` → remplacer `<domain>`, installer,
   copier `deploy/nginx/security-headers.conf` en `/etc/nginx/snippets/assurmatch-security-headers.conf`
   (spec 058, `docs/security/security-headers.md`), `nginx -t && systemctl reload nginx`. Variante
   conteneur : profil compose `edge` (le fichier d'en-têtes y est monté).
   Spec 058 : supervision (`docs/runbooks/observability.md`, `docs/runbooks/monitoring-alerts.md`) et
   sauvegarde hors site (`docs/runbooks/backup-restore.md`) à mettre en place avant l'ouverture.
4. **Hôte** : utilisateur `deployer` (groupe `docker`), répertoire `/home/deployer/apps/assurmatch`,
   sous-répertoire `env/` en `0700`.
5. **Fichiers d'environnement** (mode `0600`, propriétaire `deployer`) dans `/home/deployer/apps/assurmatch/env/` :
   `api.env`, `worker.env`, `public.env`, `admin.env`, `broker.env` à partir des
   `.env.production.*.example` (et `postgres.env` avec `bundled-db` : `POSTGRES_DB`, `POSTGRES_USER`,
   `POSTGRES_PASSWORD`). Les frontaux ne reçoivent **aucun** secret.
6. **Runner GitHub** dédié sur l'hôte de production, label **`assurmatch-production`**, installé en
   service (`./config.sh --labels assurmatch-production ...`, `sudo ./svc.sh install && sudo ./svc.sh start`).
   Jamais le runner de préproduction.
7. **GitHub Environment `production`** (Settings > Environments) avec *Required reviewers* (au moins
   une personne autre que celle qui déclenche) et, idéalement, restriction à la branche `main`.
8. **Variables de dépôt** (Settings > Secrets and variables > Actions > Variables) :
   `PROD_API_URL`, `PROD_PUBLIC_URL`, `PROD_BROKER_URL` (https, sans `/` final) ;
   optionnel `PROD_COMPOSE_PROFILES` (`bundled-db`, `edge`, séparés par des virgules).
9. **Stockage S3 + ClamAV** (PRD K-07) : bucket privé, clé d'accès limitée au bucket, versionnement
   recommandé ; ClamAV est fourni par le compose (premier démarrage : plusieurs minutes de
   téléchargement des signatures). Tant que `ASSURMATCH_DOCUMENT_STORAGE=s3` et
   `ASSURMATCH_ANTIVIRUS=clamav` ne sont pas en place, **aucune** fonctionnalité de téléversement ne
   doit être activée.
10. **E-mail** (PRD K-08) : fournisseur transactionnel professionnel, domaine expéditeur avec SPF,
    DKIM et DMARC alignés ; `EMAIL_PREVIEW_MODE=true` jusqu'à validation par un opérateur, puis
    `false` (voir `email-mode-toggle.md`). `mailpit` est refusé en production.
11. **Premier Super Admin** après le premier déploiement : `bootstrap-admin.md`.

## Déployer

1. Vérifier que `verify` est vert sur le commit à déployer.
2. Actions > CI > *Run workflow*, sélectionner `main`, cocher **`deploy_production`**.
3. `build-images` publie `assurmatch:sha-<commit>` (API + worker) ; `build-production-frontends`
   construit les trois frontaux avec les URL de production (`production-sha-<commit>`).
4. `deploy-production` attend l'**approbation** de l'environnement `production`.
5. Une fois approuvé, sur le runner de production, `scripts/production/deploy.sh` :
   1. `scripts/production/pre-deploy-check.sh` (fichiers, permissions, variables obligatoires,
      placeholders, interdits : mailpit, adaptateurs mémoire, `LOCAL_BOOTSTRAP_ADMIN_*`, secrets dans
      les frontaux) ;
   2. `docker compose pull` des cinq services applicatifs ;
   3. `prisma migrate deploy` puis `prisma migrate status` avec la **nouvelle** image API, avant tout
      remplacement de conteneur — un échec arrête le déploiement, les conteneurs en service ne
      bougent pas ;
   4. `docker compose up -d` (api, worker, public, admin, broker, redis, clamav) ;
   5. contrôles : `GET /readyz` (API), `/` (public), `/login` (admin, courtier), worker `running` sans
      redémarrage ;
   6. succès : enregistre les tags dans `/home/deployer/apps/assurmatch/deployed.env` ; échec :
      relance les tags précédents (conteneurs uniquement) et termine en erreur.

Déploiement manuel équivalent sur l'hôte :

```bash
cd /home/deployer/apps/assurmatch/repo   # checkout du commit
ASSURMATCH_IMAGE_TAG=sha-<commit> ASSURMATCH_FRONTEND_TAG=production-sha-<commit> \
  sh scripts/production/deploy.sh
```

## Migrations et retour arrière

Les migrations sont appliquées **avant** la bascule et ne sont **jamais** annulées automatiquement.
Toute migration livrée en production doit donc être compatible avec l'image précédente
(ajouts de colonnes nullable/avec défaut, nouvelles tables ; suppression ou renommage en deux
livraisons). En cas d'échec après migration : les anciens conteneurs sont relancés sur le schéma
migré ; si ce n'est pas compatible, restaurer la sauvegarde (`backup-restore.md`) après arrêt de
l'API et du worker. Prendre une sauvegarde avant toute migration destructive.

Retour arrière manuel vers un commit connu :

```bash
ASSURMATCH_IMAGE_TAG=sha-<bon-commit> ASSURMATCH_FRONTEND_TAG=production-sha-<bon-commit> \
  docker compose -f docker-compose.production.yml up -d api worker public admin broker
```

## Vérifications externes

```bash
curl -fsS https://api.<domain>/healthz     # {"status":"ok"}
curl -fsS https://api.<domain>/readyz      # {"status":"ready","checks":{"database":"ok","redis":"ok"}}
curl -fsSI https://<domain>/
curl -fsSI https://admin.<domain>/login
curl -fsSI https://pro.<domain>/login
docker compose -f docker-compose.production.yml ps
docker logs --tail 50 assurmatch-prod-worker
```

## Paramètres de domaine (D-10)

| Où | Quoi |
| --- | --- |
| Variables GitHub `PROD_API_URL`, `PROD_PUBLIC_URL`, `PROD_BROKER_URL` | compilées dans les frontaux (rebuild nécessaire si elles changent) |
| `api.env` / `worker.env` | `CORS_ORIGINS`, `APP_BASE_URL`, `PUBLIC_APP_URL`, `BROKER_APP_URL`, `EMAIL_FROM` |
| nginx | `server_name`, chemins des certificats |

Les serveurs Next appellent l'API par son URL publique : l'hôte doit pouvoir résoudre et joindre
`api.<domain>` depuis les conteneurs. Si l'hébergeur ne gère pas le « hairpin NAT », ajouter
`extra_hosts: ["api.<domain>:host-gateway"]` aux services `public`, `admin`, `broker` (nginx doit
alors écouter sur l'interface de la passerelle Docker).

## Hors périmètre 057

Observabilité complète, alertes, en-têtes de sécurité versionnés par app, sauvegardes hors site :
spec 058.
