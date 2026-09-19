export const BillingAuditActions = {
  foundationRead: "billing.foundation.read",
  foundationRefused: "billing.foundation.refused",
  accessRefused: "billing.access.refused",
  planPriceChanged: "billing.plan_price.changed",
  packGranted: "billing.lead_pack.granted",
  packConsumed: "billing.lead_pack.consumed",
  draftComputed: "billing.draft_invoice.computed",
  draftRead: "billing.draft_invoice.read",
  brokerStatementRead: "billing.broker_statement.read"
} as const;

export type BillingAuditAction = (typeof BillingAuditActions)[keyof typeof BillingAuditActions];
