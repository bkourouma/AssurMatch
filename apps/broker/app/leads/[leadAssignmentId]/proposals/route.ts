import { loginRedirect } from "../../../lib/backoffice-auth";
import { UUID, forwardBrokerMultipart, isSameOrigin, seeOther } from "../../../lib/broker-upload";
import { buildProposalPayload, proposalOutcome } from "../../../lib/proposal-vocabulary";

/**
 * Spec 055 FR-009: "Repondre au visiteur" du portail Starter. Le formulaire (message, prime,
 * garanties, validite, PDF facultatif) est relaye cote serveur vers
 * POST /broker/starter/leads/:leadId/proposals ; le jeton de session ne quitte jamais le serveur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ leadAssignmentId: string }> }): Promise<Response> {
  const { leadAssignmentId } = await params;
  if (!UUID.test(leadAssignmentId)) return seeOther(request, "/leads");
  if (!isSameOrigin(request)) return new Response("forbidden_origin", { status: 403 });
  const form = await request.formData();
  const built = buildProposalPayload(form);
  if (!built.ok) return seeOther(request, `/leads/${leadAssignmentId}?proposal=invalid`);
  const upstream = new FormData();
  upstream.append("payload", JSON.stringify(built.payload));
  const file = form.get("file");
  if (file instanceof File && file.size > 0) upstream.append("file", file, file.name);
  const result = await forwardBrokerMultipart(`/broker/starter/leads/${leadAssignmentId}/proposals`, upstream);
  if (result.status === 401) return seeOther(request, loginRedirect(`/leads/${leadAssignmentId}`, "session_expired"));
  return seeOther(request, `/leads/${leadAssignmentId}?proposal=${proposalOutcome(result, "sent")}#repondre-au-visiteur`);
}
