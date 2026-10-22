export const MessagingProviderAuditActions = {
  statusRead: "messaging_provider.status.read",
  statusRefused: "messaging_provider.status.refused",
  dispatched: "messaging.delivery.dispatched",
  dispatchRefused: "messaging.delivery.refused",
  preferencesChanged: "messaging.preferences.changed",
  preferencesRefused: "messaging.preferences.refused",
  inboxRead: "messaging.inbox.read",
  // Lot 10 (spec 076): durable retries of optional-channel messages.
  retryScheduled: "messaging.delivery.retry_scheduled",
  failed: "messaging.delivery.failed",
  retried: "messaging.delivery.retried",
  deadLettered: "messaging.delivery.dead_letter",
  cancelled: "messaging.delivery.cancelled",
  outboxListed: "messaging.outbox.listed"
} as const;

export type MessagingProviderAuditAction = (typeof MessagingProviderAuditActions)[keyof typeof MessagingProviderAuditActions];
