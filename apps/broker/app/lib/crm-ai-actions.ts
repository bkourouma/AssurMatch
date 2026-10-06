"use server";

import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { callBrokerWrite, type BrokerWriteResult } from "./broker-write";

const LEAD_ASSIST_TYPES = new Set(["lead_summary", "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function callBrokerApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<BrokerWriteResult> {
  return callBrokerWrite(path, method, body);
}

function outcome(result: BrokerWriteResult): string {
  const { status } = result;
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED is shown as "Compte suspendu : consultation seule".
  if (result.suspended) return "suspended";
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
  const result = await callBrokerApi(`/broker/crm/leads/${leadId}/ai/${assistType}`, "POST", { language: "fr" });
  if (result.status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  redirect(`/crm/leads/${leadId}?ai=${outcome(result)}`);
}

/** Human validation decision on a sensitive AI suggestion (score, classification). */
export async function validateLeadAiAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  const interactionId = stringValue(formData.get("interactionId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  if (!UUID.test(leadId) || !UUID.test(interactionId)) redirect("/crm/leads");
  const result = await callBrokerApi(`/broker/crm/ai/interactions/${interactionId}/validation`, "POST", { decision });
  if (result.status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  redirect(`/crm/leads/${leadId}?ai=${result.status === 200 || result.status === 201 ? "validated" : outcome(result)}`);
}

/** Partner-level AI opt-out preference (owner only). */
export async function setAiOptOutAction(formData: FormData): Promise<void> {
  const optOut = stringValue(formData.get("optOut")) === "true";
  const reason = stringValue(formData.get("reason")).trim() || (optOut ? "Opt-out partenaire depuis le CRM" : "Reactivation partenaire depuis le CRM");
  const result = await callBrokerApi("/broker/crm/ai/opt-out", "PUT", { optOut, reason });
  if (result.status === 401) redirect(loginRedirect("/crm", "session_expired"));
  redirect(`/crm?ai=${result.status === 200 || result.status === 201 ? "optout_saved" : outcome(result)}`);
}
