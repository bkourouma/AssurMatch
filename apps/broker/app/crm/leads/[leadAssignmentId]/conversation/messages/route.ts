import { relayConversationMessage } from "../../../../../lib/conversation-relay";

/**
 * Spec 062 (CRM): send a message to the visitor (text + up to 3 attachments). Server-side relay to
 * POST /broker/crm/leads/:leadId/conversation/messages; the session token never leaves the server.
 */
export async function POST(request: Request, { params }: { params: Promise<{ leadAssignmentId: string }> }): Promise<Response> {
  const { leadAssignmentId } = await params;
  return relayConversationMessage(request, "crm", leadAssignmentId);
}
