# Feature Specification: Observabilité, sauvegardes et durcissement sécurité

**Status**: Validated (workflow continu autorisé par l'utilisateur le 2026-10-03)
**Input**: PRD v0.3, EPIC K (K-09, K-11, K-12, K-13 préparation, K-14) et scénario SC-10. Dépend de la spec 057 (plateforme de production, health checks, worker).
**Impacted surfaces**: Backend API, runtime / Docker, CI, docs/runbooks. Aucun changement fonctionnel visible pour les utilisateurs.

## Why
Aucun suivi d'erreurs, aucune métrique, aucune alerte. Les sauvegardes sont locales et n'ont jamais été restaurées. Les en-têtes de sécurité ne sont que documentés. Il n'y a pas de limitation de débit par IP sur l'authentification. Le scan de secrets est minimal et Dependabot est absent. Les journaux ne sont pas structurés et les erreurs 5xx ne sont pas journalisées.

## Constitution
- **Principe IV (sécurité)** : données personnelles masquées dans les journaux ; HTTPS ; limitation de débit.
- **Principe VI (historique)** : sauvegardes testées.
- **Principe X (journaux structurés)**.
- Aucune donnée personnelle n'est envoyée à un service tiers de suivi d'erreurs sans masquage.

## User stories
1. **(P1) Exploitant — incidents.** Quand une 5xx survient ou que le worker s'arrête, il reçoit une alerte. Il retrouve la requête par son correlationId dans des journaux JSON masqués.
2. **(P1) Exploitant — sauvegardes.** Une sauvegarde chiffrée de la base et des fichiers part chaque nuit hors site. Un test de restauration documenté et chronométré réussit (objectifs RPO 24 h, RTO 4 h).
3. **(P1) Sécurité — authentification.** Les routes d'authentification sont limitées par IP et par compte. Les en-têtes CSP, HSTS, X-Frame-Options, nosniff et Referrer-Policy sont servis par les apps et par nginx, depuis une configuration versionnée.
4. **(P2) Sécurité — dépendances et secrets.** Dependabot et un scan de secrets complet (motifs génériques : clés, jetons, URLs avec identifiants) tournent en CI.

## Requirements
- **FR-001** Journaux JSON structurés pour les requêtes (méthode, route sans paramètres sensibles, statut, durée, correlationId) et pour les erreurs (pile seulement côté serveur), avec masquage des données personnelles (e-mail, téléphone, jeton, query `token`).
- **FR-002** Intégration optionnelle d'un suivi d'erreurs (Sentry ou équivalent, par `SENTRY_DSN`), avec un filtre de masquage avant envoi. Désactivé si la variable est absente.
- **FR-003** Endpoint de métriques Prometheus (`/metrics`), protégé par un jeton ou réseau interne : requêtes et erreurs par route, latence, arriéré et échecs des notifications, dernier passage du worker.
- **FR-004** Règles d'alerte documentées et exemples de configuration Uptime Kuma : 5xx > seuil, worker inactif > 10 min, arriéré > N, échecs d'e-mail, expiration des certificats.
- **FR-005** Scripts de sauvegarde chiffrée (gpg ou age) vers un stockage compatible S3, avec rétention configurable. Script de restauration testé sur une base vierge. Runbook avec chronométrage.
- **FR-006** Limitation de débit sur la connexion, la réinitialisation de mot de passe et la vérification MFA : par IP et par identifiant, stockée dans Redis, avec réponse 429 neutre.
- **FR-007** En-têtes de sécurité : `headers()` Next pour les trois apps (CSP compatible avec next-intl et les scripts Next), configuration nginx versionnée dans `deploy/nginx/`, tests qui vérifient leur présence.
- **FR-008** Dependabot (npm, actions, docker) ; scan de secrets étendu (gitleaks-like en script maison ou action) ; `npm audit --audit-level=high` conservé.
- **FR-009** Liste de contrôle du test d'intrusion (OWASP ASVS niveau 2) dans `docs/security/pentest-checklist.md`.

## Success criteria
- 100 % des 5xx journalisés avec correlationId, sans donnée personnelle (tests).
- Restauration réussie et chronométrée dans le runbook.
- 0 en-tête de sécurité manquant sur les trois apps (tests).
- Connexion limitée après N échecs (tests).
