/**
 * Spec 062 (D-10): visitor data-subject requests are fully audited. Entries carry the request
 * identifier, reference, type, status and outcome only: never the visitor's free-text detail, the
 * decision note, an e-mail address or a token.
 */
export const DataRequestAuditActions = {
  created: "data_request.created",
  taken: "data_request.taken",
  completed: "data_request.completed",
  rejected: "data_request.rejected",
  erasureStarted: "data_request.erasure_started",
  refused: "data_request.refused",
  acknowledged: "data_request.acknowledged",
  adminViewed: "data_request.admin_viewed"
} as const;
