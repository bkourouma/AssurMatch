"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const LEAD_ASSIST_TYPES = new Set(["lead_summary", "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

async function callBrokerApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<number> {
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

function outcome(status: number): string {
  if (status === 200 || status === 201) return "queued";
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status === 422) return "disabled";
  return "error";
}

/** Requests an AI suggestion for a CRM lead; the result is asynchronous and read back on the lead page. */
export async function requestLeadAiAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  const assistType = stringValue(formData.get("assistType"));
  if (!UUID.test(leadId) || !LEAD_ASSIST_TYPES.has(assistType)) redirect("/crm/leads");
  const status = await callBrokerApi(`/broker/crm/leads/${leadId}/ai/${assistType}`, "POST", { language: "fr" });
  if (status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  redirect(`/crm/leads/${leadId}?ai=${outcome(status)}`);
}

/** Human validation decision on a sensitive AI suggestion (score, classification). */
export async function validateLeadAiAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  const interactionId = stringValue(formData.get("interactionId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  if (!UUID.test(leadId) || !UUID.test(interactionId)) redirect("/crm/leads");
  const status = await callBrokerApi(`/broker/crm/ai/interactions/${interactionId}/validation`, "POST", { decision });
  if (status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  redirect(`/crm/leads/${leadId}?ai=${status === 200 || status === 201 ? "validated" : outcome(status)}`);
}

/** Partner-level AI opt-out preference (owner only). */
export async function setAiOptOutAction(formData: FormData): Promise<void> {
  const optOut = stringValue(formData.get("optOut")) === "true";
  const reason = stringValue(formData.get("reason")).trim() || (optOut ? "Opt-out partenaire depuis le CRM" : "Reactivation partenaire depuis le CRM");
  const status = await callBrokerApi("/broker/crm/ai/opt-out", "PUT", { optOut, reason });
  if (status === 401) redirect(loginRedirect("/crm", "session_expired"));
  redirect(`/crm?ai=${status === 200 || status === 201 ? "optout_saved" : outcome(status)}`);
}
