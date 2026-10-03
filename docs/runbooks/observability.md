# Runbook — Observabilité (journaux, suivi d'erreurs, métriques)

Spec 058 (FR-001 à FR-003). Surfaces : Backend API, worker. Aucune donnée personnelle ne quitte le
serveur sans masquage.

## Journaux JSON

L'API et le worker écrivent **une ligne JSON par événement** sur stdout (collectée par Docker,
`docker compose logs`, ou un agent Loki/Vector). Niveau : `LOG_LEVEL` (`debug|info|warn|error`,
défaut `info`).

| Événement | Contenu |
| --- | --- |
| `http.request` | `correlationId`, `method`, `route` (gabarit `/leads/:id`, jamais l'URL ni la query), `status`, `durationMs`. `/healthz` et `/readyz` en `debug`. |
| `http.error` | toute réponse ≥ 500 : `correlationId`, `route`, `status`, `errorName`, `message` masqué, `stack` masquée (**jamais** dans la réponse HTTP). |
| `process.unhandled_rejection`, `process.uncaught_exception` | erreurs hors requête (l'API redémarre après une exception non rattrapée). |
| `nest.log`, `nest.warn`, `nest.error` | messages du framework. |
| `worker.*` | cycles du worker (compteurs uniquement, spec 057). |

**Masquage** (`backend/src/modules/observability/structured-logger.ts`) : clés sensibles remplacées
(`password`, `secret`, `token`, `authorization`, `cookie`, `apiKey`, codes MFA/de secours, `email`,
`phone`, `ip`, `dsn`…), et dans toute chaîne : e-mail, téléphone E.164, UUID, `Bearer …`, JWT,
paramètres `token=`, `access_token=`, `code=`, `signature=`, `key=`.

### Retrouver une requête

La réponse porte `x-correlation-id` (et le corps d'erreur `correlationId`). Un identifiant entrant
conforme (`[A-Za-z0-9._:-]{1,128}`) est conservé, sinon remplacé.

```bash
docker compose -f docker-compose.production.yml logs api --since 2h | grep '"correlationId":"<id>"'
docker compose -f docker-compose.production.yml logs api --since 1h | grep '"event":"http.error"'
```

## Suivi d'erreurs (optionnel)

`SENTRY_DSN` (Sentry, GlitchTip, Bugsink — protocole « envelope ») active l'envoi des 5xx et des
plantages. `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` optionnels. Sans DSN : désactivé (ligne `api.started`
→ `errorReporting: disabled`).

Contenu envoyé : type, message masqué, frames (fichier, fonction, ligne), étiquettes `route`, `method`,
`status`, `correlationId`. Jamais : corps, en-têtes, cookies, query, IP, utilisateur, variables. Quota :
30 événements/min/processus ; délai 2 s ; un échec d'envoi est journalisé (`error_reporter.failed`)
sans le DSN. Pas de SDK (`@sentry/node` capture par défaut en-têtes et corps et ajoute ~60 paquets).

Côté outil : désactiver la collecte d'IP (« Prevent storing of IP addresses ») et activer le
nettoyage côté serveur (« Data scrubber ») en défense en profondeur.

## Métriques Prometheus

`GET /metrics` sur l'API, format texte 0.0.4.

- `METRICS_TOKEN` (≥ 16 caractères aléatoires, `openssl rand -hex 32`) : obligatoire, sinon 404.
- En-tête `Authorization: Bearer <METRICS_TOKEN>` ; 401 identique si absent ou faux.
- nginx renvoie 404 pour `/metrics` sur `api.<domain>` : scrape **interne** (`http://api:3600/metrics`).
- Exemple de configuration : `deploy/monitoring/prometheus-scrape.example.yml`.

| Série | Type | Sens |
| --- | --- | --- |
| `assurmatch_http_requests_total{method,route,status}` | counter | requêtes |
| `assurmatch_http_request_errors_total{method,route}` | counter | réponses 5xx |
| `assurmatch_http_request_duration_seconds{method,route}` | histogram | latence |
| `assurmatch_auth_rate_limited_total{route}` | counter | refus 429 d'authentification |
| `assurmatch_worker_last_cycle_timestamp_seconds` / `_age_seconds` | gauge | dernier cycle worker (état publié dans Redis `assurmatch:worker:status`) |
| `assurmatch_notifications_backlog` | gauge | notifications de devis dues au dernier cycle |
| `assurmatch_worker_task_failures_total{task}` | counter | envois signalés en échec (cumul) |
| `assurmatch_worker_task_errors_total{task}` | counter | tâches worker ayant levé une erreur (cumul) |
| `assurmatch_process_uptime_seconds`, `assurmatch_process_resident_memory_bytes` | gauge | processus API |

Les compteurs HTTP sont par processus et repartent de zéro au redémarrage (utiliser `rate()`/`increase()`).

Contrôle manuel :

```bash
curl -s -H "Authorization: Bearer $(cat /etc/prometheus/assurmatch-metrics-token)" http://127.0.0.1:3600/metrics | head
```

Alertes et moniteurs : `docs/runbooks/monitoring-alerts.md`.
