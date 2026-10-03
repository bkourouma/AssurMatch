# Runbook — Worker de livraison (spec 057, PRD I-01, décision D-7)

## Rôle

Un seul processus longue durée (`scripts/worker/assurmatch-worker.ts`, image API) qui, à chaque cycle :

1. recharge les drapeaux depuis la base ;
2. livre les notifications de devis dues (spec 044) — `ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT` ;
3. livre les enquêtes de satisfaction dues (spec 048) — `ASSURMATCH_SATISFACTION_SURVEY_DELIVERY_LIMIT` ;
4. livre les webhooks partenaires dus — **uniquement** si `ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=true`
   (et le drapeau `partner_webhooks_enabled` reste vérifié par le service).

Puis attend `ASSURMATCH_WORKER_INTERVAL_SECONDS` (défaut 30). Deux cycles ne se chevauchent jamais ;
une tâche en échec n'empêche pas les suivantes. Chaque service garde ses propres contrôles de drapeau,
de consentement et d'audit : le worker n'ajoute aucune règle métier.

Il n'y a plus de file BullMQ (D-7) : les anciennes files Redis `assurmatch.*` n'étaient jamais
consommées. Des clés `bull:assurmatch.*` résiduelles peuvent être supprimées sans risque :

```bash
docker compose -f docker-compose.production.yml exec redis sh -c \
  "redis-cli --scan --pattern 'bull:assurmatch.*' | xargs -r redis-cli del"
```

## Exploitation

| Action | Commande |
| --- | --- |
| état | `docker compose -f docker-compose.production.yml ps worker` (santé `healthy`) |
| journaux | `docker logs --tail 100 -f assurmatch-prod-worker` |
| redémarrer | `docker compose -f docker-compose.production.yml restart worker` |
| arrêter les envois | `docker compose -f docker-compose.production.yml stop worker` (les lignes restent `queued`) |
| un cycle à la main | `docker compose -f docker-compose.production.yml run --rm --no-deps api npm run quote-notifications:deliver-due` |

**Une seule réplique.** `container_name` interdit `--scale` ; ne pas lancer un second worker ni les
commandes `*:deliver-due` en parallèle d'un cycle en cours.

## Journaux

Une ligne JSON par événement, compteurs uniquement (jamais de destinataire, d'identifiant de
notification ni de contenu) :

```json
{"at":"…","level":"info","event":"worker.task.completed","task":"quote-notifications","ms":412,"counters":{"due":3,"processed":3,"sent":3,"retryable":0,"failed":0,"notConfigured":0}}
{"at":"…","level":"error","event":"worker.task.failed","task":"satisfaction-surveys","ms":5003,"error":"Error: connect ETIMEDOUT"}
```

Événements : `worker.started`, `worker.task.completed`, `worker.task.failed`,
`worker.cycle.completed`, `worker.cycle.prepare_failed` (rechargement des drapeaux impossible : cycle
sauté), `worker.stopping`, `worker.stopped`, `worker.shutdown_timeout`, `worker.crashed`.

À surveiller (alerting complet : spec 058) : `failed` > 0 répété, `notConfigured` > 0 (e-mail non
configuré), `retryable` qui croît, absence de `worker.cycle.completed`.

## Vivacité

Après chaque cycle, le worker écrit `ASSURMATCH_WORKER_HEARTBEAT_FILE` (défaut
`/tmp/assurmatch-worker.heartbeat`). Le healthcheck Docker (`scripts/worker/worker-healthcheck.mjs`)
échoue si ce fichier a plus de `ASSURMATCH_WORKER_HEARTBEAT_MAX_AGE_SECONDS` (défaut 3 × intervalle
+ 60 s). Un worker `unhealthy` est bloqué (base ou SMTP qui ne répond pas sans délai) : consulter les
journaux puis redémarrer.

## Arrêt

`SIGTERM` (compose `stop`, redéploiement) : fin du cycle en cours, fermeture Prisma/Redis, sortie 0.
Au-delà de `ASSURMATCH_WORKER_SHUTDOWN_TIMEOUT_SECONDS` (défaut 25, inférieur au `stop_grace_period`
de 40 s), sortie forcée en code 1 ; les lignes non traitées restent `queued` et repartent au
démarrage suivant.

## Local

Le lanceur local continue d'utiliser `scripts/local-app/notification-worker-loop.mjs` (refusé en
préproduction/production). `npm run worker:run` lance le worker de production contre la configuration
courante.

## Supervision (spec 058)

Après chaque cycle, le worker publie dans Redis (`assurmatch:worker:status`) l'heure du cycle, l'arriéré
de notifications et des compteurs cumulés d'échecs ; l'API les expose sur `/metrics`
(`assurmatch_worker_last_cycle_age_seconds`, `assurmatch_notifications_backlog`,
`assurmatch_worker_task_failures_total`, `assurmatch_worker_task_errors_total`). Optionnel :
`ASSURMATCH_WORKER_PUSH_URL` (moniteur Push Uptime Kuma, `status=down` si une tâche a échoué). Alertes :
`docs/runbooks/monitoring-alerts.md`.
