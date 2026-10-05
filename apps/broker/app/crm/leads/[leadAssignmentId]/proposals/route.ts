import { loginRedirect } from "../../../../lib/backoffice-auth";
import { UUID, forwardBrokerMultipart, isSameOrigin, seeOther } from "../../../../lib/broker-upload";
import { buildProposalPayload, proposalOutcome } from "../../../../lib/proposal-vocabulary";

/**
 * Spec 055 FR-002: composeur de proposition CRM. Relai serveur multipart vers
 * POST /broker/crm/leads/:leadId/proposals (PDF facultatif analyse par l'antivirus).
 */
export async function POST(request: Request, { params }: { params: Promise<{ leadAssignmentId: string }> }): Promise<Response> {
  const { leadAssignmentId } = await params;
  if (!UUID.test(leadAssignmentId)) return seeOther(request, "/crm/leads");
  if (!isSameOrigin(request)) return new Response("forbidden_origin", { status: 403 });
  const form = await request.formData();
  const built = buildProposalPayload(form);
  if (!built.ok) return seeOther(request, `/crm/leads/${leadAssignmentId}?tab=propositions&proposal=invalid`);
  const upstream = new FormData();
  upstream.append("payload", JSON.stringify(built.payload));
  const file = form.get("file");
  if (file instanceof File && file.size > 0) upstream.append("file", file, file.name);
  const result = await forwardBrokerMultipart(`/broker/crm/leads/${leadAssignmentId}/proposals`, upstream);
  if (result.status === 401) return seeOther(request, loginRedirect(`/crm/leads/${leadAssignmentId}`, "session_expired"));
  return seeOther(request, `/crm/leads/${leadAssignmentId}?tab=propositions&proposal=${proposalOutcome(result, "sent")}`);
}
