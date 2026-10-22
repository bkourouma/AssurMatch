# Tâches : spec 074

## Phase 1 — Backend
- [x] T001 Contrat `ai-scope-flags.contracts.ts` (clés, schémas, types).
- [x] T002 `AiScopeFlagPolicyService` (rôles, MFA, portée, produit sensible, no-op, audit succès/refus, historique, invalidation cache).
- [x] T003 Politique de mutation : trois clés sensibles (`// Lot 7`) et test de non-régression PATCH/catalogue.
- [x] T004 Tests unitaires du service et de la politique.
- [x] T005 `sendTestWebhook` (flag, signature, politique d'URL, limite de débit, audit, aucune fuite de secret) + contrat + action d'audit.
- [x] T006 Tests unitaires du test webhook (signature vérifiable, flag fermé, SSRF, débit, audit sans secret).
- [x] T007 Câblage runtime et HTTP (`// Lot 7`) + test d'intégration HTTP des trois routes.

## Phase 2 — Back-office admin
- [x] T008 `/partner-integrations` : clés (création avec secret affiché une fois, révocation), endpoints (création, activation/suspension, test), liste d'autorisation (ajout, révocation).
- [x] T009 `/ai-assistance/flags` : tableau pays/produits, formulaire protégé, flags globaux en lecture seule, historique ; lien depuis `/ai-assistance` et la navigation.
- [x] T010 `/messaging` : formulaire d'envoi de test (super admin).
- [x] T011 Tests Playwright « sources » (secrets jamais journalisés ni dans l'URL, libellés, pas de formulation interdite).

## Phase 3 — Validation (chef de lot)
- [x] T012 `npm run typecheck`, `npm run lint`, tests ciblés puis suite complète, `node scripts/ci/secret-scan.mjs`, documentation (runbook feature-flag-toggle, coverage map).
