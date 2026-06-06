export const MessagingProviderAuditActions = {
  statusRead: "messaging_provider.status.read",
  statusRefused: "messaging_provider.status.refused"
} as const;

export type MessagingProviderAuditAction = (typeof MessagingProviderAuditActions)[keyof typeof MessagingProviderAuditActions];
