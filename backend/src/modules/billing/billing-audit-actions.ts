export const BillingAuditActions = {
  foundationRead: "billing.foundation.read",
  foundationRefused: "billing.foundation.refused"
} as const;

export type BillingAuditAction = (typeof BillingAuditActions)[keyof typeof BillingAuditActions];
