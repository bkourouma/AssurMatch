# Tâches : Lot 1 — correctifs critiques (063)

Légende : `[ ]` à faire · `[x]` terminé. Propriétaires d'écriture : BE-A (backend auth), BE-B (backend contestations), UI-A (écrans auth des deux apps), UI-B (écrans contestations), PUB (public), LEAD (flags, docs, contrats, migration).

## Phase 0 — Spec Kit et fondations (LEAD)

- [x] T001 `spec.md`, `plan.md`, `tasks.md`
- [x] T002 Schéma Prisma + migration `0030_critical_fixes` + `prisma generate` / `validate`
- [x] T003 Contrats partagés (`auth`, `lead-disputes`, `quote`, `billing`, `error-codes`), actions d'audit, permissions RBAC

## Phase 1 — A : MFA et appareils de confiance

- [x] T010 [BE-A] Dépôt `TrustedDevicesRepository` (mémoire + Prisma) et `TrustedDeviceService` (jeton 256 bits haché, 30 j, plafond 10, audit)
- [x] T011 [BE-A] `AuthService.login` : plus de `mfaVerified` issu du seul mot de passe ; jeton d'appareil valide requis ; `trustedDeviceRejected`
- [x] T012 [BE-A] `verifyMfa` + `trustDevice` ; `enrollMfa` refusé sans MFA si déjà enrôlé ; `me.mfaEnrolled`
- [x] T013 [BE-A] Révocation dans `UsersService` (mot de passe, activation, reset MFA, ré-enrôlement, verrouillage, suspension, suppression, désactivation membre) ; routes `GET` / `DELETE /auth/trusted-devices`
- [x] T014 [BE-A] Revue de tous les usages de `mfaVerified` (guards, `http-auth.guard.ts`, services, `dev-demo-login`) : aucun contournement restant
- [x] T015 [BE-A] Tests unitaires + intégration HTTP (cas interdits : expiré, révoqué, autre utilisateur, mot de passe faux, enrôlement sans MFA)
- [x] T016 [UI-A] Admin et courtier : server actions login / verify (cookie `assurmatch_<app>_device`, httpOnly, Strict, 30 j), case « Faire confiance à cet appareil pendant 30 jours », écran MFA sans enrôlement si déjà enrôlé
- [x] T017 [UI-A] Pages « Sécurité du compte » (liste + « Révoquer tous les appareils ») dans les deux apps ; navigation
- [x] T018 [UI-A] Tests des apps (`apps/*/tests`) ; helpers E2E `tests/e2e/support/backoffice.ts` adaptés

## Phase 2 — B : contestations de bout en bout

- [x] T020 [BE-B] `LeadDisputesService` + dépôt étendu (mémoire + Prisma) : ouverture (fenêtre 30 j, unicité), liste / détail admin, décision, vue courtier
- [x] T021 [BE-B] Starter `dispute` et CRM `addDispute` délèguent au service ; `disputeWindow` / `dispute` dans les détails Starter et CRM
- [x] T022 [BE-B] `InvoicingService` : avoir partiel de contestation (idempotent), paiement plafonné au reste net, annulation sur reste net ; `DraftInvoiceService` : crédit brouillon uniquement en mode `draft_invoice`
- [x] T023 [BE-B] Routes admin (blocs `// Spec 063`), route `GET /broker/billing/disputes`, RBAC, MFA, `billing_enabled`
- [x] T024 [BE-B] Notifications (in-app + e-mail pointeur sans contenu de lead), audits
- [x] T025 [BE-B] Tests unitaires, intégration HTTP, RBAC, tenant, bout en bout contestation → avoir
- [x] T026 [UI-B] Admin : onglet « Contestations » dans `/billing` (liste filtrée, détail, décision avec motif)
- [x] T027 [UI-B] Courtier : « Contester » dans le détail CRM Pro ; statut / décision sur les détails Starter et Pro ; section « Contestations » dans `/billing`
- [x] T028 [UI-B] Tests des apps (sources, vocabulaire, absence de formulations interdites)

## Phase 3 — C : assistant IA visiteur

- [x] T030 [PUB] `quote-form.tsx` transmet les réponses courantes aux deux assistants (sans contact ni consentement)
- [x] T031 [PUB] Test : le corps envoyé contient les réponses et aucun champ de contact

## Phase 4 — D : flags par défaut

- [x] T040 [LEAD] `default-flags.ts`, `feature-flags.defaults.json`, seed (pas d'écrasement), `.env*.example`
- [x] T041 [LEAD] `docs/go-live/checklist-mise-en-production.md` (3 flags activés par défaut, comment les couper, environnements existants)
- [x] T042 [LEAD] Tests supposant `false` réécrits ; test de défauts + coupure explicite

## Phase 5 — E : documentation et validation

- [x] T050 [LEAD] `docs/prd_coverage_map.md` : lignes touchées
- [x] T051 [LEAD] Revues parallèles (sécurité / constitution, QA)
- [x] T052 [LEAD] Validations finales : `typecheck`, `lint`, `NODE_ENV=test npm run test`, `npm run test:web`, `prisma validate`, `secret-scan`
- [x] T053 [LEAD] Rapport final (décisions, DÉCISION À CONFIRMER, helpers E2E)
