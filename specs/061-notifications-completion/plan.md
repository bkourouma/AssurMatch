# Plan d'implémentation : notifications courtier/admin restantes et rappels d'expiration (spec 061)

**Spec** : `specs/061-notifications-completion/spec.md` — **Recherche** : `research.md`
**Dépendances** : spec 038 (in-app, préférences de canal), spec 051 (licences), spec 052 (offres, R9 remplacée), spec 054 (dedupeKey, enquête), spec 055, spec 057 (worker), spec 060 (quota/packs, lecture seule).

## Surfaces impactées

- **Backend API** : `backend/src/modules/notifications/*` (notificateur courtier, centre d'alertes admin, tâche planifiée et sources), `satisfaction-surveys/*` (désinscription), `offers/*` (suppression des rappels à la lecture), `quote-documents`, `quote-requests`, `leads/crm-activity.repository.ts`, `http-wiring`, `runtime/assurmatch-runtime.ts`.
- **Runtime / worker** : `scripts/worker/assurmatch-worker.ts` (tâche `scheduled-alerts`, battement en base).
- **Shared packages** : `packages/shared/contracts/admin-alerts.contracts.ts`, `ops.contracts.ts` (types de notification).
- **Base de données** : `backend/prisma/schema.prisma`, migration `0028_notifications_completion` (7 valeurs d'enum, tables `AdminAlert`, `WorkerHeartbeat`, `NotificationUnsubscribe`), additive.
- **Back-office Plateforme** : `apps/admin/app/dashboard/compliance-alerts/page.tsx` (centre d'alertes + acquittement), `lib/alert-actions.ts`, `lib/admin-api.ts`.
- **Web Publique Client** : page `/desinscription` – `/en/unsubscribe`, formulaire client, `public-api.ts`, routage, messages FR/EN, en-têtes no-referrer/noindex, `robots.ts`.
- **Broker Back-office** : aucun changement de code ; la boîte de réception et les préférences existantes (spec 038) affichent les nouveaux types.

Les parcours publics et authentifiés restent séparés : la page de désinscription n'importe aucun code back-office et n'appelle qu'un endpoint public sans authentification.

## Architecture

```
worker (spec 057) ── cycle ──▶ ScheduledAlertsService.runIfDue()  (≤ 1 fois / intervalle)
                                  │ sources (RuntimeScheduledAlertSources : ids, dates, compteurs)
                                  ├─▶ BrokerAlertNotifier.notify()  ── Notification(dedupeKey unique, e-mail pointeur)
                                  │                                  ├─ publishInApp (toujours)
                                  │                                  └─ SMS/WhatsApp si opt-in (dispatcher spec 038)
                                  └─▶ AdminAlertsService.raise()    ── AdminAlert(conditionKey, dedupeKey unique)
                                                                     └─ Notification admin_alert_raised (si e-mail conformité)
worker heartbeat ──▶ WorkerHeartbeat ◀── AdminAlertsService.list() (worker_stale)
QuoteNotificationDeliveryService ── rend broker_* / admin_alert_raised (pointeurs, garde de formulations)
SatisfactionSurveysDrain ── lien signé /desinscription ; saute les adresses désinscrites
POST /notifications/unsubscribe ── SurveyUnsubscribeService (HMAC, empreinte SHA-256)
```

### Modules backend

| Fichier | Rôle |
|---|---|
| `notifications/broker-alert-notifier.ts` | Sortie unique des alertes courtier : idempotence `dedupeKey`, in-app, e-mail pointeur, canaux optionnels, audit. |
| `notifications/admin-alerts.repository.ts` | Dépôts mémoire/Prisma `AdminAlert` et `WorkerHeartbeat`. |
| `notifications/admin-alerts.service.ts` | `raise` (ouverte/en cours/doublon), `list` (RBAC, contrôle du worker), `acknowledge` (MFA, rôle, motif, audit), e-mail conformité. |
| `notifications/scheduled-alerts.service.ts` | Tâche planifiée : licences, offres, tâches/rappels CRM, quotas, pays, leads non routés, litiges ; configuration par variables d'environnement. |
| `notifications/scheduled-alert-sources.ts` | Lecture des services runtime (mémoire et PostgreSQL). |
| `satisfaction-surveys/survey-unsubscribe.service.ts` | Jeton signé, registre de désinscription, cas d'usage public. |

### API HTTP

- `GET /admin/alerts?status=open|acknowledged|all&type=` (authentifié, rôles admin) → `{ items, open }`.
- `POST /admin/alerts/:id/acknowledge` `{ reason }` (MFA, `super_admin` / `compliance_admin`) → 200, 403, 404, 409.
- `POST /notifications/unsubscribe` `{ token }` (public) → 200 `{ status: "unsubscribed", locale }` ou 404 neutre.

### Variables d'environnement

`ASSURMATCH_SCHEDULED_ALERTS_ENABLED`, `ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES`, `ASSURMATCH_ALERT_LICENSE_DAYS`, `ASSURMATCH_ALERT_OFFER_DAYS`, `ASSURMATCH_ALERT_OFFER_EXPIRED_LOOKBACK_DAYS`, `ASSURMATCH_ALERT_TASK_LOOKAHEAD_HOURS`, `ASSURMATCH_ALERT_TASK_LOOKBACK_DAYS`, `ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT`, `ASSURMATCH_ALERT_UNROUTED_LEADS_24H`, `ASSURMATCH_ALERT_DISPUTE_RATE_PERCENT`, `ASSURMATCH_ALERT_DISPUTE_MIN_LEADS`, `ASSURMATCH_ALERT_DISPUTE_WINDOW_DAYS`, `ASSURMATCH_WORKER_STALE_MINUTES`, `ASSURMATCH_COMPLIANCE_ALERT_EMAIL`, `ASSURMATCH_UNSUBSCRIBE_SECRET`.

## Impacts transverses

- **Sécurité** : isolation par tenant (in-app, e-mail et préférences résolus depuis `partnerTenantId`) ; acquittement MFA + rôle ; jeton de désinscription HMAC, comparaison à temps constant, 404 neutre ; aucune donnée de prospect dans les e-mails ni dans les alertes.
- **Conformité** : garde de formulations sur tous les rendus ; mention « notification opérationnelle, aucun engagement contractuel » ; seul le message non transactionnel (enquête) est désinscriptible.
- **Données** : migration additive ; empreinte SHA-256 de l'adresse seulement ; alertes = identifiants et compteurs.
- **Feature flags** : aucun nouveau flag ; SMS/WhatsApp restent soumis à `sms_enabled` / `whatsapp_enabled`.
- **IA / Routage** : aucun changement de routage ; lecture seule du quota et des statuts.
- **Audit** : `broker_alert.queued`, `admin_alert.raised|listed|acknowledged|access_refused`, `notification.unsubscribed|unsubscribe_refused`, `satisfaction_survey.skipped` (`visitor_unsubscribed`).

## Validation

typecheck, lint, vitest complet, Playwright (configuration temporaire) admin/public/broker, `next build` admin et public, scan de secrets.
