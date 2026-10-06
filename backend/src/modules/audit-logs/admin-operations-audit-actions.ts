/** Spec 056: audit actions of the admin operations consoles. */
export const ADMIN_OPERATIONS_AUDIT_ACTIONS = {
  accessRefused: "admin_operations.access_refused",
  quoteRequestsListed: "admin_operations.quote_requests_listed",
  quoteRequestViewed: "admin_operations.quote_request_viewed",
  quoteReviewQueueRead: "admin_operations.quote_review_queue_read",
  quoteReviewDecided: "admin_operations.quote_review_decided",
  quoteReviewRefused: "admin_operations.quote_review_refused",
  leadAssignmentsListed: "admin_operations.lead_assignments_listed",
  routingHistoryRead: "admin_operations.routing_history_read",
  auditLogsSearched: "audit_log.searched",
  auditLogsExported: "audit_log.exported",
  auditLogsExportRefused: "audit_log.export_refused",
  contactMessageStatusUpdated: "contact_message.status_updated",
  contactMessageStatusRefused: "contact_message.status_update_refused"
} as const;
