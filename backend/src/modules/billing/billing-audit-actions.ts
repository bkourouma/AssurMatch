export const BillingAuditActions = {
  foundationRead: "billing.foundation.read",
  foundationRefused: "billing.foundation.refused",
  accessRefused: "billing.access.refused",
  planPriceChanged: "billing.plan_price.changed",
  packGranted: "billing.lead_pack.granted",
  packConsumed: "billing.lead_pack.consumed",
  packReleased: "billing.lead_pack.released",
  draftComputed: "billing.draft_invoice.computed",
  draftRead: "billing.draft_invoice.read",
  brokerStatementRead: "billing.broker_statement.read",
  // Spec 060 - manual B2B invoicing.
  invoiceIssued: "billing.invoice.issued",
  invoiceIssueRefused: "billing.invoice.issue_refused",
  invoiceRead: "billing.invoice.read",
  invoiceDocumentDownloaded: "billing.invoice.document_downloaded",
  invoiceDocumentRefused: "billing.invoice.document_refused",
  invoiceNotificationFailed: "billing.invoice.notification_failed",
  paymentRecorded: "billing.payment.recorded",
  paymentRefused: "billing.payment.refused",
  creditNoteIssued: "billing.credit_note.issued",
  creditNoteRefused: "billing.credit_note.refused",
  accountRead: "billing.account.read",
  // Spec 063 - lead disputes (CRM-012).
  disputeOpened: "billing.dispute.opened",
  disputeOpenRefused: "billing.dispute.open_refused",
  disputeRead: "billing.dispute.read",
  disputeDecided: "billing.dispute.decided",
  disputeDecisionRefused: "billing.dispute.decision_refused",
  disputeCreditNoteIssued: "billing.dispute.credit_note_issued",
  disputeNotificationFailed: "billing.dispute.notification_failed"
} as const;

export type BillingAuditAction = (typeof BillingAuditActions)[keyof typeof BillingAuditActions];
