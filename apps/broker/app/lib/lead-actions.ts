"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";
import { crmStatusRequiresReason, isCrmOutcomeReason, isCrmPipelineStatus, isStarterActionReason } from "./lead-vocabulary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Appel API back-office avec le jeton de session du courtier connecte.
 * Aucune donnee d'un autre tenant ne peut transiter: le backend re-verifie le
 * tenant, le role, le plan et audite chaque refus.
 */
async function callBrokerApi(path: string, body: Record<string, unknown>): Promise<number> {
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
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "invalid";
  return "error";
}

/** Convertit une saisie `datetime-local` en horodatage ISO accepte par le contrat. */
function toIsoDateTime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString();
}

async function finishStarter(leadId: string, status: number, success: string): Promise<void> {
  if (status === 401) redirect(loginRedirect(`/leads/${leadId}`, "session_expired"));
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  redirect(`/leads/${leadId}?lead=${outcome(status, success)}`);
}

async function finishCrm(leadId: string, status: number, success: string): Promise<void> {
  if (status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${leadId}?crm=${outcome(status, success)}`);
}

/** Portail Starter: acceptation d'un lead assigne. POST /broker/starter/leads/:leadId/accept */
export async function acceptStarterLeadAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/leads");
  await finishStarter(leadId, await callBrokerApi(`/broker/starter/leads/${leadId}/accept`, {}), "accepted");
}

/** Portail Starter: rejet avec motif allowliste. POST /broker/starter/leads/:leadId/reject */
export async function rejectStarterLeadAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/leads");
  const reason = stringValue(formData.get("reason")).trim();
  if (!isStarterActionReason(reason)) redirect(`/leads/${leadId}?lead=reason_required`);
  const comment = stringValue(formData.get("comment")).trim().slice(0, 500);
  await finishStarter(leadId, await callBrokerApi(`/broker/starter/leads/${leadId}/reject`, { reason, ...(comment ? { comment } : {}) }), "rejected");
}

/** Portail Starter: contestation avec motif allowliste. POST /broker/starter/leads/:leadId/dispute */
export async function disputeStarterLeadAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/leads");
  const reason = stringValue(formData.get("reason")).trim();
  if (!isStarterActionReason(reason)) redirect(`/leads/${leadId}?lead=reason_required`);
  const comment = stringValue(formData.get("comment")).trim().slice(0, 500);
  await finishStarter(leadId, await callBrokerApi(`/broker/starter/leads/${leadId}/dispute`, { reason, ...(comment ? { comment } : {}) }), "disputed");
}

/**
 * CRM Pro/Enterprise: changement de statut pipeline.
 * POST /broker/crm/leads/:leadId/status. Un statut de perte ou de contestation
 * exige un motif allowliste, comme `brokerCrmStatusUpdateSchema`.
 */
export async function changeCrmLeadStatusAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/crm/leads");
  const status = stringValue(formData.get("status")).trim();
  if (!isCrmPipelineStatus(status)) redirect(`/crm/leads/${leadId}?crm=invalid`);
  const rawReason = stringValue(formData.get("reason")).trim();
  const reason = isCrmOutcomeReason(rawReason) ? rawReason : undefined;
  if (crmStatusRequiresReason(status) && !reason) redirect(`/crm/leads/${leadId}?crm=reason_required`);
  await finishCrm(leadId, await callBrokerApi(`/broker/crm/leads/${leadId}/status`, { status, ...(reason ? { reason } : {}) }), "status_changed");
}

/** CRM: note interne. POST /broker/crm/leads/:leadId/notes */
export async function addCrmLeadNoteAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/crm/leads");
  const body = stringValue(formData.get("body")).trim().slice(0, 1000);
  if (!body) redirect(`/crm/leads/${leadId}?crm=invalid`);
  await finishCrm(leadId, await callBrokerApi(`/broker/crm/leads/${leadId}/notes`, { body }), "note_created");
}

/** CRM: tache commerciale interne. POST /broker/crm/leads/:leadId/tasks */
export async function addCrmLeadTaskAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/crm/leads");
  const title = stringValue(formData.get("title")).trim().slice(0, 200);
  if (!title) redirect(`/crm/leads/${leadId}?crm=invalid`);
  const dueAt = toIsoDateTime(stringValue(formData.get("dueAt")).trim());
  await finishCrm(leadId, await callBrokerApi(`/broker/crm/leads/${leadId}/tasks`, { title, ...(dueAt ? { dueAt } : {}) }), "task_created");
}

/** CRM: rappel de relance. POST /broker/crm/leads/:leadId/reminders */
export async function addCrmLeadReminderAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/crm/leads");
  const remindAt = toIsoDateTime(stringValue(formData.get("remindAt")).trim());
  if (!remindAt) redirect(`/crm/leads/${leadId}?crm=invalid`);
  const message = stringValue(formData.get("message")).trim().slice(0, 500);
  await finishCrm(leadId, await callBrokerApi(`/broker/crm/leads/${leadId}/reminders`, { remindAt, ...(message ? { message } : {}) }), "reminder_created");
}
