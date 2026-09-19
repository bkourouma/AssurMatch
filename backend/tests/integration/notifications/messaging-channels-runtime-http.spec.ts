import { afterEach, describe, expect, it } from "vitest";
import {
  inAppNotificationSchema,
  messagingDeliverySchema,
  messagingProvidersResponseSchema,
  notificationPreferencesSchema
} from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { MessagingProviderAuditActions } from "../../../src/modules/notifications/messaging-provider-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const TENANT = "00000000-0000-4000-8000-00000000c001";
const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };
const otherBroker: ActorContext = { actorId: "other", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-00000000c002", partnerPlan: "pro", mfaVerified: true };
const json = { "content-type": "application/json" };

describe("messaging channels, inbox and preferences runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previous = {
    sms: process.env.ASSURMATCH_SMS_PROVIDER,
    smsKey: process.env.ASSURMATCH_SMS_API_KEY,
    whatsapp: process.env.ASSURMATCH_WHATSAPP_PROVIDER,
    whatsappKey: process.env.ASSURMATCH_WHATSAPP_API_KEY
  };

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_SMS_PROVIDER = previous.sms;
    process.env.ASSURMATCH_SMS_API_KEY = previous.smsKey;
    process.env.ASSURMATCH_WHATSAPP_PROVIDER = previous.whatsapp;
    process.env.ASSURMATCH_WHATSAPP_API_KEY = previous.whatsappKey;
  });

  it("keeps optional channels closed until flag, provider and opt-in all agree", async () => {
    delete process.env.ASSURMATCH_WHATSAPP_PROVIDER;
    delete process.env.ASSURMATCH_WHATSAPP_API_KEY;
    harness = await createRuntimeHttpHarness();

    const closed = messagingDeliverySchema.parse(await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "whatsapp", recipient: "+2250102030405", scopeId: TENANT, reason: "smoke test" }) }).then(readJson));
    expect(closed).toMatchObject({ status: "refused", reason: "channel_disabled", provider: "none" });
    expect(closed.recipientMasked).toBe("***405");
    const refusedAudit = harness.runtime.audit.writer.search({ action: MessagingProviderAuditActions.dispatchRefused }).at(-1);
    expect(JSON.stringify(refusedAudit)).not.toContain("0102030405");

    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "whatsapp_enabled", scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-MSG-POLICY", approvedBy: "compliance" });
    const unconfigured = messagingDeliverySchema.parse(await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "whatsapp", recipient: "+2250102030405", scopeId: TENANT, reason: "smoke test" }) }).then(readJson));
    expect(unconfigured).toMatchObject({ status: "refused", reason: "provider_not_configured" });

    const status = messagingProvidersResponseSchema.parse(await readJson(await harness.request("/admin/messaging/providers", { headers: actorHeaders(superAdmin) })));
    const whatsapp = status.providers.find((provider) => provider.channel === "whatsapp");
    expect(whatsapp).toMatchObject({ enabled: true, configured: false, sendCapable: false, reason: "provider_not_configured" });
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("delivers on an opted-in configured channel and refuses an opted-out recipient", async () => {
    process.env.ASSURMATCH_WHATSAPP_PROVIDER = "meta-cloud";
    process.env.ASSURMATCH_WHATSAPP_API_KEY = "secret-value";
    harness = await createRuntimeHttpHarness();
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "whatsapp_enabled", scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-MSG-POLICY", approvedBy: "compliance" });

    const optedOut = messagingDeliverySchema.parse(await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "whatsapp", recipient: "+2250102030405", scopeId: TENANT, reason: "smoke test" }) }).then(readJson));
    expect(optedOut).toMatchObject({ status: "refused", reason: "recipient_opted_out" });

    const baseline = notificationPreferencesSchema.parse(await readJson(await harness.request("/broker/notifications/preferences", { headers: actorHeaders(broker) })));
    expect(baseline).toMatchObject({ scopeId: TENANT, email: true, inApp: true, sms: false, whatsapp: false });
    expect((await harness.request("/broker/notifications/preferences", { method: "PUT", headers: { ...actorHeaders(broker), ...json }, body: JSON.stringify({ email: false, reason: "test" }) })).status).toBe(409);

    const updated = notificationPreferencesSchema.parse(await readJson(await harness.request("/broker/notifications/preferences", { method: "PUT", headers: { ...actorHeaders(broker), ...json }, body: JSON.stringify({ whatsapp: true, reason: "Le cabinet accepte WhatsApp" }) })));
    expect(updated).toMatchObject({ whatsapp: true, sms: false, email: true, inApp: true });
    expect(harness.runtime.audit.writer.search({ action: MessagingProviderAuditActions.preferencesChanged })[0]?.context).toMatchObject({ next: { whatsapp: true, sms: false } });

    const sent = messagingDeliverySchema.parse(await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "whatsapp", recipient: "+2250102030405", scopeId: TENANT, reason: "smoke test" }) }).then(readJson));
    expect(sent).toMatchObject({ status: "sent", channel: "whatsapp", provider: "logging", recipientMasked: "***405" });

    const deliveries = (await readJson<unknown[]>(await harness.request("/admin/messaging/deliveries", { headers: actorHeaders(support) }))).map((item) => messagingDeliverySchema.parse(item));
    expect(deliveries.some((delivery) => delivery.status === "sent")).toBe(true);
    expect(JSON.stringify(deliveries)).not.toContain("+2250102030405");
    expect((await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(support), ...json }, body: JSON.stringify({ channel: "sms", recipient: "+2250102030405", scopeId: TENANT, reason: "tentative" }) })).status).toBe(403);
  });

  it("delivers lead assignments to the tenant inbox only", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const assignment = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-notif-1",
      partnerTenantId: TENANT,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto"
    }, superAdmin);
    await harness.runtime.notifications.quoteService.queueBroker({ id: "q-notif-1", publicReference: seed.partner.id } as never, assignment, superAdmin, { allowRepeat: true });

    const inbox = (await readJson<unknown[]>(await harness.request("/broker/notifications/inbox", { headers: actorHeaders(broker) }))).map((item) => inAppNotificationSchema.parse(item));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ type: "broker_lead_assigned", read: false, targetType: "LeadAssignment", targetId: assignment.id });
    expect(inbox[0]?.body).toContain("aucun engagement contractuel");

    expect(await readJson<unknown[]>(await harness.request("/broker/notifications/inbox", { headers: actorHeaders(otherBroker) }))).toHaveLength(0);
    expect((await harness.request(`/broker/notifications/inbox/${inbox[0]?.id}/read`, { method: "POST", headers: { ...actorHeaders(otherBroker), ...json }, body: "{}" })).status).toBe(404);

    const read = inAppNotificationSchema.parse(await readJson(await harness.request(`/broker/notifications/inbox/${inbox[0]?.id}/read`, { method: "POST", headers: { ...actorHeaders(broker), ...json }, body: "{}" })));
    expect(read.read).toBe(true);
    expect((await harness.request("/broker/notifications/inbox", { headers: actorHeaders(support) })).status).toBe(403);
  });
});
