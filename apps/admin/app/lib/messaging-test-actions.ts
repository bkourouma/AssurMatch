"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

export interface MessagingTestActionState {
  status: "idle" | "success" | "error";
  message?: string;
  /** Delivery outcome as returned by the API; the recipient is only ever the masked form. */
  delivery?: { status: string; recipientMasked: string; reason: string | null };
}

const CHANNELS = new Set(["sms", "whatsapp"]);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failure(message: string): MessagingTestActionState {
  return { status: "error", message };
}

/**
 * Spec 074 FR-010: sends one test message through POST /admin/messaging/test. The API restricts it
 * to super admins with MFA. The recipient travels only in the request body and is never echoed,
 * logged or placed in a URL; the result shows the masked recipient returned by the API.
 */
export async function sendMessagingTestAction(_previous: MessagingTestActionState, formData: FormData): Promise<MessagingTestActionState> {
  const channel = text(formData, "channel");
  const recipient = text(formData, "recipient");
  const scopeId = text(formData, "scopeId");
  const reason = text(formData, "reason");

  if (!CHANNELS.has(channel)) return failure("Canal invalide : choisissez SMS ou WhatsApp.");
  if (recipient.length < 5 || recipient.length > 120) return failure("Destinataire obligatoire (5 a 120 caracteres).");
  if (scopeId.length === 0) return failure("Identifiant de portee obligatoire.");
  if (reason.length < 3 || reason.length > 300) return failure("Motif obligatoire (3 a 300 caracteres), conserve dans l'audit.");

  const token = await getBackOfficeToken();
  if (!token) redirect(loginRedirect("/messaging", "session_required"));

  let response: Response;
  try {
    response = await fetch(`${backOfficeApiBaseUrl()}/admin/messaging/test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ channel, scopeId, recipient, reason }),
      cache: "no-store"
    });
  } catch {
    return failure("Service indisponible : le message de test n'a pas ete envoye.");
  }

  if (response.status === 401) redirect(loginRedirect("/messaging", "session_expired"));
  if (response.status === 403) return failure("Action refusee : reservee au super admin, MFA requis.");
  if (response.status === 422) return failure("Message de test refuse : verifiez le canal, le destinataire et la portee.");
  if (!response.ok) return failure("Message de test non envoye : erreur inattendue du service.");

  try {
    const body = await response.json() as { status?: unknown; recipientMasked?: unknown; reason?: unknown };
    const status = typeof body.status === "string" ? body.status : "unknown";
    return {
      status: status === "sent" ? "success" : "error",
      message: status === "sent" ? "Message de test envoye." : "Message de test non envoye.",
      delivery: {
        status,
        recipientMasked: typeof body.recipientMasked === "string" ? body.recipientMasked : "-",
        reason: typeof body.reason === "string" ? body.reason : null
      }
    };
  } catch {
    return failure("Reponse du service illisible.");
  }
}
