import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, type RuntimeHttpHarness } from "../runtime-http-test-utils";

export const superAdmin: ActorContext = { actorId: "11111111-1111-4111-8111-111111111111", roles: ["super_admin"], mfaVerified: true };
export const complianceAdmin: ActorContext = { actorId: "22222222-2222-4222-8222-222222222222", roles: ["compliance_admin"], mfaVerified: true };
export const supportAdmin: ActorContext = { actorId: "33333333-3333-4333-8333-333333333333", roles: ["support_admin"], mfaVerified: true };

export function countryAdmin(countryId: string): ActorContext {
  return { actorId: "44444444-4444-4444-8444-444444444444", roles: ["admin_pays"], mfaVerified: true, countryScopes: [countryId] };
}

export async function call<T = Record<string, unknown>>(
  harness: RuntimeHttpHarness,
  actor: ActorContext,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: T }> {
  const response = await harness.request(path, {
    method,
    headers: { ...actorHeaders(actor), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

export const senegal = {
  isoCode: "SN",
  name: "Senegal",
  currency: "XOF",
  languages: ["fr", "en"],
  timezone: "Africa/Dakar",
  regulatoryFamily: "cima",
  phoneDialCode: "+221",
  phoneNationalLengths: [9],
  reason: "ouverture SC-01 Senegal"
};

export function auditEntries(harness: RuntimeHttpHarness, action: string, result?: "success" | "refused") {
  return harness.runtime.audit.writer.all().filter((entry) => entry.action === action && (!result || entry.result === result));
}
