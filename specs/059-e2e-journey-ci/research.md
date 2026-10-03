# Research: 059 — Tests de bout en bout des scénarios métier en CI

## R1. Pile de test : images de production et réseau hôte
- **Décision** : `docker-compose.e2e.yml` construit les quatre Dockerfiles de production (API/worker, public, admin, courtier) et lance tous les services en `network_mode: host` sur des ports dédiés (API 48600, public 48601, admin 48602, courtier 48603, PostgreSQL 48632, Redis 48679, Mailpit 48025/48825).
- **Pourquoi** : les apps Next inlinent `NEXT_PUBLIC_ASSURMATCH_API_URL` au build et l'utilisent à la fois dans le navigateur et côté serveur. La seule adresse sur laquelle les deux côtés s'accordent est la boucle locale de l'hôte. Un réseau bridge aurait exigé une seconde URL interne, donc une modification du code produit.
- **Alternatives** : réseau bridge plus URL interne (rejeté : code produit modifié) ; apps lancées en `next dev` (rejeté : ce n'est pas le code livré, et la compilation à la demande rend les tests lents et instables).
- **Repli** : `--apps=host` exécute le même code depuis la copie de travail (`next build` puis `next start`, API et worker via `tsx`). Seuls PostgreSQL, Redis et Mailpit restent dans Docker. Ce mode sert pour Docker Desktop, ou quand aucune image ne peut être construite.

## R2. Base vierge
- **Décision** : PostgreSQL tourne sur `tmpfs`, sans volume. L'orchestrateur applique `prisma migrate deploy`, puis le **seed de référence** (`scripts/preprod/seed-reference.ts`), puis la commande de premier Super Admin de la spec 057 avec `--send-email`. Il n'y a ni seed local ni seed démo.
- Le lien d'activation du Super Admin est lu dans Mailpit : on teste ainsi le chemin e-mail réel. Il n'est imprimé que si l'envoi échoue.

## R3. Antivirus
- **Décision** : le scanner EICAR intégré (`ASSURMATCH_ANTIVIRUS=eicar`). Il ne coûte rien au démarrage, alors que ClamAV télécharge plusieurs minutes de signatures. Le cas interdit dépose la chaîne de test EICAR et vérifie la mise en quarantaine.
- La chaîne EICAR est assemblée à l'exécution, à partir de deux morceaux. Aucun fichier du dépôt ne la contient en entier, ce qui évite qu'un antivirus de poste la mette en quarantaine.

## R4. MFA et e-mails
- **TOTP** : implémentation RFC 6238 autonome dans `tests/e2e/support/totp.ts` (SHA-1, 6 chiffres, 30 s, paramètres de `mfa.service.ts`), sans otplib. Le test prouve ainsi que le secret d'enrôlement marche avec n'importe quel authentificateur standard. Un code n'est jamais émis dans les 4 dernières secondes de sa fenêtre.
- **Mailpit** : lu par son API HTTP (`/api/v1/search`, `/api/v1/message/:id`), avec un sondage qui couvre plusieurs cycles du worker (intervalle de 5 s dans la pile e2e).

## R5. Séparation des applications (principe III)
- Chaque app est ouverte dans **son propre contexte navigateur** : aucun cookie ni jeton n'est partagé entre le visiteur et une session back-office.
- Les projets Playwright `scenario` (parcours multi-apps), `backoffice` (cas interdits) et `public` (parcours visiteur seul) sont séparés. Les deux derniers dépendent du premier, car ils s'appuient sur le pays, le courtier, l'offre et le lead qu'il a créés.

## R6. État partagé entre étapes
- Chaque étape du scénario est un test, dans un `describe` en mode `serial`. L'état (comptes et secrets TOTP jetables, identifiants, référence QR, lien de suivi) est écrit dans `.local/e2e/journey-state.json`, ignoré par git.
- On peut relancer une seule étape sur une pile conservée : `--keep`, puis `npm run test:e2e -- --grep "SC-05"`.

## R7. Garde-fou d'atteignabilité
- **Constat** : les « contrôleurs de domaine » (`backend/src/modules/**/*.controller.ts`) sont des classes simples. Les routes HTTP sont déclarées dans les classes de câblage (`http-wiring/*.ts`, `runtime/runtime-http.controller.ts`), qui les appellent ou appellent directement les services. Deux contrôleurs (santé, métriques) se décorent eux-mêmes.
- **Décision** : analyse statique avec le *type checker* TypeScript. Chaque accès `x.methode` dans les fichiers de câblage est résolu jusqu'à sa déclaration, et les appels `decorate(Classe, "methode", ...)` sont lus. Cette analyse est complétée par une vérification à l'exécution des métadonnées Nest (`PATH_METADATA`) pour les classes enregistrées dans `RuntimeHttpWiringModule`.
- Chaque méthode publique non câblée doit figurer dans `INTERNAL_ONLY`, avec une justification d'au moins 20 caractères. Le test refuse aussi une entrée obsolète, ou une entrée en fait câblée.
- **Vérifié** : l'ajout d'une méthode sans route fait échouer le test (essai manuel avec `AdminProductsController.newCapability`).

## R8. Test de charge
- **Décision** : script Node sans dépendance (`scripts/e2e/load-test.mjs`), en modèle ouvert : les requêtes partent à cadence fixe, quelle que soit la latence. Le rapport donne p50, p95, p99, le taux d'erreurs (5xx ou réseau), le taux de 429 et le débit atteint. Il est écrit dans `.local/e2e/load-report.json`.
- k6 et autocannon auraient ajouté un binaire ou une dépendance pour un besoin couvert en 150 lignes.
- Les visiteurs synthétiques sont répartis par `X-Forwarded-For`, avec un saut de proxy de confiance (comme derrière nginx en production). Sans cela, la limite anti-spam par IP répond 429 dès la sixième soumission, ce qui est la protection attendue.
- En CI, le job ne bloque pas (`continue-on-error`, `--report-only`).

## R9. Bac à sable de développement (hors livrable)
- Dans le conteneur où la spec a été développée, `dl-cdn.alpinelinux.org` répond 403 et le proxy TLS n'est pas reconnu dans les builds Docker.
- Les quatre images ont donc été construites ici à partir d'une copie temporaire des Dockerfiles : base `node:24-alpine` avec l'AC du proxy, et sans `apk add wget`, le `wget` de busybox suffisant aux sondes. Aucun Dockerfile du dépôt n'a été modifié.
- En CI GitHub, les Dockerfiles d'origine sont utilisés tels quels.
