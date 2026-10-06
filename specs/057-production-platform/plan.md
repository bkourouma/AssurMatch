# Implementation Plan: Plateforme de production (057)

**Spec**: `specs/057-production-platform/spec.md` — **Research**: `research.md` — **Tasks**: `tasks.md`

## Résumé technique

Socle d'exploitation production sans activation métier : quatre images applicatives (API, public, admin,
courtier) + worker (image API, autre commande), compose production paramétrique, déploiement manuel
approuvé avec migrations avant bascule, santé publique minimale, CLI de premier Super Admin, IP client
de confiance, files BullMQ mortes retirées.

## Surfaces impactées

Backend API ; Runtime / Docker / CI ; opérations (scripts, runbooks) ; Broker Back-office, Web Publique
Client et Back-office Plateforme **uniquement par leurs Dockerfiles**. Aucune migration, aucun package
partagé, aucune page.

## Constitution Check

| Principe | Vérification |
| --- | --- |
| I, II, VII | Aucun parcours, texte, consentement ni routage modifié. |
| III | App courtier isolée (conteneur + domaine). Aucun drapeau activé ; webhooks double-verrouillés. |
| IV | Secrets hors images/dépôt, frontaux sans secrets, IP de confiance, MFA imposée au Super Admin initial, `/readyz` muet. |
| V | Fournisseur IA `template` par défaut, inchangé. |
| VI | Audit durable de la CLI ; aucune suppression de données. |
| IX | Tests : santé (intégration HTTP), CLI (unitaire), IP (unitaire), worker (unitaire), exemples d'env (garde-fou). |
| XI | Déploiement production uniquement sur approbation humaine. |

Aucun conflit constitutionnel.

## Conception

### Backend

- `backend/src/modules/common/http/request-actor.ts` : `trustedProxyHops(env)` (0..5, défaut 1) et
  `clientIp(request, env)` (saut de confiance, `X-Real-IP` en secours). `validateRuntimeEnvironment`
  valide `TRUSTED_PROXY_HOPS`.
- `backend/src/modules/health/` : `readiness.ts` (sondes base `SELECT 1` et Redis `PING`, délai 2 s,
  `ready|not_ready`), `public-health.controller.ts` (`GET /healthz`, `GET /readyz` → 200/503) décoré
  manuellement comme le reste du câblage. Le module de câblage n'ajoute qu'une entrée en fin de tableau
  `controllers` (limite les conflits avec les chantiers concurrents).
- `backend/src/modules/common/queues/queues.module.ts` : `ProcessJobLedger` (mode `process-ledger`)
  remplace `BullMqQueuePort` ; plus aucune `Queue` BullMQ.
- `backend/src/runtime/worker/delivery-worker-loop.ts` : boucle injectable (tâches, intervalle, battement,
  logger JSON, arrêt propre, isolation des erreurs, compteurs numériques uniquement).
- `backend/src/runtime/ops/bootstrap-super-admin.ts` : logique pure testable (refus si Super Admin ou
  e-mail existants, création `invited`, jeton, audit durable).

### Scripts

- `scripts/worker/assurmatch-worker.ts` (entrée du conteneur worker), `scripts/worker/worker-healthcheck.mjs`.
- `scripts/ops/bootstrap-super-admin.ts` (CLI), `scripts/ops/next-build.sh` (build Next sans `NEXT_PUBLIC_*` vides).
- `scripts/production/pre-deploy-check.sh` (fichiers d'env par app, permissions, variables obligatoires,
  interdits de production).
- `package.json` : `worker:run`, `ops:bootstrap-super-admin`.

### Conteneurs et CI

- `apps/broker/Dockerfile` (nouveau) ; `apps/public/Dockerfile` et `apps/admin/Dockerfile` : arguments
  `NEXT_PUBLIC_*` ; admin ne construit plus le courtier.
- `backend/Dockerfile` : healthcheck sur `/healthz`.
- `docker-compose.production.yml` ; `docker-compose.preproduction.yml` : service `assurmatch-broker` et
  `assurmatch-worker` ajoutés pour la reproduction locale.
- `.github/workflows/ci.yml` : image courtier dans `build-images` ; jobs `build-production-frontends`
  (variables `PROD_*_URL`) et `deploy-production` (`environment: production`, runner
  `[self-hosted, assurmatch-production]`, `docker compose run --rm api prisma migrate deploy`, bascule,
  santé). Job préproduction inchangé hormis le passage à quatre images construites.
- `deploy/nginx/assurmatch-production.conf.example` : quatre vhosts paramétriques.

### Docs

Runbooks `deployment-production.md`, `worker.md`, `health.md`, `broker-deployment.md`, `bootstrap-admin.md`
(réécrit), `migrations.md` ; `docs/preproduction/environments.md`, `secrets-policy.md`, `architecture.md`
corrigés.

## Validation

`npm run typecheck`, `npm run lint`, `npx vitest run`, `node scripts/ci/secret-scan.mjs`,
`docker compose -f docker-compose.production.yml --env-file ... config`,
`docker compose -f docker-compose.preproduction.yml config`. Pas de `docker build` ni de démarrage
(pas de registre ni d'hôte dans cet environnement).

## Risques

- Images frontales par environnement : une image publique construite pour la production ne peut pas
  être promue telle quelle depuis la préproduction (accepté, R2).
- Une seule réplique worker : un scale accidentel n'est pas bloqué techniquement (documenté).
- Le job de préproduction ne passe toujours pas `NEXT_PUBLIC_*` (inchangé par consigne) : suivi.
