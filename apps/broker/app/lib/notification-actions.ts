"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

async function callBrokerApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return response.status;
  } catch {
    return 0;
  }
}

function outcome(status: number, success: string): string {
  if (status === 200 || status === 201) return success;
  if (status === 403) return "forbidden";
  if (status === 409) return "baseline";
  return "error";
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const id = stringValue(formData.get("notificationId"));
  if (!UUID.test(id)) redirect("/notifications?notif=error");
  const status = await callBrokerApi(`/broker/notifications/inbox/${id}/read`, "POST", {});
  if (status === 401) redirect(loginRedirect("/notifications", "session_expired"));
  redirect(`/notifications?notif=${outcome(status, "read")}`);
}

/** Email and in-app stay on: only the optional channels are toggled here. */
export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const status = await callBrokerApi("/broker/notifications/preferences", "PUT", {
    sms: stringValue(formData.get("sms")) === "on",
    whatsapp: stringValue(formData.get("whatsapp")) === "on",
    reason: stringValue(formData.get("reason")).trim() || "Mise a jour des canaux par le cabinet"
  });
  if (status === 401) redirect(loginRedirect("/notifications", "session_expired"));
  redirect(`/notifications?notif=${outcome(status, "preferences_saved")}`);
}
