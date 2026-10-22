# Tâches : spec 074

## Phase 1 — Backend
- [ ] T001 Contrat `ai-scope-flags.contracts.ts` (clés, schémas, types).
- [ ] T002 `AiScopeFlagPolicyService` (rôles, MFA, portée, produit sensible, no-op, audit succès/refus, historique, invalidation cache).
- [ ] T003 Politique de mutation : trois clés sensibles (`// Lot 7`) et test de non-régression PATCH/catalogue.
- [ ] T004 Tests unitaires du service et de la politique.
- [ ] T005 `sendTestWebhook` (flag, signature, politique d'URL, limite de débit, audit, aucune fuite de secret) + contrat + action d'audit.
- [ ] T006 Tests unitaires du test webhook (signature vérifiable, flag fermé, SSRF, débit, audit sans secret).
- [ ] T007 Câblage runtime et HTTP (`// Lot 7`) + test d'intégration HTTP des trois routes.

## Phase 2 — Back-office admin
- [ ] T008 `/partner-integrations` : clés (création avec secret affiché une fois, révocation), endpoints (création, activation/suspension, test), liste d'autorisation (ajout, révocation).
- [ ] T009 `/ai-assistance/flags` : tableau pays/produits, formulaire protégé, flags globaux en lecture seule, historique ; lien depuis `/ai-assistance` et la navigation.
- [ ] T010 `/messaging` : formulaire d'envoi de test (super admin).
- [ ] T011 Tests Playwright « sources » (secrets jamais journalisés ni dans l'URL, libellés, pas de formulation interdite).

## Phase 3 — Validation (chef de lot)
- [ ] T012 `npm run typecheck`, `npm run lint`, tests ciblés puis suite complète, `node scripts/ci/secret-scan.mjs`, documentation (runbook feature-flag-toggle, coverage map).
