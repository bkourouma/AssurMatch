# Research: Plateforme de production (057)

## R1 — Variables d'environnement réellement lues

Inventaire par `grep process.env` / `env.X` sur `backend/src`, `apps`, `scripts`, `packages` (2026-10-03).

**API / worker** : `NODE_ENV`, `APP_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `BULLMQ_PREFIX` (lu par
`ConfigModule`, sans effet après D-7), `ENCRYPTION_KEY` (>= 32 octets en preprod/prod),
`ASSURMATCH_AUTH_TOKEN_SECRET` (>= 32 caractères, sinon aucune session), `AUTH_JWT_TTL_MINUTES`,
`AUTH_LOCKOUT_*`, `CORS_ORIGINS`, `PUBLIC_APP_URL`, `BROKER_APP_URL`, `APP_BASE_URL` (liens e-mail),
`EMAIL_*` (`SERVICE_TYPE`, `FROM`, `REPLY_TO`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `PREVIEW_MODE`,
`SEND_TIMEOUT_MS`), `ASSURMATCH_DOCUMENT_STORAGE` (`memory|disk|s3`), `ASSURMATCH_DOCUMENT_STORAGE_DIR`,
`ASSURMATCH_S3_{ENDPOINT,BUCKET,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`, `ASSURMATCH_ANTIVIRUS`
(`eicar|clamav`), `ASSURMATCH_CLAMAV_{HOST,PORT}`, `ASSURMATCH_AI_{PROVIDER,MODEL,FALLBACKS,TIMEOUT_MS}`,
`ANTHROPIC_API_KEY`, `ASSURMATCH_SMS_{PROVIDER,API_KEY}`, `ASSURMATCH_WHATSAPP_{PROVIDER,API_KEY}`,
`PUBLIC_COMPARATOR_ENABLED`, `QUOTE_REQUEST_ENABLED`, `WHATSAPP_ENABLED` (lus par `ConfigModule` mais les
drapeaux effectifs viennent de la base), `ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED`,
`ASSURMATCH_{QUOTE_NOTIFICATION,PARTNER_WEBHOOK,SATISFACTION_SURVEY}_DELIVERY_LIMIT`,
`LOCAL_BOOTSTRAP_ADMIN_*` (interdit en production), `ASSURMATCH_*_MEMORY` (interdits hors test).

**Frontaux (Next)** : public — `NEXT_PUBLIC_ASSURMATCH_API_URL`, `NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL`,
`NEXT_PUBLIC_ASSURMATCH_BROKER_URL` ; admin — `NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL`,
`NEXT_PUBLIC_ASSURMATCH_API_URL`, `NEXT_PUBLIC_APP_ENV` ; courtier — `NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL`,
`NEXT_PUBLIC_ASSURMATCH_API_URL`. Les trois lisent `APP_ENV` et `NODE_ENV` (cookies `secure`, sélecteur
de démo local). `DATABASE_URL` n'est lu que par le sélecteur de démo **local** (inactif hors `APP_ENV=local`) :
il ne doit pas être fourni aux frontaux en production.

**Déclarées mais jamais lues** : `JWT_SECRET`, `SESSION_SECRET`, `COOKIE_DOMAIN`, `LOCAL_STORAGE_ROOT`,
`S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (sans préfixe), `LOG_LEVEL`,
`RATE_LIMIT_*`, `MFA_REQUIRED`, la quasi-totalité des `*_ENABLED` (les drapeaux vivent en base),
`BACKOFFICE_APP_URL`, `API_BASE_URL` (côté frontaux), `SENTRY_DSN`, `UPTIME_KUMA_PUSH_URL`.
`BACKUP_PASSPHRASE` est lu par les scripts shell de sauvegarde (hôte), pas par les conteneurs.

**Conséquence découverte** : les images frontales actuelles de préproduction ne reçoivent aucun
`NEXT_PUBLIC_*` au build ; leurs appels API retombent sur `http://127.0.0.1:3000`. Les Dockerfiles
acceptent désormais ces valeurs en arguments de build (D-057-1). Le job de préproduction n'est pas
modifié (consigne) : il reste à lui passer `PREPROD_*_URL` (suivi).

## R2 — `NEXT_PUBLIC_*` et promotion d'image

Next.js remplace `process.env.NEXT_PUBLIC_*` au `next build`, côté client **et** serveur/middleware.
Une même image ne peut donc pas servir deux domaines. Options : (a) build par environnement, (b)
refactor vers des variables serveur lues au runtime. (b) touche les apps public/admin en cours de
modification par un autre chantier ; (a) retenue. Les valeurs vides sont **désactivées** avant build
(sinon `?? défaut` produit une chaîne vide) via `scripts/ops/next-build.sh`.

## R3 — Worker : processus fils ou runtime partagé

La boucle locale (`notification-worker-loop.mjs`) lance un processus `tsx` par exécution. En production,
un seul `AssurMatchRuntime` longue durée est plus sobre (un pool Prisma, un client Redis) ; la seule
dérive possible est l'état des drapeaux, résolue par `runtime.reloadRuntimeFeatureFlags()` avant chaque
cycle. Les services de livraison (044, 048, webhooks) sont déjà idempotents par statut de ligne.

La tâche webhooks n'est planifiée que si `ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_ENABLED=true` : sinon le
service écrit un audit `webhook.delivery.refused` à chaque appel, ce qui noierait le journal.

## R4 — BullMQ (D-7)

`QueuesModule` crée quatre `Queue` BullMQ et `BullMqQueuePort.add` y pousse un job à chaque notification,
analyse IA ou scan de document. Aucun `Worker` BullMQ n'existe dans le dépôt : les jobs s'accumulent
dans Redis sans fin, et le tableau `jobs` en mémoire grossit sans borne dans l'API. Les services
n'utilisent que le `QueueJobRecord` renvoyé et `transition()`. Retirer l'écriture Redis est donc sans
effet fonctionnel ; on conserve un registre borné (`ProcessJobLedger`, 1 000 entrées, éviction des
états terminaux d'abord). La dépendance npm `bullmq` reste dans `package.json` pour ne pas toucher au
lockfile en parallèle d'autres chantiers ; son retrait est un suivi.

## R5 — IP client

Express sans `trust proxy` : `request.ip` = adresse de la socket (nginx). Chaque proxy ajoute à droite
de `X-Forwarded-For` l'adresse de son pair. Avec N proxys de confiance, l'IP client est l'entrée
d'index `longueur - N` (borne à 0). La valeur la plus à gauche est fournie par le client : jamais fiable.

## R6 — Bootstrap Super Admin

Le flux d'invitation existant (`AdminUsersController.create`) crée l'utilisateur `invited`,
`mfaStatus=required`, émet un jeton `PasswordResetService.issueToken()` stocké haché, que
`/auth/activate` consomme ; la session issue de l'activation exige l'enrôlement MFA. La CLI réutilise
exactement ces briques, avec un acteur système, et écrit l'audit via `writeAsync` pour garantir la
persistance avant la fermeture du processus.

## R7 — Migrations

20 migrations dans `backend/prisma/migrations` à cette date (la doc préproduction indiquait encore que
« spec 013 n'introduit pas de migration »).
