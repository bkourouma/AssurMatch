import { UUID, relayBrokerFile } from "../../../../../../lib/broker-upload";

/** Spec 055 FR-010: document interne du lead (fichier sain uniquement, audite, no-store). */
export async function GET(_request: Request, { params }: { params: Promise<{ leadAssignmentId: string; documentId: string }> }): Promise<Response> {
  const { leadAssignmentId, documentId } = await params;
  if (!UUID.test(leadAssignmentId) || !UUID.test(documentId)) return new Response("not_found", { status: 404 });
  return relayBrokerFile(`/broker/crm/leads/${leadAssignmentId}/documents/${documentId}/file`);
}
