"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { UUID } from "./broker-upload";
import { cancelDocumentRequest } from "./conversation-relay";
import { conversationOutcome, conversationPagePath } from "./conversation-vocabulary";

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Spec 062: the broker cancels an open document request of this lead.
 * POST /broker/{starter|crm}/leads/:leadId/document-requests/:requestId/cancel
 */
export async function cancelDocumentRequestAction(formData: FormData): Promise<void> {
  const leadId = stringValue(formData.get("leadAssignmentId"));
  const requestId = stringValue(formData.get("requestId"));
  const channel = stringValue(formData.get("channel")) === "crm" ? "crm" : "starter";
  if (!UUID.test(leadId) || !UUID.test(requestId)) redirect(channel === "crm" ? "/crm/leads" : "/leads");
  const result = await cancelDocumentRequest(channel, leadId, requestId);
  if (result.status === 401) redirect(loginRedirect(conversationPagePath(channel, leadId), "session_expired"));
  revalidatePath(channel === "crm" ? `/crm/leads/${leadId}` : `/leads/${leadId}`);
  const outcome = result.suspended ? "suspended" : conversationOutcome({ status: result.status }, "request_cancelled");
  redirect(conversationPagePath(channel, leadId, outcome));
}
