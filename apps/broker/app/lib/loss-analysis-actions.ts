"use server";

import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { callBrokerWrite, type BrokerWriteResult } from "./broker-write";

/**
 * Spec 064 FR-003: server actions of the loss analysis page (Enterprise). The API stays the authority:
 * it re-checks plan, flags, partner opt-out, quota, CRM permission and tenant, and audits each call.
 * The analysis is asynchronous and read back on the page; nothing here decides anything about a lead.
 */
const PAGE = "/crm/loss-analysis";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function outcome(result: BrokerWriteResult, success: string): string {
  const { status } = result;
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED is shown as "Compte suspendu : consultation seule".
  if (result.suspended) return "suspended";
  if (status === 200 || status === 201 || status === 202) return success;
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status === 422) return "disabled";
  return "error";
}

/** Queues a loss analysis over the leads lost during the last 90 days (aggregated reasons, no contact data). */
export async function requestLossAnalysisAction(): Promise<void> {
  const result = await callBrokerWrite("/broker/crm/ai/loss-analysis", "POST", { language: "fr" });
  if (result.status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(`${PAGE}?ai=${outcome(result, "queued")}`);
}

/** Human validation of a completed analysis: approve or set aside. Never triggers an automatic decision. */
export async function validateLossAnalysisAction(formData: FormData): Promise<void> {
  const interactionId = stringValue(formData.get("interactionId"));
  const decision = stringValue(formData.get("decision")) === "rejected" ? "rejected" : "approved";
  if (!UUID.test(interactionId)) redirect(PAGE);
  const result = await callBrokerWrite(`/broker/crm/ai/interactions/${interactionId}/validation`, "POST", { decision });
  if (result.status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(`${PAGE}?ai=${outcome(result, "validated")}`);
}
