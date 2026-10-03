/**
 * Spec 055: the broker response loop is fully audited (SC-004). Entries carry identifiers and
 * outcomes only: never the proposal text, the visitor's question, a contact detail or a token.
 */
export const LeadProposalAuditActions = {
  sent: "lead_proposal.sent",
  sendRefused: "lead_proposal.send_refused",
  withdrawn: "lead_proposal.withdrawn",
  withdrawRefused: "lead_proposal.withdraw_refused",
  viewedByVisitor: "lead_proposal.viewed_by_visitor",
  documentQuarantined: "lead_proposal.document_quarantined",
  documentDownloaded: "lead_proposal.document_downloaded",
  documentDownloadRefused: "lead_proposal.document_download_refused",
  visitorResponded: "lead_proposal.visitor_responded",
  visitorResponseRefused: "lead_proposal.visitor_response_refused",
  contactRevealed: "broker_lead.contact_revealed",
  contactMasked: "broker_lead.contact_masked",
  leadDocumentUploaded: "broker_lead_document.uploaded",
  leadDocumentUploadRefused: "broker_lead_document.upload_refused",
  leadDocumentQuarantined: "broker_lead_document.quarantined",
  leadDocumentDownloaded: "broker_lead_document.downloaded",
  leadDocumentDownloadRefused: "broker_lead_document.download_refused"
} as const;
