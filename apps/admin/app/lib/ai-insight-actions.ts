"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const ASSIST_TYPES = new Set(["admin_risk_triage", "activation_gap_summary", "offer_consistency_check", "activity_report", "suspicious_leads"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

async function callAdminApi(path: string, body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
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
  if (status === 429) return "quota";
  if (status === 422) return "disabled";
  return "error";
}

/** Requests an admin insight; the result is asynchronous and read back on the assistance page. */
export async function requestAdminInsightAction(formData: FormData): Promise<void> {
  const assistType = stringValue(formData.get("assistType"));
  const offerId = stringValue(formData.get("offerId")).trim();
  if (!ASSIST_TYPES.has(assistType)) redirect("/ai-assistance?ai=error");
  const status = await callAdminApi(`/admin/ai/insights/${assistType}`, { language: "fr", ...(UUID.test(offerId) ? { offerId } : {}) });
  if (status === 401) redirect(loginRedirect("/ai-assistance", "session_expired"));
  redirect(`/ai-assistance?ai=${outcome(status, "queued")}`);
}

/** Records the mandatory human decision on a sensitive insight. */
export async function validateAdminInsightAction(formData: FormData): Promise<void> {
  const insightId = stringValue(formData.get("insightId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  if (!UUID.test(insightId)) redirect("/ai-assistance?ai=error");
  const status = await callAdminApi(`/admin/ai/insights/${insightId}/validation`, { decision });
  if (status === 401) redirect(loginRedirect("/ai-assistance", "session_expired"));
  redirect(`/ai-assistance?ai=${outcome(status, "validated")}`);
}
