# Implementation Plan: Observabilité, sauvegardes et durcissement sécurité (058)

**Spec**: `specs/058-observability-security-hardening/spec.md` — **Research**: `research.md` — **Tasks**: `tasks.md`

## Résumé technique

Journaux JSON masqués pour chaque requête et chaque 5xx, suivi d'erreurs optionnel sans SDK, endpoint
Prometheus protégé, état du worker publié dans Redis, règles d'alerte et moniteurs Uptime Kuma documentés,
sauvegardes chiffrées hors site avec restauration chronométrée, limitation de débit Redis sur
l'authentification, en-têtes de sécurité dans les trois apps Next et dans nginx, Dependabot, scan de
secrets étendu et liste de contrôle ASVS niveau 2.

## Surfaces impactées

- **Backend API** : observabilité (journaux, métriques, rapport d'erreurs), limitation de débit des routes
  `auth/login`, `auth/password-reset`, `auth/mfa/verify`, endpoint `/metrics`.
- **Runtime / Docker / CI** : worker (instantané Redis, push Uptime Kuma optionnel), nginx versionné,
  Dependabot, scan de secrets, exemples d'environnement.
- **Web Publique Client, Back-office Plateforme, Broker Back-office** : `next.config.ts` uniquement
  (en-têtes HTTP). Aucune page, aucun texte, aucun parcours modifié. Les apps restent séparées.
- **Packages partagés** : `packages/shared/security/security-headers.ts`.
- **Opérations** : scripts de sauvegarde/restauration hors site, runbooks, docs sécurité.
- Aucune migration Prisma.

## Constitution Check

| Principe | Vérification |
| --- | --- |
| I, II, VII, VIII | Aucun parcours, consentement, routage ni texte public modifié. |
| III | Aucun drapeau activé. Suivi d'erreurs, métriques et push désactivés sans variable. Apps séparées. |
| IV | PII et jetons masqués dans journaux et rapports ; 429 neutre ; clés Redis hachées ; `/metrics` protégé par jeton et nginx ; HSTS/CSP/XFO/nosniff ; aucun secret dans le dépôt (scan étendu). |
| VI | Sauvegardes chiffrées hors site, restauration testée sur base vierge et chronométrée ; aucune suppression de données applicatives. |
| IX | Tests : masquage, journaux 5xx sans PII, métriques (auth, format), limitation (N échecs → 429, neutralité), en-têtes (unitaires + Playwright), scan de secrets, état worker. |
| X | Journaux structurés ; erreurs standardisées inchangées ; logique hors contrôleurs. |
| XI | Aucune activation de production ; déploiement inchangé. |

Aucun conflit constitutionnel.

## Conception

### Backend (`backend/src/modules/observability/`)

- `structured-logger.ts` : `logEvent(level, event, fields)`, `maskLogValue`, `setLogSink` (tests), `LOG_LEVEL`.
- `request-logging.middleware.ts` : middleware Express (correlationId, durée, gabarit de route, statut) →
  journal `http.request` + métriques. Installé par `configureHttpApp(app)` (`backend/src/http-app.ts`),
  appelé par `main.ts` et par le harnais de tests HTTP.
- `http-metrics.ts` : registre (compteurs, histogramme), rendu Prometheus, jauges du worker.
- `error-reporter.ts` : enveloppe Sentry minimale, masquage, quota, délai.
- `metrics.controller.ts` : `GET /metrics` (jeton Bearer `METRICS_TOKEN`, 404 si non configuré).
- `ErrorResponseFilter` : journalise et rapporte les ≥ 500 (pile côté serveur uniquement).
- `common/logging/pii-masker.ts` : `maskText` masque aussi `Bearer`, JWT et paramètres `token=`.

### Auth

- `auth/auth-rate-limiter.ts` : seaux IP (tentatives) et identifiant (échecs), clés hachées, 429 neutre,
  compteur `assurmatch_auth_rate_limited_total`. Câblé dans `AuthController` (login, passwordReset, verifyMfa).
- Variables : `ASSURMATCH_AUTH_RATE_LIMIT_WINDOW_SECONDS` (900), `ASSURMATCH_AUTH_RATE_LIMIT_IP_MAX` (100),
  `ASSURMATCH_AUTH_RATE_LIMIT_IDENTIFIER_MAX` (10).

### Worker

- `runtime/worker/worker-status.ts` : écriture/lecture de l'instantané Redis et des compteurs cumulés.
- `DeliveryWorkerLoop` : option `afterCycle(outcomes)`.
- `scripts/worker/assurmatch-worker.ts` : publie l'instantané ; push Uptime Kuma optionnel.

### Apps Next

- `packages/shared/security/security-headers.ts` : `securityHeaders({ apiOrigins, production, development })`.
- `apps/public/next.config.ts` : règle générale `/:path*` puis règles visiteur (`no-referrer`) inchangées.
- `apps/admin/next.config.ts`, `apps/broker/next.config.ts` (nouveaux) : `poweredByHeader: false` + en-têtes.

### Déploiement, CI, docs

- `deploy/nginx/security-headers.conf`, `deploy/nginx/assurmatch-production.conf.example` mis à jour.
- `deploy/monitoring/prometheus-alerts.yml`, `deploy/monitoring/prometheus-scrape.example.yml`.
- `scripts/ops/backup-offsite.sh`, `scripts/ops/restore-offsite.sh`, `scripts/ops/testing/fake-s3.py`.
- `.github/dependabot.yml`, `scripts/ci/secret-scan.mjs` (+ `scripts/ci/secret-patterns.mjs`).
- Docs : `docs/runbooks/observability.md`, `monitoring-alerts.md`, `backup-restore.md` (réécrit),
  `docs/security/security-headers.md`, `docs/security/pentest-checklist.md`.

## Validation

`npm run typecheck`, `npm run lint`, `npx vitest run`, Playwright des apps (configuration temporaire),
`next build` des trois apps, `node scripts/ci/secret-scan.mjs`, test réel sauvegarde → restauration
(PostgreSQL 16 local + faux S3).

## Risques

- `'unsafe-inline'` dans `script-src` (arbitrage Next sans nonce) : documenté, à revoir si un nonce
  devient acceptable.
- Métriques HTTP par processus : remises à zéro au redémarrage (normal pour Prometheus, `rate()`).
- Seau IP de l'API peu discriminant pour les back-offices (appel serveur à serveur) : compensé par nginx.
- Sauvegarde S3 testée contre un faux S3 local seulement : un premier essai réel sur le fournisseur choisi
  reste à faire (procédure dans le runbook).
