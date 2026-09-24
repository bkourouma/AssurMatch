import { afterEach, describe, expect, it } from "vitest";
import { messagingProvidersResponseSchema, type MessagingProvidersResponse } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { MessagingProviderAuditActions } from "../../../src/modules/notifications/messaging-provider-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("messaging provider abstraction runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("reports SMS and WhatsApp providers disabled by default without secrets", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/messaging/providers", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const body = messagingProvidersResponseSchema.parse(await readJson<MessagingProvidersResponse>(response));
    expect(body.providers).toHaveLength(2);
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "sms", enabled: false, sendCapable: false, flagKey: "sms_enabled" }),
      expect.objectContaining({ channel: "whatsapp", enabled: false, sendCapable: false, flagKey: "whatsapp_enabled" })
    ]));
    expect(JSON.stringify(body)).not.toContain("API_KEY");
    expect(harness.runtime.audit.writer.search({ action: MessagingProviderAuditActions.statusRead })[0]?.result).toBe("success");
  });

  it("refuses broker access to provider status", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_starter" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000001101",
      partnerPlan: "starter" as const,
      mfaVerified: true
    };
    const response = await harness.request("/admin/messaging/providers", { headers: actorHeaders(broker) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: MessagingProviderAuditActions.statusRefused })[0]?.reason).toBe("forbidden_role");
  });
});
