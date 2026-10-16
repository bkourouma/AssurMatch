import { relayRequestDocument } from "../../../../../../../../lib/conversation-relay";

/** Spec 062 (CRM): file provided by the visitor for a document request (clean only, audited, no-store). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadAssignmentId: string; requestId: string; documentId: string }> }
): Promise<Response> {
  const { leadAssignmentId, requestId, documentId } = await params;
  return relayRequestDocument("crm", leadAssignmentId, requestId, documentId);
}
