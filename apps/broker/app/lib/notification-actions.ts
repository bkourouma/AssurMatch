"use server";

import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { callBrokerWrite, type BrokerWriteResult } from "./broker-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function callBrokerApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<BrokerWriteResult> {
  return callBrokerWrite(path, method, body);
}

function outcome(result: BrokerWriteResult, success: string): string {
  const { status } = result;
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED is shown as "Compte suspendu : consultation seule".
  if (result.suspended) return "suspended";
  if (status === 200 || status === 201) return success;
  if (status === 403) return "forbidden";
  if (status === 409) return "baseline";
  return "error";
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const id = stringValue(formData.get("notificationId"));
  if (!UUID.test(id)) redirect("/notifications?notif=error");
  const result = await callBrokerApi(`/broker/notifications/inbox/${id}/read`, "POST", {});
  if (result.status === 401) redirect(loginRedirect("/notifications", "session_expired"));
  redirect(`/notifications?notif=${outcome(result, "read")}`);
}

/** Email and in-app stay on: only the optional channels are toggled here. */
export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const result = await callBrokerApi("/broker/notifications/preferences", "PUT", {
    sms: stringValue(formData.get("sms")) === "on",
    whatsapp: stringValue(formData.get("whatsapp")) === "on",
    reason: stringValue(formData.get("reason")).trim() || "Mise a jour des canaux par le cabinet"
  });
  if (result.status === 401) redirect(loginRedirect("/notifications", "session_expired"));
  redirect(`/notifications?notif=${outcome(result, "preferences_saved")}`);
}
