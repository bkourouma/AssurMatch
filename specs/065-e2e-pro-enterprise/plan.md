# Plan: 065 — Parcours E2E Pro / Enterprise

**Spec** : `specs/065-e2e-pro-enterprise/spec.md`. **Constitution** : III (applications séparées : un contexte navigateur par app), II (consentement nommé), IV (isolation, MFA), IX (tests), XI (aucune activation sensible : les flags IA restent fermés).

## Surfaces impactées
- Tests : `tests/e2e/` (nouveaux fichiers et utilitaires), `playwright.e2e.config.ts`.
- CI : aucun changement du job `e2e` (il lance déjà `npm run test:e2e:stack`, donc tous les projets).
- Docs : cette spec. Aucun code produit, aucune migration.

## Architecture
1. **Utilitaires partagés** (`tests/e2e/support/world.ts`, `journey-state.ts`, `partners.ts`) : `onboardBrokerDirect` accepte un plan et une durée de licence ; `provisionBroker` (admin → courtier actif → propriétaire activé), `inviteMember` (équipe), `publishOffer` (offre CI × Auto validée par la conformité), `requestQuote` (devis visiteur avec consentement nommé), état « monde » (`worlds.<clé>`) persistant dans `.local/e2e/journey-state.json`.
2. **Projets Playwright** : `pro-enterprise` (dépend de `scenario`) pour `pro-*.spec.ts`, `enterprise-agencies-sla.spec.ts`, `forbidden-cases-pro.spec.ts` ; `senegal` (dépend de `backoffice`, donc après SC-09a) pour `senegal-opening.spec.ts`.
3. **Fichiers** : `pro-01-setup` (CRM activé, firme Pro, équipe agent + lecture seule, offre, 4 leads) ; `pro-02-crm` ; `pro-03-roles` ; `pro-04-ai-disabled` ; `enterprise-agencies-sla` ; `forbidden-cases-pro` ; `senegal-opening`.
4. **Un seul worker**, parcours séquentiels (état partagé), chaque fichier crée ses propres courtiers pour ne pas dépendre de l'ordre des autres.

## Décisions
- D1 : pas de seed démo ; les courtiers sont créés par le chemin admin direct (SC-02 alternatif), plus court que la candidature publique.
- D2 : les flags IA sont sensibles (pas de bascule UI) : ils restent fermés par défaut, le parcours IA le vérifie plutôt que de les manipuler.
- D3 : les défauts produits sont consignés dans le rapport de lot, pas corrigés.

## Résultats de la phase A
- 65 tests verts (existants 22 + nouveaux 43) sur pile vierge, 14,2 min de Playwright.
- Constats produit (non corrigés ici) : voir le rapport de lot — numéro de téléphone partagé entre deux visiteurs (profil visiteur réutilisé, e-mails envoyés à la première adresse) ; le middleware du courtier renvoie un Starter sur `/login?error=starter_crm_denied` pour `/crm/*` (sauf `/crm`) ; les offres d'un pays pilote ne sont publiques qu'avec `country_public_enabled` ; pas d'écran de modification d'agence ; une licence ne peut pas être antidatée par les écrans (l'exclusion est prouvée par la suspension, même règle `license_not_valid_for_scope`).
- Environnement Windows / Docker Desktop : `docker-compose.e2e.desktop.yml` + `ASSURMATCH_E2E_COMPOSE_OVERRIDE`, `--apps=host`, `E2E_BROWSER_CHANNEL=chrome` ; les scripts `.sh` du Dockerfile exigent un checkout LF (le mode `--apps=docker` est réservé à Linux / CI).

## Résultats de la phase B (branche d'intégration recos 1-4)
- Projet Playwright `recos` (`recos-*.spec.ts`, dépend de `scenario`) : 062 messagerie (MSG-00..05), 062 demande de données et réaffectation (DR-01..14), 063 MFA et contestations (MFA-01..04, DSP-00..05), 064 capacités branchées (W064-00..06).
- Suite complète : 103 tests verts en 25,4 min sur pile vierge (mode `--apps=host`, Docker Desktop / Windows).
- Rappel d'exécution : la limite de 5 demandes de données par IP et par heure est partagée par tout le fichier DR ; une relance sur pile conservée ne passe qu'une fois par heure.
