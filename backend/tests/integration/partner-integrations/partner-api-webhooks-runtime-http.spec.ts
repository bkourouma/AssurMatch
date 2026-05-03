import { afterEach, describe, expect, it } from "vitest";
import { partnerApiKeyCreateResponseSchema, partnerApiKeysResponseSchema, partnerApiLeadsResponseSchema, partnerWebhookDeliveriesResponseSchema, partnerWebhookEndpointCreateResponseSchema, partnerWebhookEndpointsResponseSchema } from "../../../../packages/shared/contracts";
import { PartnerIntegrationAuditActions } from "../../../src/modules/partner-integrations/partner-integrations.module";
import { signWebhookPayload, verifyWebhookSignature } from "../../../src/modules/partner-integrations/webhook-signature.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, simulationActorHeaders, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("partner API and webhooks runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates hashed API keys and keeps the Partner API disabled by default", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const partner = await harness.runtime.partners.service.create({
      legalName: "API Broker",
      plan: "pro",
      primaryEmail: "api@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);

    const createResponse = await harness.request("/admin/partner-integrations/api-keys", {
      method: "POST",
      headers: { ...actorHeaders(admin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partner.id, name: "Read leads", scopes: ["leads:read_assigned"], reason: "Partner API test issuance" })
    });
    expect(createResponse.status).toBe(201);
    const created = partnerApiKeyCreateResponseSchema.parse(await readJson(createResponse));
    expect(created.rawKey).toMatch(/^am_pk_/);

    const keysResponse = await harness.request("/admin/partner-integrations/api-keys", { headers: actorHeaders(admin) });
    const keys = partnerApiKeysResponseSchema.parse(await readJson(keysResponse));
    expect(JSON.stringify(keys)).not.toContain(created.rawKey);
    expect(keys.items[0]?.keyPrefix).toBe(created.key.keyPrefix);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.apiKeyCreated })[0]?.result).toBe("success");

    const disabled = await harness.request("/partner-api/v1/leads", { headers: { Authorization: `Bearer ${created.rawKey}` } });
    expect(disabled.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.apiReadRefused }).at(-1)?.reason).toBe("feature_disabled");
  });

  it("uses API-key tenant scope for assigned leads and refuses wrong scopes, simulation headers and revoked keys", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "super", roles: ["super_admin" as const], mfaVerified: true };
    enableFlag(harness, "partner_api_enabled");
    const partnerA = await harness.runtime.partners.service.create({
      legalName: "Tenant A",
      plan: "pro",
      primaryEmail: "a@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);
    const partnerB = await harness.runtime.partners.service.create({
      legalName: "Tenant B",
      plan: "pro",
      primaryEmail: "b@broker.example",
      primaryWhatsApp: "+2250102030406",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);
    await harness.runtime.leads.assignments.create({
      quoteRequestId: "tenant-a-q",
      partnerTenantId: partnerA.id,
      assignmentReason: "routing",
      publicReference: "A-1",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "visitor@example.test", phone: "+2250102030407" },
      answers: { secret: "must-not-leak" }
    }, { actorId: "router", roles: ["super_admin"], mfaVerified: true });
    await harness.runtime.leads.assignments.create({
      quoteRequestId: "tenant-b-q",
      partnerTenantId: partnerB.id,
      assignmentReason: "routing",
      publicReference: "B-1",
      countryCode: "CI",
      productKey: "auto"
    }, { actorId: "router", roles: ["super_admin"], mfaVerified: true });

    const leadKey = await createApiKey(harness, admin, partnerA.id, ["leads:read_assigned"]);
    const notificationKey = await createApiKey(harness, admin, partnerA.id, ["notifications:read"]);

    const simulationOnly = await harness.request("/partner-api/v1/leads", { headers: simulationActorHeaders({ actorId: "test", roles: ["super_admin"], mfaVerified: true }) });
    expect(simulationOnly.status).toBe(401);

    const leadsResponse = await harness.request("/partner-api/v1/leads?page=1&pageSize=10", { headers: { Authorization: `Bearer ${leadKey}` } });
    expect(leadsResponse.status).toBe(200);
    const leads = partnerApiLeadsResponseSchema.parse(await readJson(leadsResponse));
    expect(leads.total).toBe(1);
    expect(leads.items[0]).toMatchObject({ publicReference: "A-1", countryCode: "CI", productKey: "auto" });
    expect(JSON.stringify(leads)).not.toContain("visitor@example.test");
    expect(JSON.stringify(leads)).not.toContain("must-not-leak");

    const wrongScope = await harness.request("/partner-api/v1/leads", { headers: { Authorization: `Bearer ${notificationKey}` } });
    expect(wrongScope.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.apiReadRefused }).at(-1)?.reason).toBe("missing_scope");

    const keyRecord = (await harness.runtime.partnerIntegrations.service.listApiKeys(admin)).items.find((item) => item.keyPrefix === leadKey.slice(0, 16));
    expect(keyRecord).toBeDefined();
    await harness.request(`/admin/partner-integrations/api-keys/${keyRecord?.id}/revoke`, {
      method: "POST",
      headers: { ...actorHeaders(admin), "content-type": "application/json" },
      body: JSON.stringify({ reason: "Partner API test revocation" })
    });
    const revoked = await harness.request("/partner-api/v1/leads", { headers: { Authorization: `Bearer ${leadKey}` } });
    expect(revoked.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.apiReadRefused }).at(-1)?.reason).toBe("api_key_revoked");
  });

  it("stores webhook endpoints disabled by default, blocks unsafe URLs and redacts delivery metadata", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
    const partner = await harness.runtime.partners.service.create({
      legalName: "Webhook Broker",
      plan: "enterprise",
      primaryEmail: "hooks@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);

    const unsafe = await harness.request("/admin/partner-integrations/webhook-endpoints", {
      method: "POST",
      headers: { ...actorHeaders(admin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partner.id, url: "https://127.0.0.1/hooks", eventTypes: ["lead.assigned"], reason: "Partner webhook unsafe URL test" })
    });
    expect(unsafe.status).toBe(400);

    const endpointResponse = await harness.request("/admin/partner-integrations/webhook-endpoints", {
      method: "POST",
      headers: { ...actorHeaders(admin), "content-type": "application/json" },
      body: JSON.stringify({ partnerTenantId: partner.id, url: "https://hooks.partner.example/assurmatch", eventTypes: ["lead.assigned", "notification.failed"], reason: "Partner webhook endpoint test" })
    });
    expect(endpointResponse.status).toBe(201);
    const created = partnerWebhookEndpointCreateResponseSchema.parse(await readJson(endpointResponse));
    expect(created.signingSecret).toMatch(/^whsec_/);
    expect(created.endpoint.status).toBe("disabled");

    const endpoints = partnerWebhookEndpointsResponseSchema.parse(await readJson(await harness.request("/admin/partner-integrations/webhook-endpoints", { headers: actorHeaders(admin) })));
    expect(JSON.stringify(endpoints)).not.toContain(created.signingSecret);
    expect(endpoints.items[0]).toMatchObject({ secretConfigured: true, status: "disabled" });

    const skipped = await harness.runtime.partnerIntegrations.service.prepareWebhookDelivery({
      partnerTenantId: partner.id,
      eventType: "lead.assigned",
      data: {
        leadAssignmentId: "00000000-0000-4000-8000-000000000777",
        publicReference: "HOOK-1",
        countryCode: "CI",
        productKey: "auto",
        status: "assigned",
        email: "visitor@example.test",
        phone: "+2250102030405",
        aiPrompt: "do not leak",
        payment: "none"
      }
    });
    expect(skipped[0]?.status).toBe("skipped");
    const deliveries = partnerWebhookDeliveriesResponseSchema.parse(await readJson(await harness.request("/admin/partner-integrations/webhook-deliveries", { headers: actorHeaders(admin) })));
    const serialized = JSON.stringify(deliveries);
    expect(serialized).not.toContain("visitor@example.test");
    expect(serialized).not.toContain("+2250102030405");
    expect(serialized).not.toContain("aiPrompt");
    expect(serialized).not.toContain("payment");
    expect(serialized).not.toContain("X-AssurMatch-Signature\":\"v1=");
    expect(deliveries.items[0]?.payloadMetadata).toMatchObject({ containsPii: false });

    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = { ok: true };
    const signature = signWebhookPayload(created.signingSecret, timestamp, "evt_test", "idem_test", payload);
    expect(verifyWebhookSignature({ secret: created.signingSecret, timestamp, eventId: "evt_test", idempotencyKey: "idem_test", payload, signature })).toBe(true);
    expect(verifyWebhookSignature({ secret: created.signingSecret, timestamp: String(Number(timestamp) - 1000), eventId: "evt_test", idempotencyKey: "idem_test", payload, signature })).toBe(false);
  });
});

async function createApiKey(harness: RuntimeHttpHarness, admin: Parameters<typeof actorHeaders>[0], partnerTenantId: string, scopes: string[]): Promise<string> {
  const response = await harness.request("/admin/partner-integrations/api-keys", {
    method: "POST",
    headers: { ...actorHeaders(admin), "content-type": "application/json" },
    body: JSON.stringify({ partnerTenantId, name: scopes.join(","), scopes, reason: "Partner API runtime test key" })
  });
  expect(response.status).toBe(201);
  return partnerApiKeyCreateResponseSchema.parse(await readJson(response)).rawKey;
}

function enableFlag(harness: RuntimeHttpHarness, key: string): void {
  const service = harness.runtime.featureFlags.service as unknown as { flags: Array<Record<string, unknown>> };
  service.flags.push({
    id: crypto.randomUUID(),
    key,
    scopeType: "global",
    value: true,
    defaultValue: false,
    reason: "test-only direct enable",
    changedAt: new Date(),
    cacheVersion: 1
  });
}
