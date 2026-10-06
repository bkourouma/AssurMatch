# Tâches : notifications courtier/admin restantes et rappels d'expiration (spec 061)

**Spec** : `spec.md` — **Plan** : `plan.md` — **Recherche** : `research.md`

## Phase 1 — Contrats et données

- [x] T001 Contrats partagés : `admin-alerts.contracts.ts` (types, libellés FR, vue, requête, acquittement, jeton de désinscription) ; `ops.contracts.ts` (types `broker_*` et `admin_alert_raised`).
- [x] T002 Prisma : 7 valeurs `NotificationType` (dont `broker_document_received` manquante), modèles `AdminAlert`, `WorkerHeartbeat`, `NotificationUnsubscribe` ; migration `0028_notifications_completion` ; `prisma-migrations.spec.ts`.

## Phase 2 — Backend (FR-001 à FR-003)

- [x] T003 `BrokerAlertNotifier` : dedupeKey persistée, in-app toujours, e-mail pointeur, SMS/WhatsApp sur opt-in, audit, isolation tenant.
- [x] T004 Gabarits e-mail `brokerAlert` et `adminAlert` (garde de formulations), variante « lead réaffecté », rendu dans `QuoteNotificationDeliveryService`.
- [x] T005 `AdminAlertsService` + dépôts : raise idempotent (ouverte / en cours / doublon, `daily` ou `once`), liste RBAC, acquittement MFA + motif + audit, e-mail conformité, contrôle `worker_stale`.
- [x] T006 `ScheduledAlertsService` + `RuntimeScheduledAlertSources` : licences J-60/J-30/J-7, offres J-15 et expirées, tâches et rappels CRM, quota 80/100 %, pays sans courtier, leads non routés 24 h, taux de litige ; seuils par variables d'environnement ; sections isolées.
- [x] T007 CRM : `openTasksDueBetween`, `remindersDueBetween` (mémoire et Prisma).
- [x] T008 Événements : réaffectation → `broker_lead_reassigned` (+ canaux optionnels) ; document visiteur → alerte courtier.
- [x] T009 Spec 052 R9 : suppression des rappels `offer_expiring` créés à la lecture des listes (admin et courtier).
- [x] T010 Worker : tâche `scheduled-alerts` (`runIfDue`), battement en base `WorkerHeartbeat`.
- [x] T011 Câblage runtime et routes HTTP `/admin/alerts`, `/admin/alerts/:id/acknowledge`, `/notifications/unsubscribe`.

## Phase 3 — Désinscription (FR-005)

- [x] T012 `SurveyUnsubscribeService` : jeton HMAC (clé dédiée ou dérivée), empreinte SHA-256, registre idempotent, 404 neutre.
- [x] T013 E-mail d'enquête FR/EN avec lien `/desinscription` – `/en/unsubscribe` ; drain qui saute les adresses désinscrites.
- [x] T014 Page publique de confirmation FR/EN (bouton de confirmation, noindex, no-referrer, robots), messages, routage.

## Phase 4 — Back-office (FR-004)

- [x] T015 Centre d'alertes sur `/dashboard/compliance-alerts` : filtre ouvertes/acquittées/toutes, gravité, détails, acquittement par action serveur avec motif.

## Phase 5 — Tests et validation (FR-006)

- [x] T016 Unitaires : seuils, idempotence, réarmement de licence, offres, CRM, quota, alertes admin, préférences, isolation, intervalle, échec d'une section, acquittement, worker inactif, e-mail conformité.
- [x] T017 Unitaires désinscription : signature, falsification, clé absente en production, lien FR/EN, drain, idempotence, audit sans adresse.
- [x] T018 Intégration HTTP : centre d'alertes (401/403/400/404/409/200, audit), e-mails pointeurs, désinscription publique ; réaffectation, document reçu, offres J-15 via la tâche planifiée.
- [x] T019 Playwright (sources) admin et public.
- [x] T020 Validations : typecheck, lint, vitest complet, Playwright admin/public/broker, `next build` admin et public, scan de secrets.

## Notes d'implémentation

- **20/20 tâches terminées.**
- Migration `0028_notifications_completion` (numéro suivant 0027 ; à réaligner à la fusion si une autre branche en ajoute une).
- L'e-mail reste un canal de base non désactivable (spec 038) : « selon ses préférences » s'applique aux canaux SMS/WhatsApp (research R4).
- Les packs de leads (spec 060) ne sont pas comptés dans le quota mensuel de routage (research R7).
