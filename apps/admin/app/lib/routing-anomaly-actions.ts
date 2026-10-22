"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

/**
 * Spec 064 (FR-004): AI assistance for the routing anomalies screen. These actions only request an
 * indicative analysis and record the mandatory human decision on it. They never trigger a routing
 * rule change or a lead reassignment: that remains the existing human action.
 */

const PAGE = "/routing/anomalies";
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
  if (status === 200 || status === 201 || status === 202) return success;
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status === 422) return "disabled";
  return "error";
}

/** Requests an asynchronous AI analysis of the detected routing anomalies (aggregates only). */
export async function requestRoutingAnomalyAnalysisAction(): Promise<void> {
  const status = await callAdminApi("/admin/routing/anomalies/analyze", { language: "fr" });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(`${PAGE}?ai=${outcome(status, "queued")}`);
}

/** Records the mandatory human decision (approve / reject) on a routing anomaly analysis. */
export async function validateRoutingAnomalyAnalysisAction(formData: FormData): Promise<void> {
  const insightId = stringValue(formData.get("insightId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  if (!UUID.test(insightId)) redirect(`${PAGE}?ai=error`);
  const status = await callAdminApi(`/admin/ai/insights/${insightId}/validation`, { decision });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(`${PAGE}?ai=${outcome(status, "validated")}`);
}
