"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const PLANS = new Set(["starter", "pro", "enterprise"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: FormDataEntryValue | null): number {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function callBillingApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return response.status;
  } catch {
    return 0;
  }
}

function outcome(status: number, success: string): string {
  if (status === 200 || status === 201) return success;
  if (status === 403) return "forbidden";
  if (status === 422) return "disabled";
  if (status === 400) return "invalid";
  return "error";
}

/** Updates the plan price used to compute non-billable drafts. Never issues or collects anything. */
export async function upsertBillingPlanAction(formData: FormData): Promise<void> {
  const plan = stringValue(formData.get("plan"));
  const countryCode = stringValue(formData.get("countryCode")).trim().toUpperCase();
  const reason = stringValue(formData.get("reason")).trim();
  if (!PLANS.has(plan) || countryCode.length !== 2 || reason.length < 3) redirect("/billing?billing=invalid");
  const status = await callBillingApi("/admin/billing/plans", "PUT", {
    plan,
    countryCode,
    monthlySubscription: numberValue(formData.get("monthlySubscription")),
    perLeadPrice: numberValue(formData.get("perLeadPrice")),
    setupFee: numberValue(formData.get("setupFee")),
    reason
  });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?billing=${outcome(status, "plan_saved")}`);
}

/** Recomputes the monthly drafts; the result stays `draft_not_billable`. */
export async function recomputeDraftInvoicesAction(formData: FormData): Promise<void> {
  const partnerId = stringValue(formData.get("partnerId")).trim();
  const reason = stringValue(formData.get("reason")).trim() || "Recalcul des brouillons mensuels";
  const status = await callBillingApi("/admin/billing/invoices/recompute", "POST", { ...(UUID.test(partnerId) ? { partnerId } : {}), reason });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?billing=${outcome(status, "drafts_computed")}`);
}

/** Grants prepaid lead credits; no payment is captured by this action. */
export async function grantLeadPackAction(formData: FormData): Promise<void> {
  const partnerId = stringValue(formData.get("partnerId")).trim();
  const credits = Math.trunc(numberValue(formData.get("credits")));
  const reason = stringValue(formData.get("reason")).trim();
  if (!UUID.test(partnerId) || credits < 1 || reason.length < 3) redirect("/billing?billing=invalid");
  const status = await callBillingApi("/admin/billing/packs", "POST", { partnerId, credits, reason });
  if (status === 401) redirect(loginRedirect("/billing", "session_expired"));
  redirect(`/billing?billing=${outcome(status, "pack_granted")}`);
}
