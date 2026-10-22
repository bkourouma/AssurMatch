import type {
  AdminOfferListItem,
  OfferEffectiveStatus,
  OfferType
} from "../../../../packages/shared/contracts/offer-content";
import type {
  AdminInsurerView,
  InsurerCreateDto,
  InsurerStatus
} from "../../../../packages/shared/contracts/insurer.contracts";
import { OFFER_AI_SUMMARY_LABEL, type OfferAiSummaryView } from "../../../../packages/shared/contracts/ai.contracts";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/**
 * Spec 070 (lot 4): admin API calls for the offer types, the insurer referential and the read-only
 * AI summary of an offer. Kept apart from `admin-api.ts` (shared file): same conventions, the
 * session token stays in the httpOnly cookie and is read on the server only.
 */
export type { AdminInsurerView, OfferAiSummaryView };

export interface Lot4ReadState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden" | "not_found";
  data: T;
  error?: string;
}

async function read<T>(path: string, fallback: T): Promise<Lot4ReadState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    if (response.status === 404) return { status: "not_found", data: fallback, error: "api_404" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface Lot4WriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
}

async function write<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<Lot4WriteResult<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, code: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => undefined) as unknown;
    if (response.ok) return { ok: true, status: response.status, data: payload as T };
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return {
      ok: false,
      status: response.status,
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {})
    };
  } catch (error) {
    return { ok: false, status: 0, code: "api_unavailable", message: error instanceof Error ? error.message : "api_unavailable" };
  }
}

/* --------------------------------------------------------------------------- offers list */

export interface Lot4OfferListFilters {
  countryId?: string | undefined;
  productId?: string | undefined;
  partnerTenantId?: string | undefined;
  status?: OfferEffectiveStatus | undefined;
  offerType?: OfferType | undefined;
  sponsored?: boolean | undefined;
  expiringWithinDays?: number | undefined;
  queue?: "submitted" | undefined;
}

/** `GET /admin/offers` with the spec 070 `offerType` filter (same other filters as `readAdminOfferList`). */
export function readAdminOffersByType(filters: Lot4OfferListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.countryId) params.set("countryId", filters.countryId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.partnerTenantId) params.set("partnerTenantId", filters.partnerTenantId);
  if (filters.status) params.set("status", filters.status);
  if (filters.offerType) params.set("offerType", filters.offerType);
  if (filters.sponsored !== undefined) params.set("sponsored", String(filters.sponsored));
  if (filters.expiringWithinDays !== undefined) params.set("expiringWithinDays", String(filters.expiringWithinDays));
  if (filters.queue) params.set("queue", filters.queue);
  const query = params.toString();
  return read<AdminOfferListItem[]>(`/admin/offers${query ? `?${query}` : ""}`, []);
}

/* ------------------------------------------------------------------------------ insurers */

export interface AdminInsurerFilters {
  countryId?: string | undefined;
  status?: InsurerStatus | undefined;
}

export function readAdminInsurers(filters: AdminInsurerFilters = {}) {
  const params = new URLSearchParams();
  if (filters.countryId) params.set("countryId", filters.countryId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return read<AdminInsurerView[]>(`/admin/insurers${query ? `?${query}` : ""}`, []);
}

export function readAdminInsurer(insurerId: string) {
  return read<AdminInsurerView | null>(`/admin/insurers/${encodeURIComponent(insurerId)}`, null);
}

export function createAdminInsurer(input: InsurerCreateDto) {
  return write<AdminInsurerView>("/admin/insurers", "POST", input);
}

export interface AdminInsurerUpdateInput {
  name: string;
  approvalNumber: string;
  status: InsurerStatus;
  expectedUpdatedAt: string;
  reason: string;
}

export function updateAdminInsurer(insurerId: string, input: AdminInsurerUpdateInput) {
  return write<AdminInsurerView>(`/admin/insurers/${encodeURIComponent(insurerId)}`, "PATCH", input);
}

export function retireAdminInsurer(insurerId: string, reason: string) {
  return write<AdminInsurerView>(`/admin/insurers/${encodeURIComponent(insurerId)}/retire`, "POST", { reason });
}

/* -------------------------------------------------------------------- AI summary (OFFER-010) */

const emptyAiSummary: OfferAiSummaryView = {
  enabled: false,
  reasons: [],
  available: false,
  label: OFFER_AI_SUMMARY_LABEL,
  disclaimer: ""
};

/** `GET /admin/offers/:id/ai-summary`: last human-validated summary, closed by default. */
export function readAdminOfferAiSummary(offerId: string) {
  return read<OfferAiSummaryView>(`/admin/offers/${encodeURIComponent(offerId)}/ai-summary`, emptyAiSummary);
}

/** `POST /admin/ai/insights/offer_summary`: queues a summary; a human validates it afterwards. */
export function requestAdminOfferSummary(offerId: string) {
  return write<unknown>("/admin/ai/insights/offer_summary", "POST", { offerId, language: "fr" });
}
