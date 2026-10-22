import { relayConversationAttachment } from "../../../../../../../lib/conversation-relay";

/** Spec 062 (Starter): attachment of a conversation message, downloaded with the session (audited, no-store). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadAssignmentId: string; messageId: string; attachmentId: string }> }
): Promise<Response> {
  const { leadAssignmentId, messageId, attachmentId } = await params;
  return relayConversationAttachment("starter", leadAssignmentId, messageId, attachmentId);
}
