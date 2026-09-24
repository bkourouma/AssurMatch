export const MessagingProviderAuditActions = {
  statusRead: "messaging_provider.status.read",
  statusRefused: "messaging_provider.status.refused",
  dispatched: "messaging.delivery.dispatched",
  dispatchRefused: "messaging.delivery.refused",
  preferencesChanged: "messaging.preferences.changed",
  preferencesRefused: "messaging.preferences.refused",
  inboxRead: "messaging.inbox.read"
} as const;

export type MessagingProviderAuditAction = (typeof MessagingProviderAuditActions)[keyof typeof MessagingProviderAuditActions];
