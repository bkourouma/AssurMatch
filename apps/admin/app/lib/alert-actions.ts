"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = "/dashboard/compliance-alerts";

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Spec 061 FR-004: acknowledges one alert with an audited reason (super/compliance admins, MFA). */
export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  const id = stringValue(formData.get("alertId"));
  const reason = stringValue(formData.get("reason")).trim();
  if (!UUID.test(id) || reason.length < 8) redirect(`${PAGE}?alert=invalid`);
  const token = await getBackOfficeToken();
  if (!token) redirect(loginRedirect(PAGE, "session_expired"));
  const status = await fetch(`${backOfficeApiBaseUrl()}/admin/alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ reason }),
    cache: "no-store"
  }).then((response) => response.status, () => 0);
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  const outcome = status === 200 ? "acknowledged" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 409 ? "already" : status === 400 ? "invalid" : "error";
  redirect(`${PAGE}?alert=${outcome}`);
}
