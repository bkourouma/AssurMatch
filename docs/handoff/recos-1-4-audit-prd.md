# Handoff : audit PRD et recommandations 1 à 4 (specs 062 à 066)

Date : 2026-10-22. Fusionné sur `main` par la PR #42 (commit `709ccb2`).

## D'où l'on part

Le 2026-10-15, un audit de bout en bout a comparé le PRD initial (`docs/prd_plateforme_comparaison_assurances.md`) au code de `origin/main` (b08b945). Il a confirmé que le parcours principal (SC-01 à SC-10) marchait. Il a aussi trouvé des failles et des fonctions présentes côté API mais injoignables. Quatre recommandations en sont sorties ; elles sont livrées ici.

## Ce qui est livré

| Spec | Contenu |
|---|---|
| 063 Correctifs critiques | MFA demandée à chaque connexion sauf appareil de confiance (30 j, jeton haché, cookie par app, révocable). Contestations de lead dans les 30 jours, décidées par la finance avec motif : crédit sur le brouillon, avoir partiel automatique ou lead rendu au pack. Une seule contestation par lead, sans appel, avec index unique partiel en base. Le résumé IA du devis reçoit les vraies réponses. Les flags `starter_portal_enabled`, `broker_crm_enabled` et `broker_dashboard_enabled` sont activés par défaut. Migration `0030`. |
| 064 Brancher l'existant | Boutons d'export CSV (audités, formules neutralisées), page d'analyse des pertes (Enterprise), carte « Analyse IA » des anomalies de routage, rôles personnalisés Enterprise appliqués à chaque requête (intersection avec le rôle de base), filtre d'affichage par agence, charte Enterprise. Migration `0032`. |
| 062 Messagerie | Messages courtier ↔ visiteur avec pièces jointes (antivirus), pour tous les plans. Une formulation interdite bloque l'envoi. Demandes de documents, délai SLA jusqu'à la première réponse visible. Demandes d'accès, de rectification ou d'effacement en libre-service, traitées par la conformité, jamais d'effacement automatique. Constitution passée en **v1.4.0** (le Starter peut échanger des messages). Flag `broker_visitor_messaging_enabled` **fermé** jusqu'à l'avis juridique L-08. Migration `0031`. |
| 065 E2E | Parcours Playwright Pro CRM, isolation des rôles, IA désactivée, Enterprise, alerte et exclusion de licence, retrait du consentement, ouverture du Sénégal, et toutes les fonctions 062, 063 et 064 (projets `pro-enterprise`, `senegal`, `recos`). |
| 066 Constats E2E | **F1, fuite de données** : un téléphone déjà connu rattachait un nouveau visiteur au profil d'un autre ; e-mails et lien de suivi partaient chez le premier. Un profil n'est maintenant réutilisé que si e-mail, téléphone et nom sont identiques. Également : édition d'agence, redirection Starter `/crm/*` vers `/?notice=crm_requires_pro`, texte du pays pilote, `*.sh eol=lf`, `next build` sous le tsconfig non strict généré. |

Les décisions du propriétaire sont écrites dans chaque `specs/06x-*/spec.md`.

## Validations

- Avant fusion, en local sous Windows :
  - typecheck et lint OK ;
  - `NODE_ENV=test npm run test` : 1384/1385 (un timeout sous charge, OK seul) ;
  - `test:web` : 389 OK, 14 ignorés ;
  - E2E `--apps=host` sur Docker Desktop : 107/107.
- CI de la PR #42 sous Linux : `verify`, `e2e` (applications conteneurisées) et `secret-scan` au vert.
- La CI de `main` après fusion tournait encore à l'écriture de ce document : vérifier son résultat.

## Reste à faire (code)

- **Fichiers générés commités par erreur** : `apps/{admin,broker,public}/tsconfig.tsbuildinfo` (commit 58220e5). Les retirer du suivi et ajouter `*.tsbuildinfo` au `.gitignore`. Tant que ce n'est pas fait, un `git pull` local échoue si le fichier existe déjà : supprimer le fichier local avant de tirer.
- Non testés depuis l'interface : l'expiration à 30 jours d'une contestation, et le chemin « lead rendu au pack » (couverts en unitaire et en intégration seulement).
- Les dépôts Prisma de 063 et 062 (index partiels, `listForTargets`, P2002) ne sont testés que via la pile E2E, pas par `test:runtime:postgres`.

## Reste à faire (opérations, avant ouverture)

- **Données antérieures à F1** : exécuter `scripts/ops/sql/f1-shared-prospect-detection.sql` (lecture seule) sur la préproduction puis la production. Selon le résultat, corriger les demandes ou remettre la base à zéro. C'est la ligne 5.0 de `docs/go-live/checklist-mise-en-production.md`. La requête n'a jamais été lancée sur une vraie base.
- Ouvrir `broker_visitor_messaging_enabled` depuis l'écran des flags seulement après l'avis juridique L-08 (ligne 2.8 bis de la checklist).
- Les durées de conservation des messages, des demandes de documents et des demandes sur les données sont provisoires (730, 180 et 1825 jours) : à faire valider par le juridique.
- Sur une base déjà seedée, les flags existants à `false` ne changent pas : passer les trois modules courtier à « actif » depuis l'écran des flags.

## Chantier suivant en cours (autre session)

Les écarts restants de l'audit font l'objet de l'orchestration `ecarts-prd` :
- supervisée par la session Claude « Où en est-on ? » ;
- suivi dans `.orchestration/2026-10-21-ecarts-prd/suivi.md` (dossier non versionné) ;
- branches `orch/2026-10-21-ecarts-prd-lot-N`, copies dans `D:/APP/AssurMatch-worktrees/`.

Ses lots 1 à 5 partent de `integration/recos-1-4` (a5a0d10), qui est maintenant dans `main`. Sa PR finale peut donc viser `main`.

| Lot | Sujet |
|---|---|
| 1 | Parcours devis : multi-offres, choix du courtier, étape documents, prénom/nom, rappel documents |
| 2 | IA visiteur |
| 3 | CRM et tableau de bord courtier |
| 4 | Catalogue et offres |
| 5 | Routage et facturation |
| 6 à 11 | Pilotage admin, IA admin et intégrations, sécurité, CMS, canaux, E2E et documentation |

- **Hypothèses validées par le propriétaire** : H1 à H4 (multi-offres jusqu'à 3 si le multi est ouvert, choix direct d'un courtier éligible, revue manuelle sous le seuil de qualité, setup fee et forfaits mensuels).
- **Hypothèses non encore posées** : H5 à H8 (comptage des visiteurs sans cookie, chiffrement des données personnelles, CMS minimal, fournisseurs SMS/WhatsApp).
- **Impact connu** : le lot 4 durcit l'ouverture d'un pays (règles, disclaimers, attestations). `tests/e2e/scenario-core.spec.ts` et `senegal-opening.spec.ts` devront être adaptés.

## Copies de travail locales à nettoyer

Ces branches sont fusionnées dans `main`. Leurs copies dans `.claude/worktrees/` peuvent être supprimées :
- `062-broker-visitor-messaging`
- `063-critical-fixes`
- `064-wire-existing-capabilities`
- `065-e2e-pro-enterprise`
- `fix-e2e-findings`
- `integration-recos-1-4` : à garder tant que la session `ecarts-prd` en dépend.

## Pièges

- Les agents en arrière-plan meurent quand le processus Claude se ferme. Leur faire committer du travail en cours souvent sur la branche du lot.
- Docker Desktop n'expose pas `network_mode: host`. En local, lancer la pile E2E avec `ASSURMATCH_E2E_COMPOSE_OVERRIDE=docker-compose.e2e.desktop.yml E2E_BROWSER_CHANNEL=chrome npm run test:e2e:stack -- --apps=host`. Le chemin `--apps=docker` n'est vérifié qu'en CI.
- `playwright.config.ts` ignore `**/.claude/**` : dans une copie de travail placée sous `.claude/worktrees`, `npm run test:web` ne trouve aucun test. Utiliser une config temporaire.
- Une copie de travail hors de `D:/APP/AssurMatch` n'emprunte pas les `node_modules` : lancer `npm ci`, puis `prisma generate`. Turbopack refuse aussi les `node_modules` empruntés.
- Sur une pile E2E réutilisée, les limites par IP (demandes sur les données 5/h, renvoi de `/suivi`) cassent un second passage. Repartir d'une pile neuve.
- Le système de permissions peut refuser à un sous-agent une fusion git locale. Ne pas la faire à sa place sans l'accord de l'utilisateur.
- L'arbre de travail est en CRLF (`core.autocrlf=true`) : éditer avec Edit, ou ancrer les remplacements avec `(\r?)$`.
- Le `main` local peut être en retard sur `origin/main` : faire un `git fetch` avant tout audit.
