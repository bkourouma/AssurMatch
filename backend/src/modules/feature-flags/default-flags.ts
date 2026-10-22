export const GLOBAL_FEATURE_FLAG_DEFAULTS = {
  public_comparator_enabled: false,
  quote_request_enabled: false,
  /**
   * Spec 063 (PRD section 9.1): the three broker back-office modules are ON by default. They are not
   * regulated modules: Starter keeps no CRM through its plan gating, and an admin can still switch
   * them off from the feature flags screen (audited). Existing rows in an initialised database are
   * never rewritten by the seeds.
   */
  starter_portal_enabled: true,
  broker_crm_enabled: true,
  broker_dashboard_enabled: true,
  billing_enabled: false,
  ai_lead_scoring_enabled: false,
  ai_summary_enabled: false,
  ai_duplicate_detection_enabled: false,
  ai_recommendation_enabled: false,
  ai_broker_assistant_enabled: false,
  payments_enabled: false,
  e_signature_enabled: false,
  policy_issuance_enabled: false,
  claims_enabled: false,
  insurer_api_enabled: false,
  sms_enabled: false,
  whatsapp_enabled: false,
  partner_api_enabled: false,
  partner_webhooks_enabled: false,
  sponsored_offers_enabled: false,
  multi_broker_routing_enabled: false,
  /** Spec 046: executing an anonymization batch. Previews and policy edits work while it is off. */
  retention_purge_enabled: false,
  /** Spec 048: sending broker satisfaction survey requests post-lead completion. */
  satisfaction_survey_enabled: false,
  /** Spec 049: AI routing anomaly detection. */
  ai_routing_anomaly_detection_enabled: false,
  /**
   * Spec 062: broker <-> visitor messaging and document requests. Ships OFF (product owner, 2026-10-16):
   * open it from the admin flags screen only once the legal opinion L-08 (CIMA intermediary positioning)
   * is obtained. Non-sensitive on purpose: admin-toggleable, and switching it off refuses new writes with
   * MESSAGING_DISABLED while reads stay.
   */
  broker_visitor_messaging_enabled: false,
  /**
   * Lot 10 (spec 076): generic outbound CRM connector of a partner. Ships OFF and, like the SMS and
   * WhatsApp flags, has no admin toggle: only the audited compliance policy path opens it.
   */
  crm_connector_enabled: false
} as const;

export const COUNTRY_FEATURE_FLAG_DEFAULTS = {
  country_public_enabled: false,
  country_waitlist_enabled: false,
  country_quote_enabled: false,
  country_comparison_enabled: false,
  country_broker_onboarding_enabled: false,
  country_ai_enabled: false
} as const;

export const PRODUCT_FEATURE_FLAG_DEFAULTS = {
  product_public_enabled: false,
  product_quote_enabled: false,
  product_comparison_enabled: false,
  product_document_upload_enabled: false,
  product_sensitive_data_enabled: false,
  product_manual_review_required: true,
  product_ai_scoring_enabled: false,
  product_ai_form_assistant_enabled: false
} as const;

export type FlagKey =
  | keyof typeof GLOBAL_FEATURE_FLAG_DEFAULTS
  | keyof typeof COUNTRY_FEATURE_FLAG_DEFAULTS
  | keyof typeof PRODUCT_FEATURE_FLAG_DEFAULTS;
