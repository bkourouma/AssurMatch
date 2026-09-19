# Implementation Plan: Messaging Channels, In-App Notifications And Preferences

**Spec**: `specs/038-messaging-channels-preferences/spec.md`
**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Broker Back-office, Back-office Plateforme.

1. Contracts: channels, delivery, preferences, in-app notification, test dispatch.
2. Prisma models + migration `0013_messaging_channels` + migrations test; repository (memory/Prisma).
3. `MessagingProviderPort` + `LoggingMessagingProvider`; `MessagingDispatchService` with flag, provider and opt-in gates.
4. `NotificationPreferencesService` and `InAppNotificationsService`.
5. Extend `MessagingProviderService.status` with the real capability; admin test dispatch.
6. Runtime + HTTP wiring (broker inbox/preferences, admin test).
7. Broker inbox and preferences UI, admin operations panel; source tests.
8. Runtime HTTP tests; `npm run validate`.
