# Feature Specification: Plateforme de production

**Feature Branch**: `057-production-platform`
**Created**: 2026-10-03
**Status**: Validée — périmètre et décisions issus du PRD v0.3 (`docs/prd/prd_v0.3_completion_mise_en_production.md`, EPIC K et I, décisions D-7 et D-10 arbitrées le 2 octobre 2026).
**Validation State**: Aucune `[NEEDS CLARIFICATION]`. Workflow continu autorisé (constitution, article XI).
**Exigences PRD couvertes**: K-01, K-02, K-04, K-05, K-06, K-07, K-08 (partie configuration), K-10, I-01, I-02 ; correctif K-12 « IP client » (anticipé, trivial).
**Hors périmètre de cette spec**: K-03 (réenregistrement du runner de préproduction, opération manuelle), K-09 (observabilité complète, spec 058), K-11, K-13, K-14, en-têtes de sécurité et nginx versionné complet (spec 058), choix du domaine (D-10), choix du fournisseur d'e-mail (K-08, opération).

## Pourquoi cette spec existe

L'audit de complétion (PRD v0.3, section 1) constate qu'AssurMatch n'a **pas d'environnement de
production** : l'app courtier n'est construite que dans l'image back-office et n'est jamais démarrée,
les workers de notification ne tournent qu'à la main, des files BullMQ sont écrites sans jamais être
lues, la santé n'est exposée qu'au Super Admin, il n'existe aucun chemin pour créer le premier Super
Admin en production (le bootstrap local y est interdit), un seul fichier `.env` est partagé par les
trois conteneurs (les frontaux reçoivent donc les secrets de l'API) et l'IP client utilisée pour la
limitation de débit est falsifiable.

Cette spec livre le socle technique permettant d'ouvrir la production, **sans activer aucune
fonctionnalité métier** : tous les drapeaux sensibles restent à `false`, l'e-mail reste en aperçu tant
qu'un opérateur ne l'a pas validé, et aucun domaine n'est figé (D-10).

## Surfaces impactées

- **Backend API** : endpoints publics `/healthz` et `/readyz` ; correctif `clientIp` (TRUSTED_PROXY_HOPS) ;
  neutralisation des files BullMQ jamais consommées (D-7) ; validation de `TRUSTED_PROXY_HOPS` au démarrage.
- **Runtime / Docker / CI** : Dockerfile courtier, image GHCR `assurmatch-broker`, `docker-compose.production.yml`,
  conteneur worker dédié, job `deploy-production` avec approbation manuelle, `prisma migrate deploy`
  avant bascule, fichiers d'environnement séparés par application.
- **Opérations** : CLI à usage unique `ops:bootstrap-super-admin`, runbooks (déploiement production,
  worker, santé, app courtier, bootstrap admin), mise à jour de la documentation préproduction.
- **Broker Back-office** : uniquement son empaquetage (Dockerfile) ; aucun écran modifié.
- **Web Publique Client / Back-office Plateforme** : uniquement leurs Dockerfiles (arguments de build
  `NEXT_PUBLIC_*`) ; aucune page modifiée.
- **Base de données** : aucune migration.
- **Shared packages** : aucun changement.

La séparation applicative est renforcée : quatre images et quatre conteneurs distincts (API, public,
admin, courtier) + un conteneur worker sans port exposé ; chaque frontal ne reçoit que ses variables
publiques.

## Conformité constitutionnelle

- **I. Plateforme technique** : inchangé, aucun parcours ni texte public modifié.
- **II. Conformité et consentement** : aucun envoi nouveau. Le worker ne fait qu'exécuter en boucle les
  traitements existants (specs 044, 048, webhooks), qui portent déjà leurs contrôles de consentement,
  de drapeau et d'audit.
- **III. Architecture modulaire et activation progressive** : app courtier déployée dans son propre
  conteneur et sur son propre domaine. Aucun drapeau activé ; la livraison des webhooks reste
  conditionnée à `ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=true` **et** au drapeau
  `partner_webhooks_enabled`. `/healthz` et `/readyz` ne divulguent rien.
- **IV. Sécurité** : secrets uniquement dans les fichiers d'environnement de l'hôte (mode 0600), jamais
  dans les images ni le dépôt ; frontaux privés des secrets API ; IP client prise au saut de confiance ;
  premier Super Admin créé par une commande auditée, refusée dès qu'un Super Admin existe, avec MFA
  imposée à la première connexion (`mfaStatus=required`) ; jeton d'activation affiché une seule fois et
  jamais journalisé.
- **V. IA** : aucune modification ; les variables `ASSURMATCH_AI_*` sont seulement documentées
  (fournisseur `template` par défaut).
- **VI. Historique opposable** : la création du premier Super Admin et ses refus sont audités de façon
  durable (`ops.super_admin_bootstrap.*`). Aucune donnée supprimée.
- **VII. Routage** : inchangé.
- **IX. Tests** : tests unitaires et d'intégration pour la santé, la CLI, l'IP client et la boucle worker.
- **XI. Gouvernance** : aucune activation interdite ; le déploiement en production exige une approbation
  humaine (GitHub Environment `production`).

## Décisions appliquées

- **D-7 (PRD)** : sondage en base dans un conteneur worker dédié. Les files BullMQ (`assurmatch.notifications`,
  `future-ia`, `future-routing`, `maintenance`) étaient écrites dans Redis sans aucun consommateur ; elles
  sont retirées. Le `QueuePort` devient un registre de jobs en mémoire de processus (borné), qui conserve
  la traçabilité locale (`QueueJobRecord`) utilisée par les services, sans écriture Redis.
- **D-10 (PRD)** : domaine de production non choisi. Tout est paramétrique : variables d'environnement
  des conteneurs, variables GitHub `PROD_*_URL` pour les URL publiques compilées dans les frontaux,
  `server_name` nginx fournis en exemple.
- **D-057-1** : les `NEXT_PUBLIC_*` sont figés par `next build` ; les images frontales sont donc
  construites **par environnement** (arguments de build). L'image API et l'image worker sont
  identiques d'un environnement à l'autre (promotion par SHA).
- **D-057-2** : le worker réutilise l'image API (même code, même schéma Prisma) avec une autre commande ;
  une seule réplique (pas de verrou distribué entre workers).
- **D-057-3** : `TRUSTED_PROXY_HOPS` vaut `1` par défaut (nginx devant l'API) ; `0` ignore
  `X-Forwarded-For`/`X-Real-IP`.
- **D-057-4** : le premier Super Admin est créé `invited` avec un jeton d'activation (30 min par défaut,
  120 max) affiché une fois, ou envoyé par e-mail avec `--send-email`. Aucun mot de passe en argument.

## User Scenarios & Testing

### User Story 1 — Déployer les quatre surfaces et le worker en production (P0)

L'opérateur déclenche manuellement le workflow CI avec `deploy_production`, un approbateur valide
l'environnement `production`, les migrations s'appliquent puis les conteneurs basculent.

**Acceptance Scenarios**:

1. **Given** les images `sha-<commit>` publiées, **When** l'opérateur lance le workflow avec
   `deploy_production=true`, **Then** le job `deploy-production` attend l'approbation de l'environnement
   `production` avant toute action sur l'hôte.
2. **Given** l'approbation, **When** le job s'exécute, **Then** `prisma migrate deploy` puis
   `prisma migrate status` s'exécutent avec l'image du commit **avant** le remplacement des conteneurs,
   et un échec arrête le déploiement sans toucher aux conteneurs en service.
3. **Given** les conteneurs remplacés, **When** les contrôles de santé tournent, **Then** `/readyz` de
   l'API, la page d'accueil publique, `/login` admin et `/login` courtier doivent répondre, sinon le job
   échoue.
4. **Given** un push sur `main`, **When** le workflow tourne, **Then** aucun déploiement production n'a
   lieu (déclenchement manuel uniquement) et le job de préproduction reste inchangé.

### User Story 2 — App courtier déployable (P0)

1. **Given** le Dockerfile `apps/broker/Dockerfile`, **When** CI construit les images, **Then** l'image
   `ghcr.io/<owner>/assurmatch-broker:sha-<commit>` est publiée.
2. **Given** le compose production, **When** il démarre, **Then** le service `broker` écoute sur 3603,
   dispose d'un healthcheck, et ne reçoit que ses variables (`NEXT_PUBLIC_*`, `APP_ENV`, `PORT`).

### User Story 3 — Worker continu (P0)

1. **Given** le conteneur `worker`, **When** il tourne, **Then** il exécute à intervalle
   `ASSURMATCH_WORKER_INTERVAL_SECONDS` la livraison des notifications de devis, des enquêtes de
   satisfaction et (si activée) des webhooks partenaires, sans exécution concurrente de deux cycles.
2. **Given** une tâche qui échoue, **When** le cycle continue, **Then** les autres tâches s'exécutent et
   l'échec est journalisé en JSON sans destinataire, identifiant de notification ni contenu.
3. **Given** un `SIGTERM`, **When** un cycle est en cours, **Then** le worker termine le cycle, ferme ses
   connexions et sort avec le code 0 (sortie forcée après un délai borné).
4. **Given** un worker bloqué, **When** le fichier de battement n'est pas rafraîchi depuis plus de
   `ASSURMATCH_WORKER_HEARTBEAT_MAX_AGE_SECONDS`, **Then** le healthcheck Docker passe en échec.
5. **Given** les drapeaux modifiés par un admin, **When** un nouveau cycle démarre, **Then** les drapeaux
   sont rechargés depuis la base.

### User Story 4 — Santé publique (P0)

1. **Given** l'API démarrée, **When** un client non authentifié appelle `GET /healthz`, **Then** il reçoit
   `200 {"status":"ok"}` sans aucune autre information.
2. **Given** la base et Redis joignables, **When** `GET /readyz`, **Then** `200 {"status":"ready","checks":{"database":"ok","redis":"ok"}}`.
3. **Given** la base ou Redis indisponible ou lent (> 2 s), **When** `GET /readyz`, **Then** `503` avec
   `status: "not_ready"` et l'état `down` de la dépendance, sans message d'erreur, hôte ni version.
4. **Given** `/admin/system/health`, **Then** il reste réservé aux administrateurs (inchangé).

### User Story 5 — Premier Super Admin en production (P0)

1. **Given** aucune Super Admin, **When** l'opérateur lance
   `npm run ops:bootstrap-super-admin -- --email a@b.c --display-name "Nom"`, **Then** un utilisateur
   `super_admin` `invited`, `mfaStatus=required`, sans mot de passe est créé, un jeton d'activation est
   affiché une fois avec l'URL `<BACKOFFICE_APP_URL>/activate?token=...`, et l'audit
   `ops.super_admin_bootstrap.created` est écrit de façon durable, sans le jeton.
2. **Given** au moins un Super Admin non supprimé, **When** la commande est relancée, **Then** elle est
   refusée (code de sortie non nul), auditée `ops.super_admin_bootstrap.refused`, et rien n'est créé.
3. **Given** l'adresse e-mail déjà utilisée, **Then** la commande est refusée.
4. **Given** le premier login, **Then** le flux existant impose l'enrôlement MFA.
5. **Given** un runtime sans base (adaptateur mémoire hors test), **Then** la commande refuse.

### User Story 6 — Configuration séparée par application (P0)

1. **Given** les exemples `.env.production.{api,worker,public,admin,broker}.example`, **Then** seuls
   l'API et le worker contiennent des secrets ; les frontaux ne contiennent que `NODE_ENV`, `APP_ENV`,
   `PORT` et leurs `NEXT_PUBLIC_*`.
2. **Given** les noms de variables, **Then** ils correspondent au code (`ASSURMATCH_S3_*`,
   `ASSURMATCH_DOCUMENT_STORAGE`, `ASSURMATCH_ANTIVIRUS`, `ASSURMATCH_CLAMAV_*`, `ASSURMATCH_AI_*`,
   `ASSURMATCH_SMS_*`, `ASSURMATCH_WHATSAPP_*`, `ASSURMATCH_AUTH_TOKEN_SECRET`, `ENCRYPTION_KEY`,
   `ASSURMATCH_VISITOR_TOKEN_TTL_DAYS`, `TRUSTED_PROXY_HOPS`) ; les variables non lues par le code
   (`JWT_SECRET`, `SESSION_SECRET`, `LOCAL_STORAGE_ROOT`, `S3_*`, `RATE_LIMIT_*`, `*_ENABLED` d'environnement)
   sont retirées des exemples de production.

### User Story 7 — IP client de confiance (P0, correctif K-12)

1. **Given** `TRUSTED_PROXY_HOPS=1` et `X-Forwarded-For: 6.6.6.6, 203.0.113.9`, **Then** l'IP retenue est
   `203.0.113.9` (ajoutée par nginx), jamais `6.6.6.6` (forgée par le client).
2. **Given** `TRUSTED_PROXY_HOPS=2` et `X-Forwarded-For: 198.51.100.1, 10.0.0.2`, **Then** `198.51.100.1`.
3. **Given** `TRUSTED_PROXY_HOPS=0`, **Then** les en-têtes sont ignorés et l'adresse de la socket est utilisée.
4. **Given** aucun `X-Forwarded-For` mais `X-Real-IP` et `TRUSTED_PROXY_HOPS>=1`, **Then** `X-Real-IP`.
5. **Given** une valeur invalide de `TRUSTED_PROXY_HOPS`, **Then** le démarrage échoue.

### Edge Cases

- `/readyz` en mode test (adaptateurs mémoire) : `ready`.
- Le worker démarré avec `APP_ENV` absent ou des adaptateurs mémoire hors test : refus au démarrage
  (validation runtime existante).
- Deux workers lancés par erreur : documenté comme interdit (une seule réplique) ; les services de
  livraison réclament déjà les lignes dues par statut, mais l'ordre n'est pas garanti.
- Échec de l'e-mail en mode `--send-email` : le jeton est affiché en secours (sinon le bootstrap
  resterait bloqué, aucun autre Super Admin ne pouvant réémettre l'invitation).

## Requirements

- **FR-001** Dockerfile `apps/broker/Dockerfile`, port 3603, utilisateur non root, healthcheck.
- **FR-002** Images GHCR `assurmatch`, `assurmatch-public`, `assurmatch-backoffice`, `assurmatch-broker`.
- **FR-003** `docker-compose.production.yml` : `api`, `worker`, `public`, `admin`, `broker`, `redis`,
  `clamav`, `postgres` (profil `bundled-db`, base externe par défaut), `nginx` (profil `edge`).
- **FR-004** Un fichier d'environnement par application ; frontaux sans secret.
- **FR-005** Job `deploy-production` : `workflow_dispatch` + `environment: production`, migrations avant
  bascule, contrôles de santé, échec bloquant.
- **FR-006** Worker longue durée, intervalle configurable, arrêt propre, journaux JSON, battement de vie.
- **FR-007** Files BullMQ jamais consommées retirées (D-7).
- **FR-008** `GET /healthz` et `GET /readyz` publics, sans donnée sensible, délai borné par dépendance.
- **FR-009** CLI `ops:bootstrap-super-admin` unique, auditée, MFA imposée.
- **FR-010** `clientIp` fondé sur `TRUSTED_PROXY_HOPS`.
- **FR-011** Runbooks : déploiement production, worker, santé, app courtier, bootstrap admin ; docs
  préproduction corrigées (variables réellement lues, nombre de migrations).

## Success Criteria

- **SC-001** `docker compose -f docker-compose.production.yml config` valide avec les fichiers exemples.
- **SC-002** typecheck, lint, suite `vitest` complète et `secret-scan` verts.
- **SC-003** Aucune variable secrète dans un exemple frontal (vérifié par test).
- **SC-004** Aucune écriture BullMQ restante dans le code.

## Opérations manuelles restantes (hors code)

Choix du domaine et DNS (D-10), certificats TLS, enregistrement d'un runner `assurmatch-production`,
création de l'environnement GitHub `production` avec reviewers, variables `PROD_*_URL`, secrets sur
l'hôte, fournisseur d'e-mail professionnel (SPF/DKIM/DMARC), bucket S3, exécution du bootstrap.
