# Plan: 059 — Tests de bout en bout des scénarios métier en CI

**Spec** : `specs/059-e2e-journey-ci/spec.md` (validée). **Constitution** : principes II (consentement nommé), III (séparation des applications), IV (isolation, MFA), VIII (formulations), IX (tests constitutionnels), XI (aucune activation sensible).

## Surfaces impactées
- **Tests** : `tests/e2e/` (Playwright multi-applications) et `backend/tests/guardrails/controller-reachability.spec.ts`.
- **Runtime Docker / CI** : `docker-compose.e2e.yml`, `scripts/e2e/*`, job CI `e2e`, `.dockerignore`.
- **Corrections de défauts révélés (FR-007)** :
  - Backend API : câblage des devis, nouvelle route `GET /partners/applications/options`, `ProductsService.listForBrokerOnboarding` ;
  - Web Publique Client : formulaire de candidature, durée du cache catalogue paramétrable ;
  - Back-office Plateforme : statut produit ;
  - Back-office Courtier : redirections relatives, libellé du nom du contact.
- **Aucun** changement de schéma ni migration. **Aucune** activation de flag sensible. Les parcours visiteur et back-office restent dans des contextes navigateur séparés.

## Architecture
1. `scripts/e2e/e2e-env.mjs` : ports, URL, environnement de l'API et du worker, arguments de build des frontends et variables Playwright. Cette source unique est relue par la pile, l'orchestrateur et Playwright.
2. `scripts/e2e/e2e-stack.mjs` (`npm run test:e2e:stack`) : démontage → build des images → infra (PostgreSQL vide, Redis, Mailpit) → `migrate deploy` → seed de référence → premier Super Admin (spec 057, e-mail) → API, worker et trois apps → attente des sondes → Playwright → collecte des logs → démontage.
   - Options : `--apps=docker|host`, `--keep`, `--up-only`, `--down`, `--no-build`, `--dry-run` ; les arguments après `--` vont à Playwright.
3. `playwright.e2e.config.ts` :
   - un seul worker ;
   - traces, vidéos et captures conservées en cas d'échec (`test-results/e2e`, `playwright-report/e2e`) ;
   - trois projets : `scenario`, `backoffice` (dépend de `scenario`) et `public` (dépend de `scenario`).
4. Utilitaires `tests/e2e/support/` :
   - `env`, `mailpit` (attente et extraction de liens), `totp` (RFC 6238) ;
   - `backoffice` (activation, MFA, connexion, réouverture de session expirée) ;
   - `ui` (avis d'action, dialogues de confirmation, cartes), `admin` (catalogue, consentements, formulaires, flags), `partners` (documents, périmètres, statuts, onboarding direct) ;
   - `files` (PDF minimal, EICAR), `journey-state`.
5. Spécifications :
   - `scenario-core.spec.ts` : SC-01a/b, SC-02a/b, SC-03, SC-04a/b, SC-01c (ouverture publique, qui exige courtier et offre), SC-05, SC-06, SC-07 ;
   - `forbidden-cases.spec.ts` : SC-09a pays fermé, SC-09b désactivation immédiate, SC-09c absence de consentement, SC-09d isolation entre courtiers et quarantaine EICAR, SC-09e courtier suspendu en lecture seule ;
   - `visitor-tracking.spec.ts` : lien magique et jeton altéré, renvoi depuis `/suivi` avec réponse neutre, page d'avis sans lien valide.
6. Garde-fou FR-005 : voir research R7.
7. Charge FR-006 : `npm run test:load` (research R8).

## Ordre du scénario (contrainte produit)
L'ouverture publique d'un pays exige un courtier actif licencié et une offre publiable (spec 050). Le scénario passe donc d'abord la CI en `pilot`, onboarde le courtier, fait valider l'offre, puis ouvre le pays en `public` (SC-01c). Le statut `pilot` est le seul qui expose le formulaire de candidature au premier courtier (annuaire = pays `public` ou `pilot`).

## Défauts révélés et corrigés (FR-007)
| # | Défaut | Correction |
|---|---|---|
| D1 | Aucun écran ne permettait de changer le statut d'un produit, alors que la checklist exige « Statut produit public » : un pays ne pouvait pas être ouvert depuis l'interface. | `ProductStatusForm` sur la fiche produit et `changeProductStatusAction`. L'API acceptait déjà le changement (`PATCH /admin/products/:id`). |
| D2 | Le premier courtier d'un pays ne pouvait pas candidater : le formulaire ne proposait que les produits visibles des visiteurs, toujours vides avant l'ouverture, et la candidature exige au moins un produit. | `GET /partners/applications/options` : pays `public` ou `pilot` avec inscription ouverte, et leurs produits liés non brouillon, suspendus ou retirés. La page de candidature l'utilise. |
| D3 | Après l'envoi d'une proposition (route handler du portail courtier), la redirection absolue était résolue sur l'adresse d'écoute de Next (`localhost`). Le courtier changeait d'origine, perdait son cookie et retombait sur la connexion ; derrière un proxy, la redirection partait vers l'adresse interne. | `seeOther` renvoie un `Location` relatif. |
| D4 | `POST /quote-requests` prenait l'adresse IP… dans le corps de la requête. Le formulaire public ne l'envoie pas, donc tous les visiteurs partageaient le seau `unknown` de la limite par IP : 5 demandes par minute pour tout un pays et un produit, et le seau était choisi par le client. | L'IP vient de la connexion (`clientIp`, sauts de proxy de confiance). |
| D5 | Le catalogue public était mis en cache 10 minutes, sans réglage : un pays ouvert ou fermé dans le back-office restait invisible, ou visible, jusqu'à 10 minutes. | `ASSURMATCH_PUBLIC_CACHE_SECONDS` (0 = lecture directe), à 0 dans la pile e2e. La valeur par défaut reste inchangée. |
| D6 | Fiche lead du courtier : la clé brute `displayName` était affichée comme libellé. | Libellé « Nom ». |
| D7 | Le contexte de build Docker embarquait `apps/*/.next`, les `node_modules` imbriqués, `.claude/` (plusieurs Go) et `.local/`. Le disque s'est saturé au premier build. | `.dockerignore` complété. |

## Constats hors périmètre (documentés, non corrigés)
- L'e-mail d'activation annonce toujours « expire dans 30 minutes », quelle que soit la durée réelle : 120 minutes pour le bootstrap avec `--ttl-minutes 120`.
- Un courtier Starter ne peut pas clôturer un lead (gagné ou perdu) par HTTP (`BrokerStarterController.close` non câblé). SC-08 (enquête de satisfaction à la clôture) n'est donc atteignable qu'en Pro. De plus, `satisfaction_survey_enabled` est un flag sensible, sans bascule dans l'interface. SC-08 n'est pas automatisé.
- La recherche des preuves de consentement (`AdminConsentRecordsController.search`) n'a pas de route.
- Le formulaire de statut pays propose des transitions refusées par l'API (par exemple brouillon → pilote).
- L'en-tête du portail courtier affiche l'identifiant de l'utilisateur au lieu de son nom.
- Charge : la soumission de devis plafonne à environ 20 req/s avec un seul processus API (environ 65 ms CPU par demande) sur 4 vCPU partagés. L'objectif M-03 (50 req/s, p95 < 800 ms) n'est atteint que pour le catalogue.

## Validation
`npm run typecheck`, `npm run lint`, `npm run test` (vitest complet, garde-fou compris), `npm run test:web` (marqueurs source), `node scripts/ci/secret-scan.mjs`, `npm run test:e2e:stack` (modes docker et host), `npm run test:load`.
