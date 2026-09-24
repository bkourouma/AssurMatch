/**
 * Analytics stub. The PRD event names are typed here so every surface emits the same vocabulary;
 * wiring a real collector later only replaces the body of `track`.
 */
export const analyticsEvents = [
  "country_selected",
  "product_viewed",
  "entry_form_started",
  "comparator_results_viewed",
  "offer_viewed",
  "score_explained",
  "comparison_opened",
  "quote_step_completed",
  "quote_abandoned",
  "consent_given",
  "ai_summary_edited",
  "quote_submitted",
  "whatsapp_clicked",
  "callback_requested",
  "waitlist_joined",
  "partner_application_submitted",
  "contact_submitted"
] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

/** No-op by design: no visitor data leaves the page until a collector is explicitly configured. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  void event;
  void props;
}
