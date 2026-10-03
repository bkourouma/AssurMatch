import { loginRedirect } from "../../../../lib/backoffice-auth";
import { UUID, forwardBrokerMultipart, isSameOrigin, seeOther } from "../../../../lib/broker-upload";
import { proposalOutcome } from "../../../../lib/proposal-vocabulary";

/**
 * Spec 055 FR-010: document interne du lead (PDF, JPEG ou PNG, 5 Mo, antivirus). Relai serveur vers
 * POST /broker/crm/leads/:leadId/documents ; le document n'est jamais visible du visiteur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ leadAssignmentId: string }> }): Promise<Response> {
  const { leadAssignmentId } = await params;
  if (!UUID.test(leadAssignmentId)) return seeOther(request, "/crm/leads");
  if (!isSameOrigin(request)) return new Response("forbidden_origin", { status: 403 });
  const form = await request.formData();
  const label = typeof form.get("label") === "string" ? String(form.get("label")).trim().slice(0, 120) : "";
  const file = form.get("file");
  if (!label || !(file instanceof File) || file.size === 0) return seeOther(request, `/crm/leads/${leadAssignmentId}?tab=historique&crm=invalid`);
  const upstream = new FormData();
  upstream.append("label", label);
  upstream.append("file", file, file.name);
  const result = await forwardBrokerMultipart(`/broker/crm/leads/${leadAssignmentId}/documents`, upstream);
  if (result.status === 401) return seeOther(request, loginRedirect(`/crm/leads/${leadAssignmentId}`, "session_expired"));
  const outcome = proposalOutcome(result, "document_added");
  return seeOther(request, `/crm/leads/${leadAssignmentId}?tab=historique&crm=${outcome}`);
}
