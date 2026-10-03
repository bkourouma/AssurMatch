"use server";

import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { callBrokerWrite, type BrokerWriteResult } from "./broker-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function callEnterpriseApi(path: string, method: "POST" | "PUT" | "PATCH", body: Record<string, unknown>): Promise<BrokerWriteResult> {
  return callBrokerWrite(path, method, body);
}

function outcome(result: BrokerWriteResult, success: string): string {
  const { status } = result;
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED is shown as "Compte suspendu : consultation seule".
  if (result.suspended) return "suspended";
  if (status === 200 || status === 201) return success;
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid";
  return "error";
}

export async function createAgencyAction(formData: FormData): Promise<void> {
  const name = stringValue(formData.get("name")).trim();
  const countryCode = stringValue(formData.get("countryCode")).trim().toUpperCase();
  const reason = stringValue(formData.get("reason")).trim();
  if (!name || countryCode.length !== 2 || reason.length < 3) redirect("/enterprise?ent=invalid");
  const result = await callEnterpriseApi("/broker/enterprise/agencies", "POST", { name, countryCode, city: stringValue(formData.get("city")).trim() || undefined, reason });
  if (result.status === 401) redirect(loginRedirect("/enterprise", "session_expired"));
  redirect(`/enterprise?ent=${outcome(result, "agency_created")}`);
}

export async function assignAgencyMemberAction(formData: FormData): Promise<void> {
  const agencyId = stringValue(formData.get("agencyId"));
  const memberId = stringValue(formData.get("memberId")).trim();
  if (!UUID.test(agencyId) || !memberId) redirect("/enterprise?ent=invalid");
  const result = await callEnterpriseApi(`/broker/enterprise/agencies/${agencyId}/members`, "POST", { memberId, reason: stringValue(formData.get("reason")).trim() || "Rattachement d'un membre" });
  if (result.status === 401) redirect(loginRedirect("/enterprise", "session_expired"));
  redirect(`/enterprise?ent=${outcome(result, "member_assigned")}`);
}

/** Only broker CRM permissions can be granted; the API rejects anything else. */
export async function createCustomRoleAction(formData: FormData): Promise<void> {
  const name = stringValue(formData.get("name")).trim();
  const permissions = formData.getAll("permissions").map((value) => stringValue(value)).filter(Boolean);
  const reason = stringValue(formData.get("reason")).trim();
  if (!name || permissions.length === 0 || reason.length < 3) redirect("/enterprise?ent=invalid");
  const result = await callEnterpriseApi("/broker/enterprise/roles", "POST", { name, permissions, reason });
  if (result.status === 401) redirect(loginRedirect("/enterprise", "session_expired"));
  redirect(`/enterprise?ent=${outcome(result, "role_created")}`);
}

export async function updateSlaAction(formData: FormData): Promise<void> {
  const minutes = Number(stringValue(formData.get("firstActionTargetMinutes")));
  if (!Number.isInteger(minutes) || minutes < 5) redirect("/enterprise?ent=invalid");
  const result = await callEnterpriseApi("/broker/enterprise/sla", "PUT", { firstActionTargetMinutes: minutes, reason: stringValue(formData.get("reason")).trim() || "Mise a jour de l'engagement de reactivite" });
  if (result.status === 401) redirect(loginRedirect("/enterprise", "session_expired"));
  // Spec 051 R9: 422 SLA_TARGET_EXCEEDS_CONTRACT when the target is looser than the contractual one.
  redirect(`/enterprise?ent=${result.status === 422 ? "sla_contract" : outcome(result, "sla_saved")}`);
}

/** Branding applies to the broker back-office only, never to the public comparator. */
export async function updateBrandingAction(formData: FormData): Promise<void> {
  const displayLabel = stringValue(formData.get("displayLabel")).trim();
  const primaryColor = stringValue(formData.get("primaryColor")).trim();
  if (!displayLabel || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) redirect("/enterprise?ent=invalid");
  const result = await callEnterpriseApi("/broker/enterprise/branding", "PUT", { displayLabel, primaryColor, reason: stringValue(formData.get("reason")).trim() || "Mise a jour de la charte interne" });
  if (result.status === 401) redirect(loginRedirect("/enterprise", "session_expired"));
  redirect(`/enterprise?ent=${outcome(result, "branding_saved")}`);
}
