# Research: Observabilité, sauvegardes et durcissement sécurité (058)

**Spec**: `spec.md` — **Plan**: `plan.md`

## R1 — Journaux JSON structurés (FR-001)

- **Décision** : un journaliseur maison (`backend/src/modules/observability/structured-logger.ts`), une ligne
  JSON par événement sur stdout, niveaux `debug|info|warn|error` filtrés par `LOG_LEVEL` (défaut `info`).
  Tout champ passe par `maskLogValue` : clés sensibles (mot de passe, secret, jeton, autorisation, cookie,
  clé d'API, codes MFA/de secours) remplacées par `[masked]`, chaînes nettoyées par `maskText` (e-mail,
  téléphone E.164, UUID, `Bearer …`, JWT, paramètre de requête `token`/`access_token`/`code`/`signature`/`key`).
- **Route journalisée** : le gabarit Express (`/leads/:id`), jamais l'URL brute ; une route non résolue est
  journalisée `unmatched`. La query n'est donc jamais écrite, même masquée.
- **Erreurs** : le filtre global journalise toute réponse ≥ 500 (`http.error`) avec correlationId, classe,
  message masqué et pile masquée **côté serveur seulement** ; la réponse HTTP reste `toSafeErrorResponse`.
- **correlationId** : un middleware Express attribue un identifiant quand l'en-tête manque, le renvoie
  dans `x-correlation-id` et le filtre réutilise le même ; un identifiant entrant non conforme
  (> 128 caractères ou hors `[A-Za-z0-9._:-]`) est remplacé, pour qu'un client ne puisse pas injecter du
  texte dans les journaux.
- **Tests** : journalisation désactivée sous `NODE_ENV=test` sauf puits (`setLogSink`) installé par le test.
- **Rejeté** : pino/winston (nouvelle dépendance sans gain ; le besoin est une ligne JSON masquée).

## R2 — Suivi d'erreurs (FR-002)

- **Décision** : pas de `@sentry/node` (≈ 60 paquets transitifs, OpenTelemetry, instrumentation
  automatique qui capture en-têtes et corps par défaut). Un émetteur minimal
  (`error-reporter.ts`) poste une enveloppe Sentry (`/api/<projet>/envelope/`, en-tête `X-Sentry-Auth`)
  compatible Sentry, GlitchTip et Bugsink.
- **Contenu envoyé** : type d'erreur, message masqué, frames (fichier, fonction, ligne) sans variables,
  étiquettes `route` (gabarit), `method`, `status`, `correlationId`, `environment`, `release`. Jamais : corps,
  en-têtes, query, IP, utilisateur, cookies. Un `beforeSend` interne passe l'événement entier dans
  `maskLogValue` avant sérialisation.
- **Garde-fous** : désactivé si `SENTRY_DSN` absent ou invalide ; 30 envois/minute maximum ; délai 2 s ;
  échec silencieux (journalisé `error_reporter.failed` sans DSN) ; seulement les 5xx et les plantages.

## R3 — Métriques (FR-003)

- **Décision** : registre en mémoire du processus API (`http-metrics.ts`) rendu au format texte Prometheus
  0.0.4, sans `prom-client`. `GET /metrics` exige `Authorization: Bearer <METRICS_TOKEN>` (comparaison à
  temps constant) ; sans `METRICS_TOKEN` configuré l'endpoint répond 404 (désactivé). nginx refuse en plus
  `/metrics` depuis l'extérieur (`deny all` sauf réseau interne) : double barrière.
- **Séries** : `assurmatch_http_requests_total{method,route,status}`,
  `assurmatch_http_request_errors_total{method,route}` (5xx), histogramme
  `assurmatch_http_request_duration_seconds{method,route}`, `assurmatch_auth_rate_limited_total{route}`,
  `assurmatch_worker_last_cycle_timestamp_seconds`, `assurmatch_worker_last_cycle_age_seconds`,
  `assurmatch_notifications_backlog`, `assurmatch_worker_task_failures_total{task}`,
  `assurmatch_worker_task_errors_total{task}`, `assurmatch_process_uptime_seconds`,
  `assurmatch_process_resident_memory_bytes`.
- **Worker** : il tourne dans un autre conteneur ; il publie après chaque cycle un instantané dans Redis
  (`assurmatch:worker:status`, TTL 24 h) et incrémente des compteurs cumulés d'échecs. L'API lit Redis au
  moment du scrape. Le fichier battement de cœur (057) reste la sonde Docker.
- **Cardinalité** : les routes sont des gabarits ; les routes non résolues sont regroupées sous `unmatched`.

## R4 — Alertes (FR-004)

- **Décision** : règles Prometheus versionnées (`deploy/monitoring/prometheus-alerts.yml`) et guide
  Uptime Kuma (`docs/runbooks/monitoring-alerts.md`) : moniteurs HTTP `/healthz` et `/readyz`, pages des
  trois apps, moniteur *Push* alimenté par le worker (`ASSURMATCH_WORKER_PUSH_URL`, optionnel, URL jamais
  journalisée) pour « worker inactif > 10 min », moniteurs de certificat (expiration), mot-clé sur
  `/metrics` pour l'arriéré.

## R5 — Sauvegardes hors site (FR-005)

- **Décision** : `scripts/ops/backup-offsite.sh` (pg_dump format custom + archive des fichiers), chiffrement
  `age` (clé publique sur le serveur, clé privée hors serveur) ou `gpg --symmetric` en repli, envoi vers un
  stockage compatible S3 par `curl --aws-sigv4` (aucune CLI AWS à installer), somme SHA-256 jointe,
  rétention distante configurable (`BACKUP_RETENTION_DAYS`) par listage ListObjectsV2 + suppression.
  `scripts/ops/restore-offsite.sh` télécharge, vérifie la somme, déchiffre et restaure dans une base
  **vierge** (refus si la base cible contient des tables, refus si elle ressemble à la production sans
  `RESTORE_ALLOW_NON_EMPTY`) et affiche les durées par étape.
- **Rejeté** : rclone/aws-cli (dépendance hôte supplémentaire) ; chiffrement côté serveur S3 seul
  (le fournisseur détient alors la clé).
- **Test** : exécuté dans cet environnement contre PostgreSQL 16 local et un faux S3 local
  (`scripts/ops/testing/fake-s3.py`), durées consignées dans le runbook.

## R6 — Limitation de débit authentification (FR-006)

- **Décision** : `AuthRateLimiter` (Redis via `RedisClientPort`, mémoire en test) sur `POST /auth/login`,
  `POST /auth/password-reset` et `POST /auth/mfa/verify` :
  - seau **IP** : toutes les tentatives, défaut 100 / 15 min ;
  - seau **identifiant** (e-mail normalisé, jeton de réinitialisation, utilisateur MFA) : échecs seulement,
    défaut 10 / 15 min, remis à zéro après un succès.
  Clés hachées (SHA-256) : ni e-mail ni IP en clair dans Redis.
- **429 neutre** : même corps (`RATE_LIMITED`, « Too many attempts. Please try again later. ») que le
  compte existe ou non, vérifié **avant** toute recherche d'utilisateur.
- **Limite connue** : les back-offices appellent l'API de serveur à serveur ; l'IP vue par l'API pour la
  connexion back-office est celle du serveur Next. Le seau IP de l'API est donc un garde-fou large et la
  limite par IP cliente réelle est appliquée par nginx (`limit_req` sur les POST de `/login`, `/mfa`,
  `/password-reset` des apps et sur `/auth/` de l'API). Le seau identifiant reste la défense principale
  contre la force brute. Le verrouillage de compte existant (seuil d'échecs) est conservé.

## R7 — En-têtes de sécurité (FR-007)

- **Décision** : un module partagé `packages/shared/security/security-headers.ts` construit la liste des
  en-têtes ; chaque `next.config.ts` (public existant ; admin et courtier créés) l'utilise.
- **CSP** : `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` en dev pour le
  rafraîchissement), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`, `connect-src 'self'` + origines API `NEXT_PUBLIC_*` (+ `ws:` en dev),
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`,
  `upgrade-insecure-requests` en production. Les nonces imposeraient le rendu dynamique de toutes les
  pages (Next App Router) : `'unsafe-inline'` sur les scripts est l'arbitrage retenu, compensé par
  `default-src`/`connect-src` stricts, `object-src 'none'` et l'absence de script tiers.
- **Autres** : HSTS (`max-age=31536000; includeSubDomains`) uniquement si `NODE_ENV=production`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive.
- **Pages visiteur à jeton** : les règles `no-referrer` + `X-Robots-Tag` de l'app publique sont
  conservées et déclarées **après** la règle générale ; Next applique la dernière valeur pour une même clé,
  donc `no-referrer` l'emporte sur ces chemins.
- **nginx** : `deploy/nginx/security-headers.conf` (inclus par vhost) et
  `assurmatch-production.conf.example` mis à jour : en-têtes identiques, `server_tokens off`,
  `proxy_hide_header` pour éviter les doublons, `limit_req`, `/metrics` interne.

## R8 — Dépendances et secrets (FR-008)

- `.github/dependabot.yml` : npm (racine), github-actions, docker (quatre Dockerfiles), hebdomadaire,
  regroupement des mises à jour mineures/correctifs.
- `scripts/ci/secret-scan.mjs` étendu (motifs façon gitleaks) : clés privées (toutes familles), clés AWS
  `AKIA…`, jetons GitHub `ghp_`/`github_pat_`, clés Slack `xox?-`, clés Stripe `sk_live_`, clés Anthropic
  `sk-ant-`, clés Google `AIza…`, JWT, URL avec identifiants (`scheme://user:pass@`) hors valeurs
  factices connues (`x:x`, `postgres:postgres`, `REDACTED`, `placeholder`, `${…}`…), affectations
  `*_SECRET|*_PASSWORD|*_TOKEN|*_API_KEY=` non vides et non factices dans les fichiers d'env. Exemption
  par commentaire `secret-scan:allow` sur la ligne. Logique testée (`backend/tests/unit/ci/secret-scan.spec.ts`).
- `npm audit --audit-level=high` conservé dans `verify`.

## R9 — Test d'intrusion (FR-009)

`docs/security/pentest-checklist.md` : contrôles OWASP ASVS 4.0.3 niveau 2 (V1–V14) adaptés à AssurMatch,
avec preuve attendue et état (fait / à vérifier).
