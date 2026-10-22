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

/* ---------- Lot 3 (spec 069 FR-004): résumé IA de performance (DASH-B-009) et assistant manager ---------- */

const INSIGHT_PAGE = "/crm";
/** The panel is shown on the dashboard and on the pipeline: the action returns to the page it came from (whitelist). */
const INSIGHT_PAGES = new Set(["/", "/crm"]);
function insightPage(formData: FormData): string {
  const value = stringValue(formData.get("returnTo"));
  return INSIGHT_PAGES.has(value) ? value : INSIGHT_PAGE;
}
const INSIGHT_WINDOW_DAYS = [7, 30, 90];

function insightOutcome(result: BrokerWriteResult, success: string): string {
  if (result.suspended) return "suspended";
  if (result.status === 200 || result.status === 201 || result.status === 202) return success;
  return outcome(result);
}

function windowDaysOf(formData: FormData): number {
  const value = Number(stringValue(formData.get("windowDays")));
  return INSIGHT_WINDOW_DAYS.includes(value) ? value : 30;
}

/** Requests a performance summary over aggregates of the cabinet (no prospect data). The API re-checks plan, flags, opt-out and role. */
export async function requestPerformanceSummaryAction(formData: FormData): Promise<void> {
  const page = insightPage(formData);
  const result = await callBrokerApi("/broker/crm/ai/performance-summary", "POST", { language: "fr", windowDays: windowDaysOf(formData) });
  if (result.status === 401) redirect(loginRedirect(page, "session_expired"));
  redirect(`${page}?insight=${insightOutcome(result, "queued")}`);
}

/** Requests a manager analysis (Enterprise). Advisors reach the model as neutral labels only. */
export async function requestManagerAssistantAction(formData: FormData): Promise<void> {
  const page = insightPage(formData);
  const result = await callBrokerApi("/broker/crm/ai/manager-assistant", "POST", { language: "fr", windowDays: windowDaysOf(formData) });
  if (result.status === 401) redirect(loginRedirect(page, "session_expired"));
  redirect(`${page}?insight=${insightOutcome(result, "queued")}`);
}

/** Human validation (valider / rejeter) of a performance summary or manager analysis. Never triggers an automatic decision. */
export async function validateTenantInsightAction(formData: FormData): Promise<void> {
  const interactionId = stringValue(formData.get("interactionId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  const page = insightPage(formData);
  if (!UUID.test(interactionId)) redirect(page);
  const result = await callBrokerApi(`/broker/crm/ai/interactions/${interactionId}/validation`, "POST", { decision });
  if (result.status === 401) redirect(loginRedirect(page, "session_expired"));
  redirect(`${page}?insight=${insightOutcome(result, "validated")}`);
}
