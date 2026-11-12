import type { PublicQuoteStatus } from "../../../../packages/shared/contracts/public-quote-status";

export type QuoteHeadlineKey = PublicQuoteStatus | "consent_withdrawn";

/**
 * Key of the headline of the visitor tracking page. The API keeps the pipeline status (e.g.
 * "transmitted") after a withdrawal and reports the withdrawal separately in `consent.withdrawn`:
 * the headline must follow the withdrawal, otherwise the visitor reads "Demande transmise" about a
 * request that is no longer passed on.
 */
export function headline(view: { status: PublicQuoteStatus; consent: { withdrawn: boolean } }): QuoteHeadlineKey {
  return view.consent.withdrawn ? "consent_withdrawn" : view.status;
}
