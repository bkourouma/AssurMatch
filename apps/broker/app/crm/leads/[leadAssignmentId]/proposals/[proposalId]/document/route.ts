import { UUID, relayBrokerFile } from "../../../../../../lib/broker-upload";

/** Spec 055: PDF d'une proposition CRM, telecharge avec la session (audite, no-store). */
export async function GET(_request: Request, { params }: { params: Promise<{ leadAssignmentId: string; proposalId: string }> }): Promise<Response> {
  const { leadAssignmentId, proposalId } = await params;
  if (!UUID.test(leadAssignmentId) || !UUID.test(proposalId)) return new Response("not_found", { status: 404 });
  return relayBrokerFile(`/broker/crm/leads/${leadAssignmentId}/proposals/${proposalId}/document`);
}
