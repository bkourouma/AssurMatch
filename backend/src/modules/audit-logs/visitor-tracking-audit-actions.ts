/**
 * Spec 054 FR-014: every issue, resend, opening and refusal of a visitor link is audited. The
 * entries carry identifiers only (request id, reference), never the e-mail, the token or its hash.
 */
export const VisitorTrackingAuditActions = {
  tokenIssued: "visitor_access.token_issued",
  tokenRevoked: "visitor_access.token_revoked",
  accessDenied: "visitor_access.denied",
  spaceOpened: "visitor_access.space_opened",
  trackingLinkRequested: "visitor_access.tracking_link_requested",
  trackingLinkRefused: "visitor_access.tracking_link_refused",
  visitorNotificationQueued: "visitor_notification.queued",
  visitorNotificationSkipped: "visitor_notification.skipped"
} as const;
