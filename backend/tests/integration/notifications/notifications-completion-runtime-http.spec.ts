import { afterEach, describe, expect, it } from "vitest";
import type { AdminAlertView, AdminAlertsListResponse } from "../../../../packages/shared/contracts/admin-alerts.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const compliance: ActorContext = { actorId: "compliance-061", roles: ["compliance_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support-061", roles: ["support_admin"], mfaVerified: true };

async function call(harness: RuntimeHttpHarness, actor: ActorContext | undefined, method: string, path: string, body?: unknown) {
  return harness.request(path, {
    method,
    headers: { ...(actor ? actorHeaders(actor) : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

describe("spec 061 notifications completion runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCompliance = process.env.ASSURMATCH_COMPLIANCE_ALERT_EMAIL;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    if (previousCompliance === undefined) delete process.env.ASSURMATCH_COMPLIANCE_ALERT_EMAIL;
    else process.env.ASSURMATCH_COMPLIANCE_ALERT_EMAIL = previousCompliance;
  });

  it("raises admin alerts from the scheduled job, lists them by role and acknowledges with audit", async () => {
    process.env.ASSURMATCH_COMPLIANCE_ALERT_EMAIL = "conformite@assurmatch.example";
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    // The seeded licence expires in 2030; one of the partner expiring in 20 days crosses J-30.
    const soon = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await harness.runtime.partnerLicenses.service.create({
      partnerTenantId: seed.partner.id,
      licenseNumber: "LIC-SOON",
      issuingAuthority: "Regulator",
      countryId: seed.country.id,
      productIds: [seed.product.id],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: soon
    }, seed.admin);

    const first = await harness.runtime.scheduledAlerts.run();
    expect(first).toMatchObject({ brokerCreated: 1, adminCreated: 1, failed: 0 });
    expect(await harness.runtime.scheduledAlerts.run()).toMatchObject({ brokerCreated: 0, adminCreated: 0 });

    expect((await call(harness, undefined, "GET", "/admin/alerts")).status).toBe(401);
    const brokerActor: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await call(harness, brokerActor, "GET", "/admin/alerts")).status).toBe(403);
    expect((await call(harness, compliance, "GET", "/admin/alerts?status=bogus")).status).toBe(400);

    const listed = await readJson<AdminAlertsListResponse>(await call(harness, support, "GET", "/admin/alerts"));
    expect(listed.open).toBe(1);
    const [alert] = listed.items;
    expect(alert).toMatchObject({ type: "license_expiring", status: "open", partnerTenantId: seed.partner.id, details: { threshold: 30 } });

    expect((await call(harness, support, "POST", `/admin/alerts/${alert!.id}/acknowledge`, { reason: "Relance envoyee au courtier" })).status).toBe(403);
    expect((await call(harness, compliance, "POST", `/admin/alerts/${alert!.id}/acknowledge`, { reason: "court" })).status).toBe(400);
    expect((await call(harness, compliance, "POST", "/admin/alerts/00000000-0000-4000-8000-000000000999/acknowledge", { reason: "Relance envoyee au courtier" })).status).toBe(404);
    const acknowledged = await call(harness, compliance, "POST", `/admin/alerts/${alert!.id}/acknowledge`, { reason: "Relance envoyee au courtier" });
    expect(acknowledged.status).toBe(200);
    expect(await readJson<AdminAlertView>(acknowledged)).toMatchObject({ status: "acknowledged", acknowledgedById: "compliance-061" });
    expect((await call(harness, compliance, "POST", `/admin/alerts/${alert!.id}/acknowledge`, { reason: "Relance envoyee au courtier" })).status).toBe(409);
    expect(harness.runtime.audit.writer.search({ action: "admin_alert.acknowledged" })).toHaveLength(1);
    expect((await readJson<AdminAlertsListResponse>(await call(harness, compliance, "GET", "/admin/alerts"))).open).toBe(0);

    // E-mails are pointers: the broker's names the alert kind and the portal, never the licence.
    const delivered: Array<{ to: string; subject: string; body: string }> = [];
    const email = harness.runtime.emailDelivery as unknown as { send: (payload: { to: string; subject: string; body: string }) => Promise<{ status: string }> };
    email.send = async (payload) => { delivered.push(payload); return { status: "sent" }; };
    await harness.runtime.quoteNotificationDelivery.processDueNotifications({ limit: 50 });
    const brokerMail = delivered.find((mail) => mail.to === "runtime@broker.example");
    expect(brokerMail?.subject).toBe("Licence bientot expiree");
    expect(brokerMail?.body).toContain("/licenses");
    expect(brokerMail?.body).not.toContain("LIC-SOON");
    const complianceMail = delivered.find((mail) => mail.to === "conformite@assurmatch.example");
    expect(complianceMail?.body).toContain("/dashboard/compliance-alerts");
    expect(complianceMail?.body).not.toContain(seed.partner.id);
  });

  it("unsubscribes from the satisfaction survey with a signed token, without authentication", async () => {
    harness = await createRuntimeHttpHarness();
    const token = harness.runtime.satisfactionSurveys.unsubscribe.linkToken("visitor@example.test", "en");
    expect((await call(harness, undefined, "POST", "/notifications/unsubscribe", { token: `${token}tampered` })).status).toBe(404);
    expect((await call(harness, undefined, "POST", "/notifications/unsubscribe", {})).status).toBe(404);
    const response = await call(harness, undefined, "POST", "/notifications/unsubscribe", { token });
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "unsubscribed", locale: "en" });
    expect(await harness.runtime.satisfactionSurveys.unsubscribe.isUnsubscribed("VISITOR@example.test")).toBe(true);
  });
});
