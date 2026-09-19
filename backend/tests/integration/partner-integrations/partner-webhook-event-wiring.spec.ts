import { afterEach, describe, expect, it } from "vitest";
import { PartnerIntegrationAuditActions } from "../../../src/modules/partner-integrations/partner-integration-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

interface DeliveryRow {
  id: string;
  partnerTenantId: string;
  eventType: string;
  status: string;
  payload?: Record<string, unknown>;
}

async function listDeliveries(harness: RuntimeHttpHarness): Promise<DeliveryRow[]> {
  const page = await readJson<{ items: DeliveryRow[] }>(await harness.request("/admin/partner-integrations/webhook-deliveries", { headers: actorHeaders(superAdmin) }));
  return page.items;
}

describe("partner webhook event wiring", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  it("records a skipped delivery when webhooks are disabled without breaking the assignment", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const assignment = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-webhook-1",
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "ama@example.test", phone: "+2250102030405" },
      answers: { vehicle_use: "prive" }
    }, superAdmin);
    expect(assignment.id).toBeTruthy();

    const deliveries = await listDeliveries(harness);
    const assigned = deliveries.filter((delivery) => delivery.eventType === "lead.assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({ status: "skipped", partnerTenantId: seed.partner.id });
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookDeliverySkipped })[0]?.reason).toBe("feature_disabled");
    expect(JSON.stringify(deliveries)).not.toContain("ama@example.test");
    expect(JSON.stringify(deliveries)).not.toContain("+2250102030405");
  });

  it("publishes lead.assigned and lead.status_changed to the assigned tenant only", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "partner_webhooks_enabled", scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-WEBHOOK-POLICY", approvedBy: "compliance" });
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "partner_api_enabled", scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-WEBHOOK-POLICY", approvedBy: "compliance" });

    await harness.request("/admin/partner-integrations/webhook-allowlist", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), ...json },
      body: JSON.stringify({ partnerTenantId: seed.partner.id, origin: "https://partner.example", path: "/hooks/assurmatch", reason: "Endpoint pilote" })
    });
    const endpointResponse = await harness.request("/admin/partner-integrations/webhook-endpoints", {
      method: "POST",
      headers: { ...actorHeaders(superAdmin), ...json },
      body: JSON.stringify({ partnerTenantId: seed.partner.id, url: "https://partner.example/hooks/assurmatch", eventTypes: ["lead.assigned", "lead.status_changed"], reason: "Endpoint pilote" })
    });
    expect(endpointResponse.status).toBe(201);
    // Endpoints are created disabled on purpose: an admin must activate them explicitly.
    const created = await readJson<{ endpoint: { id: string } }>(endpointResponse);
    const activation = await harness.request(`/admin/partner-integrations/webhook-endpoints/${created.endpoint.id}`, {
      method: "PATCH",
      headers: { ...actorHeaders(superAdmin), ...json },
      body: JSON.stringify({ status: "active", reason: "Activation de l'endpoint pilote" })
    });
    expect(activation.status).toBe(200);

    const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    const assignment = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-webhook-2",
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      publicReference: "AM-WH-2",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "kofi@example.test" },
      answers: { vehicle_use: "prive" }
    }, superAdmin);

    const statusResponse = await harness.request(`/broker/crm/leads/${assignment.id}/status`, { method: "POST", headers: { ...actorHeaders(broker), ...json }, body: JSON.stringify({ status: "contacte" }) });
    expect(statusResponse.status).toBe(201);

    const deliveries = await listDeliveries(harness);
    const assigned = deliveries.find((delivery) => delivery.eventType === "lead.assigned");
    const changed = deliveries.find((delivery) => delivery.eventType === "lead.status_changed");
    expect(assigned).toMatchObject({ status: "pending", partnerTenantId: seed.partner.id });
    expect(changed).toMatchObject({ status: "pending", partnerTenantId: seed.partner.id });
    expect(deliveries.every((delivery) => delivery.partnerTenantId === seed.partner.id)).toBe(true);

    const prepared = harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookDeliveryPrepared });
    expect(prepared.length).toBeGreaterThanOrEqual(2);
    const changeContext = prepared.at(-1)?.context as { payloadMetadata?: { dataKeys?: string[]; containsPii?: boolean } } | undefined;
    expect(changeContext?.payloadMetadata?.dataKeys).toEqual(["countryCode", "leadAssignmentId", "previousStatus", "productKey", "publicReference", "status"]);
    expect(changeContext?.payloadMetadata?.containsPii).toBe(false);
    expect(JSON.stringify(prepared)).not.toContain("kofi@example.test");
  });

  it("keeps the notification update working when the webhook preparation fails", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const runtime = harness.runtime;
    const original = runtime.partnerIntegrations.service.prepareWebhookDelivery.bind(runtime.partnerIntegrations.service);
    runtime.partnerIntegrations.service.prepareWebhookDelivery = async () => {
      throw new Error("integration unavailable");
    };
    try {
      const assignment = await runtime.leads.assignments.create({
        quoteRequestId: "q-webhook-3",
        partnerTenantId: seed.partner.id,
        assignmentReason: "routing",
        countryCode: "CI",
        productKey: "auto"
      }, superAdmin);
      expect(assignment.id).toBeTruthy();
      const failure = runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookDeliverySkipped }).find((entry) => entry.reason === "event_publication_failed");
      expect(failure?.result).toBe("failed");
    } finally {
      runtime.partnerIntegrations.service.prepareWebhookDelivery = original;
    }
  });
});
