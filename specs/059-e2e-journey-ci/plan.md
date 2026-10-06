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
- Passe de clôture (G1 à G7 ci-dessous) :
  - Backend API : clôture Starter, recherche des preuves de consentement, durée réelle des jetons dans les e-mails, graphe de statuts pays partagé, relecture périodique des flags, commande `ops:apply-flag-policy`, débit de la soumission de devis ;
  - Back-office Plateforme : page `/compliance/consent-records`, formulaire de statut pays ;
  - Back-office Courtier : bouton « Clôturer » ;
  - shared packages : contrats de clôture, de recherche des preuves et graphe de statuts ;
  - base de données : migration `0029_query_performance_indexes` (index seulement, aucune donnée modifiée).
- La pile e2e active deux flags sensibles (enquête, facturation) par le chemin de conformité audité, jamais par l'interface. Les parcours visiteur et back-office restent dans des contextes navigateur séparés.

## Architecture
1. `scripts/e2e/e2e-env.mjs` : ports, URL, environnement de l'API et du worker, arguments de build des frontends et variables Playwright. Cette source unique est relue par la pile, l'orchestrateur et Playwright.
2. `scripts/e2e/e2e-stack.mjs` (`npm run test:e2e:stack`) : démontage → build des images → infra (PostgreSQL vide, Redis, Mailpit) → `migrate deploy` → seed de référence → premier Super Admin (spec 057, e-mail) → politiques de conformité SC-08 (`satisfaction_survey_enabled`, `billing_enabled` par `scripts/ops/apply-flag-policy.ts`) → API, worker et trois apps → attente des sondes → Playwright → collecte des logs → démontage.
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
   - `visitor-tracking.spec.ts` : lien magique et jeton altéré, renvoi depuis `/suivi` avec réponse neutre, page d'avis sans lien valide ;
   - `scenario-core.spec.ts` SC-08 : clôture Starter « gagné », e-mail « clôturée », enquête envoyée par le worker et remplie sur `/avis`, tarif, brouillon, facture numérotée, paiement constaté, facture « réglée » côté courtier ;
   - `ops-health.spec.ts` (projet `ops`) : SC-10 automatisable, `/healthz`, `/readyz` (base et Redis) et battement de cœur du worker.
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

## Constats de la première passe : tous traités (passe de clôture du 2026-10-03)
| # | Constat | Traitement |
|---|---|---|
| G1 | E-mail d'activation : « expire dans 30 minutes » en dur (120 min réelles au bootstrap). | Le texte est calculé depuis l'expiration réelle du jeton (`formatTokenValidity`) : `--ttl-minutes` du bootstrap, `AUTH_ACTION_TOKEN_TTL_MINUTES` (30 par défaut) pour les invitations et réinitialisations. |
| G2 | Un courtier Starter ne pouvait pas clôturer un lead ; SC-08 inatteignable en Starter. | `POST /broker/starter/leads/:id/close` (`brokerWriteActor`, `BROKER_TENANT_WRITE_GUARDED`), issue `gagne` / `perdu` / `sans_suite`, 409 `LEAD_NOT_ACCEPTED` / `LEAD_CLOSED`, historique et audit ; publie `lead.status_changed` (statut `closed`) : e-mail visiteur « clôturée » (054) et enquête (048). Bouton « Clôturer » sur la fiche lead Starter. |
| G3 | Recherche des preuves de consentement sans route. | `POST /admin/consent-records/search` (POST : l'e-mail n'apparaît dans aucune URL), compliance_admin / super_admin avec MFA, au moins un critère (référence `QR-`, e-mail empreinté côté serveur, pays), empreinte du sujet tronquée, recherches et refus audités sans les valeurs ; page `/compliance/consent-records`. Retiré d'`INTERNAL_ONLY`. |
| G4 | Le formulaire de statut pays proposait des transitions refusées (brouillon → pilote). | Graphe unique `packages/shared/contracts/country-status-transitions.ts`, appliqué par l'API et seul proposé par le formulaire. |
| G5 | `satisfaction_survey_enabled` sans chemin opérable ; l'API ne relisait jamais les flags. | Commande auditée `npm run ops:apply-flag-policy` (référence, approbateur, motif ; modules réglementés refusés) ; l'API relit les flags toutes les `ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS` (30 s ; une lecture concurrente d'un changement local est ignorée). |
| G6 | Débit de `POST /quote-requests` ≈ 20-24 req/s. | Voir research R10 : 23 → 50 req/s, p95 45 s → 120 ms sur la pile Docker (826 ms juste après un redémarrage à froid). |
| G7 | La checklist d'activation bloquait sur `billing_enabled`, alors que la spec 060 et la décision D-8 font de la facturation manuelle une composante du lancement : une fois la CI facturée, le Sénégal n'aurait plus pu ouvrir. | `billing_enabled` retiré des contrôles bloquants (décision consignée ci-dessous) ; `payments_enabled` reste bloquant. |

### Décisions prises pendant la passe de clôture (cohérentes avec le PRD v0.3 et la constitution)
- **Clôture Starter** : fait partie du cycle de vie minimal (accepter, rejeter, contester, clôturer) de la constitution 1.3.0, critère n°1 ; aucun pipeline n'est exposé. L'issue commerciale n'est jamais communiquée au visiteur (e-mail « demande clôturée » générique). Une clôture `sans_suite` déclenche aussi l'enquête, comme `closed`.
- **`billing_enabled` hors checklist bloquante** : D-8 (facturation manuelle au lancement) et la checklist de mise en production 4.7 l'activent ; seul le paiement en ligne reste interdit.
- **Délai de l'enquête** : 24 h en production (spec 048) ; `ASSURMATCH_SATISFACTION_SURVEY_DELAY_MINUTES` le réduit à 0 dans la pile e2e uniquement.
- **Routage synchrone conservé** : le débit cible est atteint sans déplacer le routage dans le worker ; la confirmation continue de nommer le courtier retenu (spec 052 R8, spec 054).

## Validation
`npm run typecheck`, `npm run lint`, `npm run test` (vitest complet, garde-fou compris), `npm run test:web` (marqueurs source), `node scripts/ci/secret-scan.mjs`, `next build` des trois apps, `npm run test:e2e:stack` (modes docker et host), `npm run test:load`.
