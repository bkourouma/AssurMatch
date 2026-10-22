import { OFFER_AI_SUMMARY_LABEL, type OfferAiSummaryView } from "../../../../packages/shared/contracts/ai.contracts";
import type { InsurerChoice } from "../../../../packages/shared/contracts/insurer.contracts";
import type { BrokerOfferView, OfferEffectiveStatus, OfferType } from "../../../../packages/shared/contracts/offer-content";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import type { BrokerOfferReadState } from "./offer-api";

/**
 * Spec 070 (lot 4): broker side of the offer types, the insurer choice list and the read-only AI
 * summary of an offer. Kept apart from `offer-api.ts` (shared file): reads run on the server only
 * (the session token stays in the httpOnly cookie). The broker never writes an AI summary.
 */
export type { InsurerChoice, OfferAiSummaryView };

async function read<T>(path: string, fallback: T): Promise<BrokerOfferReadState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    if (response.status === 404) return { status: "not_found", data: fallback, error: "not_found" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface BrokerOffersByTypeFilters {
  status?: OfferEffectiveStatus | undefined;
  offerType?: OfferType | undefined;
}

/** `GET /broker/offers` with the spec 070 `offerType` filter. */
export function readBrokerOffersByType(filters: BrokerOffersByTypeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.offerType) params.set("offerType", filters.offerType);
  const query = params.toString();
  return read<BrokerOfferView[]>(`/broker/offers${query ? `?${query}` : ""}`, []);
}

/** `GET /broker/insurers?countryId=`: the active insurers of one country (light view). */
export async function readBrokerInsurers(countryId: string): Promise<InsurerChoice[]> {
  const result = await read<InsurerChoice[]>(`/broker/insurers?countryId=${encodeURIComponent(countryId)}`, []);
  return Array.isArray(result.data) ? result.data : [];
}

/** Active insurers of several countries (the create form chooses its country afterwards). */
export async function readBrokerInsurersForCountries(countryIds: string[]): Promise<InsurerChoice[]> {
  const unique = [...new Set(countryIds)];
  const lists = await Promise.all(unique.map((countryId) => readBrokerInsurers(countryId)));
  return lists.flat();
}

const emptyAiSummary: OfferAiSummaryView = {
  enabled: false,
  reasons: [],
  available: false,
  label: OFFER_AI_SUMMARY_LABEL,
  disclaimer: ""
};

/** `GET /broker/offers/:id/ai-summary`: last human-validated summary of an own offer, read only. */
export function readBrokerOfferAiSummary(offerId: string) {
  return read<OfferAiSummaryView>(`/broker/offers/${encodeURIComponent(offerId)}/ai-summary`, emptyAiSummary);
}
