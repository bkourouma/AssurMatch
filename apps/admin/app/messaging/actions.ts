"use server";

import { revalidatePath } from "next/cache";
import { sendMessagingTest } from "../lib/admin-api";

export interface MessagingTestActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Spec 073 T403: smoke test of an optional channel. The server stays the authority on roles and on
 * the closed flag / missing provider; the recipient typed here is never echoed back, only the masked
 * value returned by the API is shown.
 */
export async function sendMessagingTestAction(_previous: MessagingTestActionState, formData: FormData): Promise<MessagingTestActionState> {
  try {
    const channel = stringValue(formData.get("channel"));
    if (channel !== "sms" && channel !== "whatsapp") return { status: "error", message: "Canal invalide." };
    const result = await sendMessagingTest({
      channel,
      recipient: stringValue(formData.get("recipient")),
      scopeId: stringValue(formData.get("scopeId")) || "admin-messaging-test",
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/messaging");
    if (result.status === "sent") return { status: "success", message: `Message de test accepte (destinataire ${result.recipientMasked}, fournisseur ${result.provider}).` };
    return { status: "error", message: `Message de test refuse (${result.status}) : ${result.reason ?? "motif non communique"} (destinataire ${result.recipientMasked}).` };
  } catch (error) {
    const code = error instanceof Error ? error.message : "action_failed";
    return { status: "error", message: code === "access_denied" ? "Acces refuse : l'envoi de test est reserve au super administrateur." : code };
  }
}
