# Tasks: 059 — Tests de bout en bout des scénarios métier en CI

## Phase 1 — Pile et orchestrateur (FR-001)
- [x] T001 `scripts/e2e/e2e-env.mjs` : ports, URL, environnement de l'API, du worker et des frontends, variables Playwright.
- [x] T002 `docker-compose.e2e.yml` :
  - PostgreSQL sur tmpfs, Redis, Mailpit ;
  - API, worker et trois apps construits depuis les Dockerfiles de production, en réseau hôte ;
  - scanner EICAR ;
  - sondes de santé (worker par battement de cœur).
- [x] T003 `scripts/e2e/e2e-stack.mjs` (`npm run test:e2e:stack`) :
  - enchaînement migrate → seed de référence → premier Super Admin par e-mail → démarrage → Playwright → logs → démontage ;
  - modes `docker` et `host`, options `--keep`, `--up-only`, `--down`, `--no-build`, `--dry-run`.
- [x] T004 Scripts npm : `test:e2e:stack`, `test:e2e`, `test:load`. `tsconfig` inclut `tests/**` ; ESLint ignore `.local/**`.

## Phase 2 — Utilitaires Playwright (FR-002)
- [x] T005 `playwright.e2e.config.ts` : projets `scenario`, `backoffice` et `public`, un worker, traces et vidéos conservées en cas d'échec.
- [x] T006 `tests/e2e/support/` :
  - `mailpit`, `totp` (RFC 6238), `backoffice` (activation, MFA, connexion, session expirée) ;
  - `ui`, `admin`, `partners`, `files` ;
  - `journey-state`, `env`.

## Phase 3 — Scénarios (FR-003)
- [x] T007 `scenario-core.spec.ts`, SC-01a/b :
  - Super Admin activé par e-mail et MFA ;
  - flags globaux ;
  - consentements FR et EN publiés ;
  - 4 formulaires publiés ;
  - produits publics, liaisons ouvertes, revue manuelle levée ;
  - CI en pilote ;
  - checklist réduite aux courtiers et aux offres.
- [x] T008 SC-02a : candidature publique (référence `PA-`), examen, conversion, candidature « Convertie », e-mail de décision.
- [x] T009 SC-02b :
  - preuve d'agrément acceptée, licence validée ;
  - CI × Auto et Voyage ;
  - contrat ;
  - invitation du propriétaire (lien vers l'app courtier) ;
  - « Actif public ».
- [x] T010 SC-03 : activation et MFA du propriétaire, profil société, licence visible avec son expiration, invitation d'un agent par e-mail.
- [x] T011 SC-04a/b : offre CI × Auto créée et soumise ; Compliance Admin invité, activé avec MFA, qui valide l'offre.
- [x] T012 SC-01c : ouverture publique par la conformité, checklist verte, journal d'audit, page publique CI.
- [x] T013 SC-05 :
  - comparaison, offre « indicative » avec son courtier responsable ;
  - consentement qui nomme le courtier ;
  - référence `QR-` ;
  - e-mail avec un lien de suivi qui fonctionne.
- [x] T014 SC-06 :
  - coordonnées complètes dès l'affectation ;
  - acceptation, puis e-mail « prise en charge » ;
  - proposition (fourchette, garanties, PDF), puis e-mail au visiteur.
- [x] T015 SC-07 :
  - proposition « indicative non contractuelle » ;
  - aucune formulation de souscription ou d'achat ;
  - réponse « intéressé » avec créneau ;
  - courtier notifié par e-mail ;
  - réponse historisée, statut non appliqué.
- [x] T016 `forbidden-cases.spec.ts` : SC-09a pays fermé (UI et API) ; SC-09b désactivation immédiate ; SC-09c sans consentement (UI et API, aucun e-mail) ; SC-09d isolation (courtier Y créé sans candidature, quarantaine EICAR) ; SC-09e suspension, lecture seule, réactivation.
- [x] T017 `visitor-tracking.spec.ts` : lien magique et jeton altéré, renvoi `/suivi` avec réponse neutre et nouveau lien, page d'avis neutre.

## Phase 4 — CI, garde-fou, charge (FR-004 à FR-006)
- [x] T018 Job CI `e2e` (PR et `main`) :
  - libération de disque, Chromium, `test:e2e:stack -- --keep` ;
  - charge non bloquante, démontage ;
  - artefacts (traces et rapport en cas d'échec, logs et rapport de charge toujours).
- [x] T019 `backend/tests/guardrails/controller-reachability.spec.ts` :
  - inventaire par le type checker et les métadonnées Nest ;
  - `INTERNAL_ONLY` justifié (55 entrées : contrôleurs remplacés par le câblage, IA fermée par principe, 2 lacunes suivies) ;
  - vérification qu'une méthode ajoutée sans route fait échouer le test.
- [x] T020 `scripts/e2e/load-test.mjs` : modèle ouvert, p95, erreurs, 429, option `--forwarded-for`, rapport JSON.

## Phase 5 — Corrections révélées (FR-007), voir plan D1 à D7
- [x] T021 D1 : formulaire de statut produit (admin).
- [x] T022 D2 : `GET /partners/applications/options` et page de candidature ; inventaire des routes complété.
- [x] T023 D3 : redirections relatives du portail courtier.
- [x] T024 D4 : IP du demandeur de devis lue sur la connexion.
- [x] T025 D5 : `ASSURMATCH_PUBLIC_CACHE_SECONDS`.
- [x] T026 D6 : libellé « Nom » sur la fiche lead du courtier.
- [x] T027 D7 : `.dockerignore`.

## Phase 6 — Validation
- [x] T028 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:web`, scan des secrets.
- [x] T029 `npm run test:e2e:stack` exécuté pour de vrai :
  - mode docker (images construites, 19/19 au vert) ;
  - mode host (19/19 au vert) ;
  - après la fusion des specs 058 et 061.
- [x] T030 `npm run test:load` : catalogue au vert ; soumission de devis sous l'objectif à 50 req/s (environ 20 req/s soutenues). Constat documenté.

## Phase 7 — Passe de clôture (2026-10-03), voir plan G1 à G7
- [x] T031 G2 : clôture Starter (`POST /broker/starter/leads/:id/close`, issue gagné / perdu / sans suite, `brokerWriteActor`, `BROKER_TENANT_WRITE_GUARDED`, 409 codés, historique, audit, `lead.status_changed`) et bouton « Clôturer ». Tests : unité, HTTP (e-mail « clôturée », enquête en file, suspension 403, autre tenant), marqueurs source.
- [x] T032 G3 : recherche des preuves de consentement (`POST /admin/consent-records/search`, page `/compliance/consent-records`), retirée d'`INTERNAL_ONLY`. Tests HTTP : référence, e-mail jamais renvoyé ni audité, pagination, 400, 403 audités (rôles, MFA), 401.
- [x] T033 G1 : durée réelle des jetons dans les e-mails d'activation et de réinitialisation (`AUTH_ACTION_TOKEN_TTL_MINUTES`, `--ttl-minutes`).
- [x] T034 G4 : graphe de statuts pays partagé entre l'API et le formulaire admin.
- [x] T035 G5 : `npm run ops:apply-flag-policy` (audité, modules réglementés refusés) ; relecture périodique des flags par l'API ; délai d'enquête réglable (`ASSURMATCH_SATISFACTION_SURVEY_DELAY_MINUTES`, 0 dans la pile e2e).
- [x] T036 G6 : débit de la soumission de devis (research R10), migration d'index `0029`.
- [x] T037 G7 : `billing_enabled` retiré des contrôles bloquants de la checklist d'activation.
- [x] T038 SC-08 automatisé (`scenario-core.spec.ts`) ; SC-10 automatisable (`ops-health.spec.ts`, projet `ops`). Politiques SC-08 appliquées par l'orchestrateur.
- [x] T039 Validation : typecheck, lint, vitest complet (321 fichiers, 1 071 tests), `test:web` (256), scan des secrets, `next build` des trois apps (images Docker), `test:e2e:stack` en mode docker (22/22 : SC-01 à SC-09, SC-08 compris, et SC-10 sondes) et `test:load` (catalogue p95 14 ms ; devis 50 req/s, p95 120 ms).

## Restant (suivi)
- SC-10 hors sondes : sauvegarde chiffrée, restauration chronométrée, alertes et incident restent des étapes manuelles (`docs/runbooks/backup-restore.md`, `docs/runbooks/worker.md`, checklist de mise en production §3 et §5).
- L'en-tête du portail courtier affiche l'identifiant de l'utilisateur au lieu de son nom (constat de la première passe, cosmétique).
