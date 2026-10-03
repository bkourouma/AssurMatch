---
description: "Task list for 054 — Espace de suivi visiteur et notifications"
---

# Tasks: 054

**Continuous Workflow**: Eligible (spec validée le 2026-10-03).

**Tests** : obligatoires pour l'accès par jeton (valide, faux, expiré, révoqué, ancien jeton avant et après la bascule), les réponses neutres, les limites de débit, la projection de statut (aucun statut interne), les notifications par étape (idempotence, langue, revue manuelle), la garde de formulations, l'enquête (jeton réel) et la séparation des applications.

## Phase 1: Setup
- [x] T001 `packages/shared/contracts/public-quote-status.ts` (projection pure + types de vue), contrats de suivi et de renvoi, nouveaux types de notification (`ops.contracts.ts`), codes d'erreur (`VISITOR_ACCESS_DENIED`).
- [x] T002 Schéma + migration 0023 (`VisitorAccessToken`, valeurs de `NotificationType`, `Notification.dedupeKey` et `eventPayload`) + `prisma-migrations.spec.ts`.

## Phase 2: Backend
- [x] T003 [US1] `VisitorAccessService` : émission, vérification en temps constant, TTL, révocation, bascule des anciens jetons, audit. Brancher toutes les routes visiteur (statut, documents, retrait) et l'émission à la soumission.
- [x] T004 [US1] `GET /quote-requests/:ref` : statut public projeté, courtiers nommés, chronologie, limite de débit, 404 neutre ; la soumission renvoie un vrai `brokerName` quand une affectation existe.
- [x] T005 [US2] `POST /quote-requests/tracking-link` : abus (`tracking_link_resend`), limite par référence, comparaison de l'empreinte de l'e-mail, 202 neutre, mise en file.
- [x] T006 [US3] Évènements de lead (`lead.accepted`, `lead.rejected`, `lead.reassigned`), filtre des types transmis aux webhooks, `VisitorQuoteNotifier` (abonné), notifications idempotentes (`dedupeKey`), statuts CRM déclencheurs limités.
- [x] T007 [US3][US4] Worker et gabarits : rendu FR/EN par type, lien localisé avec jeton émis au rendu, revue manuelle distincte, retrait confirmé une seule fois, garde de formulations ; `EmailPurpose`.
- [x] T008 [US5] Enquête : jeton émis au rendu (rotation), langue lue sur `QuoteRequest.language`, chemins `/avis` et `/en/feedback`.
- [x] T009 [P] Tests unitaires et d'intégration (couvrant la ligne « Tests » ci-dessus) ; tests existants verts (adapter les attentes sur le lien sans jeton, le message de revue manuelle et le jeton d'enquête factice).

## Phase 3: Site public
- [x] T010 [US1] Espace de suivi dynamique (statut, courtiers, chronologie, documents, retrait, jeton expiré qui renvoie vers le renvoi de lien).
- [x] T011 [US2] Page `/suivi` et `/en/track` (formulaire de renvoi de lien, réponse neutre, pot de miel).
- [x] T012 [US5] Pages `/avis/[ref]` et `/en/feedback/[ref]`.
- [x] T013 En-têtes `Referrer-Policy: no-referrer` et `X-Robots-Tag` sur les pages de suivi, d'avis et de renvoi ; `robots.ts` ; chemins localisés dans `i18n/routing.ts` ; messages FR et EN avec parité des clés ; tests de marqueurs.

## Phase 4: Validations
- [ ] T014 Validations finales : `prisma generate` et `validate`, typecheck, lint, `npm run test`, `npm run test:web`, scan de secrets, build public.
- [ ] T015 Carte de couverture et tâches cochées.
