# Tasks - Spec 075

- [x] T0 Spec/plan/tasks, schema.prisma et migration 0037 (+ rollback.sql), liste de migrations du test (superviseur).
- [ ] T1 (A) Anneau de cles, vault, index aveugle, adaptateurs Prospect + QuoteRequest.payload, lectures croisees (lead-assignments, retention/effacement), validation d'env prod, backfill idempotent (+ `--decrypt`), rotation, runbooks. Tests : round-trip, rotation, index aveugle, transition en clair, non-fuite logs.
- [ ] T2 (B) Echec d'audit non silencieux (outbox, compteur, health), writeAsync sur actions sensibles, HMAC d'integrite, script de verification, runbook. Tests.
- [ ] T3 (C) Rate limit Redis API partenaire (+ fallback), headers, 429, metriques. Tests.
- [ ] T4 (D, E) Flag produit assistants courtier, detecteur de donnees sensibles, garde du prompt final. Tests.
- [ ] T5 (F, G) global-error x3 (FR/EN), sitemap + coherence robots. Tests.
- [ ] T6 Integration : merge `orch/2026-10-21-ecarts-prd`, typecheck, lint, suite complete.
