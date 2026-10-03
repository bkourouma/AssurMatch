# Tasks: Observabilité, sauvegardes et durcissement sécurité (058)

**Spec**: `spec.md` — **Plan**: `plan.md` — **Research**: `research.md`
**Statut**: Terminé le 2026-10-03 — typecheck, lint (0 erreur), `npx vitest run` (312 fichiers, 1036 tests),
Playwright des trois apps (248 réussis, 14 ignorés faute de serveur, plus contrôle en direct des en-têtes
contre `next start` : 7/7), `next build` des trois apps, `secret-scan`, `nginx -t` (nginx 1.27) et
`promtool check rules`/`check metrics`, exercice réel sauvegarde → restauration (age et gpg).
**Surfaces impactées**: Backend API ; Runtime / Docker / CI ; `next.config.ts` des trois apps (aucune page) ;
package partagé `packages/shared/security` ; docs/runbooks. Aucune migration.

## Phase 1 — Journaux et erreurs (US1, FR-001, FR-002)

- [x] T001 `maskText` : `Bearer`, JWT, paramètres `token=`/`access_token=`/`code=`/`signature=`/`key=`.
- [x] T002 Journaliseur JSON masqué (`backend/src/modules/observability/structured-logger.ts`), `LOG_LEVEL`, puits de test.
- [x] T003 Middleware requêtes (`request-logging.middleware.ts`) : correlationId (validé, renvoyé), gabarit de route, durée ; installé dans `main.ts` et le harnais HTTP.
- [x] T004 `ErrorResponseFilter` : journal `http.error` (pile masquée côté serveur) + rapport ; corps inchangé.
- [x] T005 Rapport d'erreurs par enveloppe Sentry sans SDK (`error-reporter.ts`), quota, délai, masquage ; erreurs de processus ; logger Nest JSON.
  **Validation**: `backend/tests/unit/observability/observability-masking.spec.ts`, `backend/tests/integration/observability/observability-runtime-http.spec.ts` (5xx journalisée avec correlationId, sans PII, rapport masqué ; 4xx non rapportées).

## Phase 2 — Métriques et alertes (US1, FR-003, FR-004)

- [x] T006 Registre Prometheus (`http-metrics.ts`) et `GET /metrics` (jeton `METRICS_TOKEN`, 404 si absent, 401 neutre).
- [x] T007 État du worker dans Redis (`backend/src/runtime/worker/worker-status.ts`, option `afterCycle`), push Uptime Kuma optionnel.
- [x] T008 Règles `deploy/monitoring/prometheus-alerts.yml`, exemple de scrape, runbooks `observability.md` et `monitoring-alerts.md` (Uptime Kuma).
  **Validation**: tests métriques (auth, format, gabarits, worker) ; `promtool check rules` (12 règles) et `promtool check metrics`.

## Phase 3 — Sauvegardes (US2, FR-005)

- [x] T009 `scripts/ops/backup-offsite.sh` (+ `backup-lib.sh`) : pg_dump custom, archive des fichiers, age/gpg, S3 SigV4 par curl, manifeste SHA-256, rétention distante, push.
- [x] T010 `scripts/ops/restore-offsite.sh` : liste, vérification SHA-256, déchiffrement, base vierge obligatoire, comptages, durées.
- [x] T011 Exercice chronométré (PostgreSQL 16, 200 000 lignes d'audit, faux S3 `scripts/ops/testing/fake-s3.py`) consigné dans `docs/runbooks/backup-restore.md`.
  **Validation**: `backend/tests/guardrails/offsite-backup-scripts.spec.ts` ; exercice : sauvegarde 2 s, restauration 5 s, comptages et fichiers identiques, refus (base non vide, base live, fichier altéré, sans chiffrement).

## Phase 4 — Authentification (US3, FR-006)

- [x] T012 `AuthRateLimiter` (IP : tentatives ; identifiant : échecs, remis à zéro au succès ; clés hachées ; 429 neutre `RATE_LIMITED`) sur login, password-reset, mfa/verify.
- [x] T013 Variables `ASSURMATCH_AUTH_RATE_LIMIT_*`, `LOG_LEVEL`, `METRICS_TOKEN`, `SENTRY_*` dans `.env.production.api.example` ; `ASSURMATCH_WORKER_PUSH_URL` dans l'exemple worker.
  **Validation**: `backend/tests/integration/auth/auth-rate-limit.spec.ts` (N échecs → 429, réponse identique compte connu/inconnu, compteur métrique, réinitialisation et MFA).

## Phase 5 — En-têtes (US3, FR-007)

- [x] T014 `packages/shared/security/security-headers.ts` ; `next.config.ts` admin et courtier (nouveaux) ; règle générale dans l'app publique, règles visiteur `no-referrer` conservées après.
- [x] T015 nginx : `deploy/nginx/security-headers.conf`, vhosts mis à jour (`server_tokens off`, TLS 1.2+, `limit_req`, `/metrics` 404), montage dans le profil compose `edge`.
  **Validation**: `backend/tests/unit/security/security-headers.spec.ts`, `apps/{admin,broker}/tests/security-headers.spec.ts`, `apps/public/tests/public-security-headers.spec.ts` ; `next start` : en-têtes présents, `/suivi` en `no-referrer`, 0 violation CSP dans Chromium ; nginx 1.27 : `nginx -t` OK, en-têtes uniques, 429 après la rafale.

## Phase 6 — Dépendances, secrets, intrusion (US4, FR-008, FR-009)

- [x] T016 `.github/dependabot.yml` (npm, github-actions, docker, docker-compose).
- [x] T017 `scripts/ci/secret-scan.mjs` étendu (clés, jetons fournisseurs, URL avec identifiants, affectations littérales) ; exceptions revues `secret-scan:allow` (mots de passe des compose locaux).
  **Validation**: `backend/tests/guardrails/secret-scan-rules.spec.ts` ; scan du dépôt OK.
- [x] T018 `docs/security/pentest-checklist.md` (ASVS 4.0.3 niveau 2) et `docs/security/security-headers.md`.

## Reste à faire hors dépôt

- Premier passage de la sauvegarde sur le fournisseur S3 réel et exercice de restauration trimestriel.
- Installation d'Uptime Kuma / Prometheus sur un hôte distinct ; seuils à ajuster après deux semaines.
- Test d'intrusion selon la liste (prestataire ou interne).
