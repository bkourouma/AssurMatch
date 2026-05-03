export const GLOBAL_FEATURE_FLAG_DEFAULTS = {
  public_comparator_enabled: false,
  quote_request_enabled: false,
  starter_portal_enabled: false,
  broker_crm_enabled: false,
  broker_dashboard_enabled: false,
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
  sponsored_offers_enabled: false,
  multi_broker_routing_enabled: false
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
