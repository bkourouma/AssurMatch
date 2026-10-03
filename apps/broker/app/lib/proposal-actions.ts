"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "./backoffice-auth";
import { callBrokerWrite } from "./broker-write";
import { proposalOutcome } from "./proposal-vocabulary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Spec 055 FR-003: une proposition envoyee n'est jamais modifiee ; le courtier la retire puis en
 * envoie une nouvelle. POST /broker/{starter|crm}/leads/:leadId/proposals/:proposalId/withdraw
 */
export async function withdrawProposalAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  const proposalId = stringValue(formData.get("proposalId"));
  const channel = stringValue(formData.get("channel")) === "crm" ? "crm" : "starter";
  const page = channel === "crm" ? `/crm/leads/${leadId}` : `/leads/${leadId}`;
  if (!UUID.test(leadId) || !UUID.test(proposalId)) redirect(channel === "crm" ? "/crm/leads" : "/leads");
  const reason = stringValue(formData.get("reason")).slice(0, 500);
  const result = await callBrokerWrite(`/broker/${channel}/leads/${leadId}/proposals/${proposalId}/withdraw`, "POST", reason ? { reason } : {});
  if (result.status === 401) redirect(loginRedirect(page, "session_expired"));
  revalidatePath(page);
  const outcome = result.suspended ? "suspended" : proposalOutcome(result, "withdrawn");
  redirect(channel === "crm" ? `${page}?tab=propositions&proposal=${outcome}` : `${page}?proposal=${outcome}#repondre-au-visiteur`);
}

/**
 * Spec 055 FR-010 (US4): assignation d'un lead a un conseiller du cabinet.
 * POST /broker/crm/leads/:leadId/assign ; le tenant du conseiller est celui de la session, le
 * backend refuse tout conseiller d'un autre cabinet et audite le refus.
 */
export async function assignCrmAdvisorAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  if (!UUID.test(leadId)) redirect("/crm/leads");
  const advisorId = stringValue(formData.get("advisorId")).slice(0, 120);
  if (!advisorId) redirect(`/crm/leads/${leadId}?crm=invalid`);
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  const partnerTenantId = session.profile.partnerTenantId ?? "";
  const result = await callBrokerWrite(`/broker/crm/leads/${leadId}/assign`, "POST", { advisorId, advisorPartnerTenantId: partnerTenantId });
  if (result.status === 401) redirect(loginRedirect(`/crm/leads/${leadId}`, "session_expired"));
  revalidatePath(`/crm/leads/${leadId}`);
  const outcome = result.suspended ? "suspended" : result.status === 200 || result.status === 201 ? "assigned" : result.status === 403 ? "forbidden" : result.status === 400 ? "invalid" : "error";
  redirect(`/crm/leads/${leadId}?crm=${outcome}`);
}
