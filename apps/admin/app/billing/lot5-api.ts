import { backOfficeApiBaseUrl, getBackOfficeToken } from "../lib/backoffice-auth";
import type {
  BillingAddOnPrice,
  PartnerAddOn,
  PartnerSubscription
} from "../../../../packages/shared/contracts/billing-addons.contracts";
import type { PlanChangeRequest, PlanChangeRequestStatus } from "../../../../packages/shared/contracts/billing-plan-change.contracts";

/**
 * Lot 5 (spec 071): admin client of the add-on prices, add-on assignments, subscription state and
 * plan-change inbox. Server-only: the session token stays in the httpOnly cookie.
 */
export type { BillingAddOnPrice, PartnerAddOn, PartnerSubscription, PlanChangeRequest, PlanChangeRequestStatus };

export interface Lot5ReadState<T> {
  status: "success" | "error" | "unauthenticated" | "forbidden";
  data: T;
  error?: string;
}

async function readLot5<T>(path: string, fallback: T): Promise<Lot5ReadState<T>> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: fallback, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: fallback, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: fallback, error: "access_denied" };
    if (!response.ok) return { status: "error", data: fallback, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as T };
  } catch (error) {
    return { status: "error", data: fallback, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface Lot5WriteResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
}

export async function writeLot5<T = unknown>(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<Lot5WriteResult<T>> {
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
    return { ok: false, status: response.status, ...(typeof record.code === "string" ? { code: record.code } : {}) };
  } catch {
    return { ok: false, status: 0, code: "api_unavailable" };
  }
}

export function readAddOnPrices() {
  return readLot5<BillingAddOnPrice[]>("/admin/billing/add-on-prices", []);
}

export function readPartnerAddOns(partnerId?: string) {
  const query = partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : "";
  return readLot5<PartnerAddOn[]>(`/admin/billing/add-ons${query}`, []);
}

export function readPartnerSubscription(partnerId: string) {
  return readLot5<PartnerSubscription | null>(`/admin/billing/subscriptions/${encodeURIComponent(partnerId)}`, null);
}

export function readPlanChangeRequests(filters: { status?: PlanChangeRequestStatus; partnerId?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.partnerId) query.set("partnerId", filters.partnerId);
  const suffix = query.size ? `?${query.toString()}` : "";
  return readLot5<{ items: PlanChangeRequest[]; total: number }>(`/admin/billing/plan-change-requests${suffix}`, { items: [], total: 0 });
}
