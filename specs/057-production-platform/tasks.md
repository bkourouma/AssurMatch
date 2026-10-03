# Tasks: Plateforme de production (057)

**Spec**: `specs/057-production-platform/spec.md` — **Plan**: `plan.md`
**Statut**: Terminé le 2026-10-03 — typecheck, lint, `npx vitest run` (269 fichiers, 747 tests), `secret-scan`,
`docker compose config` (production avec profils `bundled-db`/`edge`, préproduction) verts. Non exécuté ici :
`docker build`, démarrage réel des conteneurs, job CI de production (pas d'hôte ni de registre).
**Surfaces impactées**: Backend API, Runtime/Docker/CI, opérations ; Dockerfiles des trois apps Next
(aucune page). Aucune migration.

## Phase 1 — Backend

- [x] T001 [US7] `clientIp` fondé sur `TRUSTED_PROXY_HOPS` + validation au démarrage.
  **Validation**: `backend/tests/unit/common/client-ip.spec.ts` ; tests HTTP existants (X-Forwarded-For simple) verts.
- [x] T002 [US4] Sondes de disponibilité bornées (`backend/src/modules/health/readiness.ts`).
  **Validation**: `backend/tests/unit/health/readiness.spec.ts` (ok, down, délai, exception muette).
- [x] T003 [US4] Contrôleur public `/healthz` `/readyz` câblé en fin de tableau `controllers`.
  **Validation**: `backend/tests/integration/health/public-health-runtime-http.spec.ts` (200 sans jeton, corps minimal).
- [x] T004 [D-7] `ProcessJobLedger` remplace `BullMqQueuePort` ; plus de `Queue` BullMQ.
  **Validation**: tests `runtime-adapters` et `runtime-bullmq` mis à jour ; `grep "from \"bullmq\""` vide dans `backend/src`.
- [x] T005 [US3] Boucle worker (`backend/src/runtime/worker/delivery-worker-loop.ts`).
  **Validation**: `backend/tests/unit/runtime/delivery-worker-loop.spec.ts` (isolation d'erreur, compteurs seuls, battement, arrêt).
- [x] T006 [US5] Logique de bootstrap (`backend/src/runtime/ops/bootstrap-super-admin.ts`).
  **Validation**: `backend/tests/unit/runtime/bootstrap-super-admin.spec.ts` (création, refus Super Admin existant, refus e-mail, jeton non audité, MFA requise, activation possible).

## Phase 2 — Scripts

- [x] T007 [US3] `scripts/worker/assurmatch-worker.ts` + `scripts/worker/worker-healthcheck.mjs`.
- [x] T008 [US5] `scripts/ops/bootstrap-super-admin.ts` + script npm `ops:bootstrap-super-admin`.
- [x] T009 [US1] `scripts/production/pre-deploy-check.sh`.
- [x] T010 [US2] `scripts/ops/next-build.sh`.

## Phase 3 — Conteneurs, compose, CI

- [x] T011 [US2] `apps/broker/Dockerfile` ; arguments `NEXT_PUBLIC_*` pour public et admin ; admin ne construit plus le courtier.
- [x] T012 [US1] `docker-compose.production.yml` (+ profils `bundled-db`, `edge`).
- [x] T013 [US6] `.env.production.{api,worker,public,admin,broker}.example`.
  **Validation**: `backend/tests/guardrails/production-env-examples.spec.ts` (pas de secret dans les frontaux, noms alignés sur le code, aucune variable morte).
- [x] T014 [US2] Préproduction compose : services courtier et worker.
- [x] T015 [US1] CI : image courtier, `build-production-frontends`, `deploy-production` (approbation, migrations, santé).
- [x] T016 [US1] `deploy/nginx/assurmatch-production.conf.example`.

## Phase 4 — Documentation

- [x] T017 Runbooks production, worker, santé, courtier, bootstrap admin, migrations.
- [x] T018 Docs préproduction (variables réellement lues, migrations, secrets).

## Phase 5 — Validation

- [x] T019 typecheck, lint, `npx vitest run`, `secret-scan`, `docker compose config` (production, préproduction).
