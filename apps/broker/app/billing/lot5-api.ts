import { backOfficeApiBaseUrl, getBackOfficeToken } from "../lib/backoffice-auth";
import { PARTNER_SUSPENDED_CODE } from "../lib/broker-write";
import type { PlanChangeRequest } from "../../../../packages/shared/contracts/billing-plan-change.contracts";

/**
 * Lot 5 (spec 071), G-06: broker side of the plan-change requests. Server-only (the session token stays
 * in the httpOnly cookie) and limited to the `/broker/billing/plan-change-requests` routes: the partner
 * is always the one of the session, never a parameter.
 */
export type { PlanChangeRequest };

export interface PlanChangeReadState {
  status: "success" | "error" | "unauthenticated" | "forbidden";
  data: { items: PlanChangeRequest[]; total: number };
  error?: string;
}

const EMPTY = { items: [], total: 0 };

export async function readBrokerPlanChangeRequests(): Promise<PlanChangeReadState> {
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", data: EMPTY, error: "session_required" };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/broker/billing/plan-change-requests`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", data: EMPTY, error: "session_expired" };
    if (response.status === 403) return { status: "forbidden", data: EMPTY, error: "access_denied" };
    if (!response.ok) return { status: "error", data: EMPTY, error: `api_${response.status}` };
    return { status: "success", data: await response.json() as { items: PlanChangeRequest[]; total: number } };
  } catch (error) {
    return { status: "error", data: EMPTY, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}

export interface PlanChangeWriteResult {
  ok: boolean;
  status: number;
  suspended: boolean;
}

export async function writeBrokerPlanChange(path: string, body: Record<string, unknown>): Promise<PlanChangeWriteResult> {
  const token = await getBackOfficeToken();
  if (!token) return { ok: false, status: 401, suspended: false };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    if (response.ok) return { ok: true, status: response.status, suspended: false };
    const payload = response.status === 403 ? await response.json().catch(() => undefined) as { code?: unknown } | undefined : undefined;
    return { ok: false, status: response.status, suspended: payload?.code === PARTNER_SUSPENDED_CODE };
  } catch {
    return { ok: false, status: 0, suspended: false };
  }
}
