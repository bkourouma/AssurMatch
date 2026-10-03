import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";
import { PARTNER_SUSPENDED_CODE } from "./broker-write";
import type {
  BrokerOfferView,
  OfferBlocker,
  OfferContent,
  OfferEffectiveStatus,
  OfferVersionView
} from "../../../../packages/shared/contracts/offer-content";

/**
 * Spec 052 R5: broker side of the offers. Reads and writes run on the server only (the session
 * token stays in the httpOnly cookie). Writes keep the refusal `code` and `blockers` (422
 * OFFER_INCOMPLETE / OFFER_SCOPE_NOT_COVERED, 409 OFFER_VERSION_CONFLICT) and flag 403
 * PARTNER_SUSPENDED like `callBrokerWrite` (spec 051 FR-021).
 */
export type { BrokerOfferView, OfferBlocker, OfferContent, OfferEffectiveStatus, OfferVersionView };

export interface BrokerOfferReadState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden" | "not_found";
  data: T;
  error?: string;
}

async function readOffers<T>(path: string, fallback: T): Promise<BrokerOfferReadState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    // FR-008: another broker's offer answers 404, exactly like a missing one.
    if (response.status === 404) return { status: "not_found", data: fallback, error: "not_found" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface BrokerOfferListFilters {
  status?: OfferEffectiveStatus | undefined;
  countryId?: string | undefined;
  productId?: string | undefined;
}

export function readBrokerOffers(filters: BrokerOfferListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.countryId) params.set("countryId", filters.countryId);
  if (filters.productId) params.set("productId", filters.productId);
  const query = params.toString();
  return readOffers<BrokerOfferView[]>(`/broker/offers${query ? `?${query}` : ""}`, []);
}

export function readBrokerOffer(offerId: string) {
  return readOffers<BrokerOfferView | null>(`/broker/offers/${encodeURIComponent(offerId)}`, null);
}

export interface BrokerOfferWriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
  blockers: OfferBlocker[];
  suspended: boolean;
}

function toBlockers(value: unknown): OfferBlocker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.code !== "string") return [];
    return [{ code: record.code, ...(typeof record.field === "string" ? { field: record.field } : {}) }];
  });
}

export async function writeBrokerOffer<T = BrokerOfferView>(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<BrokerOfferWriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required", blockers: [], suspended: false };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => undefined) as unknown;
    if (response.ok) return { ok: true, status: response.status, data: payload as T, blockers: [], suspended: false };
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const code = typeof record.code === "string" ? record.code : undefined;
    return {
      ok: false,
      status: response.status,
      ...(code ? { code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      blockers: toBlockers(record.blockers),
      suspended: response.status === 403 && code === PARTNER_SUSPENDED_CODE
    };
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable", blockers: [], suspended: false };
  }
}

export function offerPath(offerId: string, suffix = ""): string {
  return `/broker/offers/${encodeURIComponent(offerId)}${suffix}`;
}

/* ---------------------------------------------------------------------------------------------
 * Country x product choices. No broker endpoint exposes the licensed coverage: the choices come
 * from the public catalogue (countries and products open to the public) plus the scopes of the
 * broker's existing offers. The API stays the authority and answers 422 OFFER_SCOPE_NOT_COVERED
 * for a scope the broker's licence and authorisations do not cover (FR-007).
 * ------------------------------------------------------------------------------------------- */

export interface OfferScopeChoice {
  countryId: string;
  productId: string;
  countryLabel: string;
  productLabel: string;
}

interface PublicCountry {
  id: string;
  isoCode: string;
  name: string;
}

interface PublicProduct {
  id: string;
  key: string;
  name: string;
}

async function readPublic<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export async function readOfferScopeChoices(): Promise<OfferScopeChoice[]> {
  const countries = await readPublic<PublicCountry[]>("/countries", []);
  const perCountry = await Promise.all(
    (Array.isArray(countries) ? countries : []).map(async (country) => {
      const products = await readPublic<PublicProduct[]>(`/countries/${encodeURIComponent(country.isoCode)}/products`, []);
      return (Array.isArray(products) ? products : []).map((product) => ({
        countryId: country.id,
        productId: product.id,
        countryLabel: `${country.name} (${country.isoCode})`,
        productLabel: product.name
      }));
    })
  );
  return perCountry.flat();
}
