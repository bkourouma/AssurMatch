import { relayDocumentRequestCreate } from "../../../../lib/conversation-relay";

/**
 * Spec 062 (CRM): create a document request for the visitor. Server-side relay to
 * POST /broker/crm/leads/:leadId/document-requests (the wording guard runs in the API).
 */
export async function POST(request: Request, { params }: { params: Promise<{ leadAssignmentId: string }> }): Promise<Response> {
  const { leadAssignmentId } = await params;
  return relayDocumentRequestCreate(request, "crm", leadAssignmentId);
}
