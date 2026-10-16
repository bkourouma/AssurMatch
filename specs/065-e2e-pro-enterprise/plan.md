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
