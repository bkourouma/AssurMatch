# Runbook — Alertes et supervision (Prometheus, Uptime Kuma)

Spec 058 FR-004. Deux options complémentaires : **Uptime Kuma** (simple, un seul conteneur, suffisant
au lancement) et **Prometheus + Alertmanager** (règles versionnées dans
`deploy/monitoring/prometheus-alerts.yml`, validées par `promtool check rules`).

## Alertes attendues

| Alerte | Seuil de départ | Prometheus | Uptime Kuma |
| --- | --- | --- | --- |
| API indisponible | 2 min | `AssurMatchApiDown` | HTTP `https://api.<domain>/readyz` |
| Site / back-offices indisponibles | 3 min | `AssurMatchEndpointDown` (blackbox) | HTTP sur `/`, `admin./login`, `pro./login` |
| 5xx | > 2 % et ≥ 5 erreurs en 5 min ; ≥ 10 en 15 min sur une route | `AssurMatchHigh5xxRate`, `AssurMatch5xxOnRoute` | — (Prometheus ou journaux) |
| Worker inactif | > 10 min sans cycle | `AssurMatchWorkerIdle`, `AssurMatchWorkerNeverSeen` | moniteur **Push** (heartbeat 600 s) |
| Arriéré de notifications | > 50 pendant 15 min | `AssurMatchNotificationBacklog` | — (Prometheus) |
| Échecs d'e-mail | > 5 en 1 h | `AssurMatchEmailFailures` | Push en `down` si une tâche échoue |
| Force brute | > 20 refus 429 en 15 min | `AssurMatchAuthBruteForce` | — |
| Certificats | < 14 jours | `AssurMatchCertificateExpiresSoon` | option « Certificate Expiry Notification » (14 j) |
| Sauvegarde nocturne absente | > 26 h | — | moniteur **Push** `BACKUP_PUSH_URL` (heartbeat 93 600 s) |

Ajuster les seuils après deux semaines de trafic réel ; consigner chaque changement ici.

## Uptime Kuma — configuration

Installer sur un hôte **distinct** de la production (sinon une panne de l'hôte coupe aussi l'alerte) :

```bash
docker run -d --restart=unless-stopped -p 127.0.0.1:3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:1
```

Moniteurs (intervalle 60 s, 2 essais avant alerte, notification e-mail/Slack/WhatsApp configurée) :

| Nom | Type | Cible | Détail |
| --- | --- | --- | --- |
| API readiness | HTTP(s) | `https://api.<domain>/readyz` | code 200 ; cocher « Certificate Expiry Notification » |
| API liveness | HTTP(s) - Keyword | `https://api.<domain>/healthz` | mot-clé `"ok"` |
| Site public | HTTP(s) | `https://<domain>/` | certificat surveillé |
| Back-office | HTTP(s) | `https://admin.<domain>/login` | certificat surveillé |
| Espace courtier | HTTP(s) | `https://pro.<domain>/login` | certificat surveillé |
| Worker | Push | URL générée → `ASSURMATCH_WORKER_PUSH_URL` (env worker) | « Heartbeat Interval » 600 s : alerte si aucun push depuis 10 min ; le worker pousse `status=down` quand une tâche échoue |
| Sauvegarde | Push | URL générée → `BACKUP_PUSH_URL` (env sauvegarde) | « Heartbeat Interval » 93 600 s (26 h) |
| Métriques joignables | HTTP(s) - Keyword (Kuma sur le réseau interne seulement) | `http://api:3600/metrics`, en-tête `Authorization: Bearer <METRICS_TOKEN>` | mot-clé `assurmatch_worker_last_cycle_age_seconds` ; le seuil d'arriéré (> N) demande Prometheus, Kuma ne compare pas de valeur |

Les URL de push contiennent un jeton : elles vivent dans les fichiers d'environnement du serveur
(jamais dans le dépôt) et ne sont jamais journalisées.

## Réagir à une alerte

- **5xx** : `docs/runbooks/observability.md` → retrouver `http.error` par `correlationId`, la route et la
  pile masquée ; corréler avec un déploiement (`docs/runbooks/rollback.md`).
- **Worker inactif** : `docs/runbooks/worker.md` (`docker compose ps worker`, journaux `worker.*`).
- **Arriéré / échecs d'e-mail** : `docs/runbooks/quote-notification-delivery.md`, état SMTP.
- **Force brute** : vérifier les journaux nginx (429) et `assurmatch_auth_rate_limited_total` par route ;
  si une IP persiste, la bloquer dans nginx (`deny <ip>;`) et consigner l'incident. Le verrouillage de
  compte (`AUTH_LOCKOUT_THRESHOLD`) reste actif ; déverrouillage : `docs/runbooks/user-lock-unlock.md`.
- **Certificat** : `sudo certbot renew --dry-run`, puis `sudo certbot renew && sudo systemctl reload nginx`.
- **Sauvegarde absente** : `docs/runbooks/backup-restore.md` (lancer à la main, lire le journal).
