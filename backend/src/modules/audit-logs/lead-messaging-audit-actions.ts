/**
 * Spec 062: broker <-> visitor messaging and document requests are fully audited (SC-004). Entries
 * carry identifiers, counters and outcomes only: never a message body, a file name, a document
 * request label or note, or a visitor detail.
 */
export const LeadMessagingAuditActions = {
  sent: "lead_message.sent",
  visitorSent: "lead_message.visitor_sent",
  refused: "lead_message.refused",
  read: "lead_message.read",
  attachmentQuarantined: "lead_message.attachment_quarantined",
  attachmentDownloaded: "lead_message.attachment_downloaded",
  attachmentDownloadRefused: "lead_message.attachment_download_refused",
  adminViewed: "lead_messaging.admin_viewed",
  adminViewRefused: "lead_messaging.admin_view_refused",
  documentRequestCreated: "lead_document_request.created",
  documentRequestCancelled: "lead_document_request.cancelled",
  documentRequestFulfilled: "lead_document_request.fulfilled",
  documentRequestRefused: "lead_document_request.refused",
  documentRequestUploadQuarantined: "lead_document_request.upload_quarantined",
  documentRequestDocumentDownloaded: "lead_document_request.document_downloaded",
  documentRequestDocumentDownloadRefused: "lead_document_request.document_download_refused"
} as const;
