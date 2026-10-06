export const PUBLIC_SITE_AUDIT_ACTIONS = {
  waitlistSubscribed: "waitlist.subscribed",
  waitlistDuplicateIgnored: "waitlist.duplicate_ignored",
  waitlistRefused: "waitlist.refused",
  partnerApplicationReceived: "partner_application.received",
  partnerApplicationRefused: "partner_application.refused",
  partnerApplicationDuplicateIgnored: "partner_application.duplicate_ignored",
  partnerApplicationAdminListed: "partner_application.admin_listed",
  /** Spec 051 R10: back-office decisions on an application. */
  partnerApplicationAdminViewed: "partner_application.admin_viewed",
  partnerApplicationReviewStarted: "partner_application.review_started",
  partnerApplicationConverted: "partner_application.converted",
  partnerApplicationRejected: "partner_application.rejected",
  partnerApplicationDecisionRefused: "partner_application.decision_refused",
  partnerApplicationDecisionNotified: "partner_application.decision_notified",
  contactMessageReceived: "contact_message.received",
  contactMessageRefused: "contact_message.refused",
  contactMessageAdminListed: "contact_message.admin_listed",
  publicPartnerListed: "public_partner.listed",
  publicPartnerExposed: "public_partner.exposed",
  publicPartnerRefused: "public_partner.refused",
  publicInsurersListed: "public_insurers.listed",
  publicPlansListed: "public_plans.listed",
  consentWithdrawnByVisitor: "consent.withdrawn_by_visitor",
  quoteRequestCancelledByVisitor: "quote_request.cancelled_by_visitor",
  leadAssignmentClosedConsentWithdrawn: "lead_assignment.closed_consent_withdrawn"
} as const;

export type PublicSiteAuditAction = (typeof PUBLIC_SITE_AUDIT_ACTIONS)[keyof typeof PUBLIC_SITE_AUDIT_ACTIONS];
