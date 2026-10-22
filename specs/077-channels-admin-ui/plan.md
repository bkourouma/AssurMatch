# Plan 077: channels and CRM connector admin screens + dead-letter alert

Surfaces: Backend API, Back-office Plateforme/Admin, shared contract (admin alerts). No migration.

## Design

- Backend: add `channel_dead_letter` to `ADMIN_ALERT_TYPES` and `ADMIN_ALERT_LABELS` (`packages/shared/contracts/admin-alerts.contracts.ts`). `MessagingDispatchService` gets `setDeadLetterHook(hook)` (the dispatcher is built before `AdminAlertsService` in the runtime, so the hook is attached afterwards). `AssurMatchRuntime` attaches it in a `// Lot 12` block placed after `adminAlerts`, calling `adminAlerts.raise(...)` and swallowing rejections.
- Admin app: server pages `apps/admin/app/channels/page.tsx` and `apps/admin/app/crm-connectors/page.tsx` (session guard like `ai-assistance/flags`), readers in `apps/admin/app/lib/channels-api.ts` and `apps/admin/app/lib/crm-connector-api.ts` (local `readAdmin`-style, no edit of the shared `admin-api.ts`), server actions in `apps/admin/app/lib/crm-connector-actions.ts` (pattern of `partner-integration-actions.ts`: secret only in the returned state), client forms in `apps/admin/app/crm-connectors/crm-forms.tsx` (SecretReveal pattern).
- Shell: two menu entries in a `// Lot 12` block of `admin-shell.tsx`.
- Tests: `backend/tests/unit/notifications/channel-dead-letter-alert.spec.ts`, `backend/tests/integration/channels/channels-dead-letter-alert-http.spec.ts`, `apps/admin/tests/channels-admin.spec.ts`, `apps/admin/tests/crm-connectors-admin.spec.ts`.

## File ownership (parallel tasks)

T1 backend alert; T2 Channels screen; T3 CRM screen; T4 (supervisor) specs, shell entries, final integration.
