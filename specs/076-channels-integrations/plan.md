# Implementation Plan: Channels and Integrations

**Spec**: `specs/076-channels-integrations/spec.md`
**Impacted surfaces**: Backend API, notification worker, shared packages, database (migration 0040), env examples.

Design: plug into the existing `MessagingDispatchService` (port `MessagingProviderPort`) and reuse the partner webhook primitives (`signWebhookPayload`, URL policy, origin allow-list, `EncryptionService`) by import only. The lot 7 files (webhook and API key UI) are untouched.

1. Prisma: `ChannelOutbox`, `CrmConnector`, `CrmConnectorDelivery` + migration `0040_channels_integrations` (additive); migration test.
2. Flag `crm_connector_enabled` (default false, sensitive, policy-activatable only).
3. Adapters: `providers/http-sms-provider.ts`, `whatsapp-cloud-provider.ts`, `messaging-provider-env.ts` (fetch injectable).
4. Dispatcher: retry outbox (`claimOutbox` lease against double send), `processDueOutbox`, `listOutbox`, audit actions, contracts.
5. CRM connector module (`modules/crm-connector`), contracts, repository (memory + Prisma), `publish` hooked to the lead event bus, `processDue`.
6. Runtime wiring, HTTP controllers (`channels-integrations-http.controllers.ts`), worker tasks `channel-outbox` and `crm-connector`, env examples.
7. Tests: unit (providers, outbox, CRM), runtime HTTP integration with simulated providers, migration test; typecheck, lint, full suite.
