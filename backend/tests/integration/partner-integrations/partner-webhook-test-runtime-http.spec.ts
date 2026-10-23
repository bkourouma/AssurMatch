import { afterEach, describe, expect, it } from "vitest";
import type { PartnerWebhookTestResponse } from "../../../../packages/shared/contracts";
import { PartnerIntegrationAuditActions } from "../../../src/modules/partner-integrations/partner-integrations.module";
import { verifyWebhookSignature } from "../../../src/modules/partner-integrations/webhook-signature.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 7 / spec 074 (H-08): POST /admin/partner-integrations/webhook-endpoints/:id/test.
const admin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const adminNoMfa: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: false };
const json = { "content-type": "application/json" };
const HOOK_URL = "https://hooks.partner.example/assurmatch";
const REASON = "Verification de l'endpoint partenaire avant activation";

interface FetchCall {
  url: string;
  headers: Headers;
  body: string;
}

describe("partner webhook test runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  // Injects a fake outbound fetch and the outbound gate into the runtime service (never a real network call).
  function armOutbound(status = 204): FetchCall[] {
    const calls: FetchCall[] = [];
    const service = harness!.runtime.partnerIntegrations.service as unknown as { fetcher: typeof fetch; deps: { webhookDeliveryEnabled?: boolean } };
    service.fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      return { status } as Response;
    }) as typeof fetch;
    service.deps.webhookDeliveryEnabled = true;
    return calls;
  }

  async function openFlag() {
    await harness!.runtime.featureFlags.service.applyCompliancePolicy(
      { key: "partner_webhooks_enabled", scopeType: "global", value: true, reason: "webhook test route" },
      admin,
      { reference: "TEST-WEBHOOK-074", approvedBy: "compliance" }
    );
  }

  async function createEndpoint() {
    const partner = await harness!.runtime.partners.service.create({
      legalName: "Webhook Test Broker",
      plan: "enterprise",
      primaryEmail: "hooks@broker.example",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, admin);
    const allowlist = await harness!.request("/admin/partner-integrations/webhook-allowlist", {
      method: "POST",
      headers: { ...actorHeaders(admin), ...json },
      body: JSON.stringify({ partnerTenantId: partner.id, origin: "https://hooks.partner.example", path: "/assurmatch", reason: "Partner webhook test allow-list" })
    });
    expect(allowlist.status).toBe(201);
    const created = await harness!.request("/admin/partner-integrations/webhook-endpoints", {
      method: "POST",
      headers: { ...actorHeaders(admin), ...json },
      body: JSON.stringify({ partnerTenantId: partner.id, url: HOOK_URL, eventTypes: ["lead.assigned"], reason: "Partner webhook test endpoint" })
    });
    expect(created.status).toBe(201);
    const body = await readJson<{ endpoint: { id: string }; signingSecret: string }>(created);
    return { partner, endpointId: body.endpoint.id, secret: body.signingSecret };
  }

  function sendTest(endpointId: string, body: unknown, actor: ActorContext = admin) {
    return harness!.request(`/admin/partner-integrations/webhook-endpoints/${endpointId}/test`, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  }

  it("refuses an anonymous or MFA-less caller and a payload that is too short", async () => {
    harness = await createRuntimeHttpHarness();
    const { endpointId } = await createEndpoint();

    expect((await harness.request(`/admin/partner-integrations/webhook-endpoints/${endpointId}/test`, { method: "POST", headers: json, body: JSON.stringify({ reason: REASON }) })).status).toBe(401);
    expect((await sendTest(endpointId, { reason: REASON }, adminNoMfa)).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookTestRefused }).length).toBe(0);

    // The controller validates the body (parseHttpInput): schema failures give 400.
    const tooShort = await sendTest(endpointId, { reason: "court" });
    expect(tooShort.status).toBe(400);
    const missing = await sendTest(endpointId, {});
    expect(missing.status).toBe(400);
  });

  it("answers refused/feature_disabled without any outbound call while partner webhooks are closed", async () => {
    harness = await createRuntimeHttpHarness();
    const calls = armOutbound();
    const { endpointId } = await createEndpoint();

    const response = await sendTest(endpointId, { reason: REASON });
    expect(response.status).toBe(200);
    const result = await readJson<PartnerWebhookTestResponse>(response);
    expect(result).toMatchObject({ endpointId, eventType: "webhook.test", outcome: "refused", responseClass: "feature_disabled" });
    expect(calls).toHaveLength(0);
    expect(harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookTestRefused }).at(-1)?.reason).toBe("feature_disabled");
  });

  it("delivers a signed test event, rate limits the next one and never exposes the secret or the full URL", async () => {
    harness = await createRuntimeHttpHarness();
    const calls = armOutbound(204);
    await openFlag();
    const { endpointId, secret } = await createEndpoint();

    const response = await sendTest(endpointId, { reason: REASON });
    expect(response.status).toBe(200);
    const raw = await response.text();
    const result = JSON.parse(raw) as PartnerWebhookTestResponse;
    expect(result).toMatchObject({ endpointId, eventType: "webhook.test", outcome: "delivered", responseClass: "2xx" });
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain(HOOK_URL);
    expect(raw).not.toContain("hooks.partner.example");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(HOOK_URL);
    const headers = calls[0]!.headers;
    const signature = headers.get("X-AssurMatch-Signature") ?? "";
    expect(signature).toMatch(/^v1=/);
    const envelope = JSON.parse(calls[0]!.body) as { id: string; type: string; data: unknown };
    expect(envelope).toMatchObject({ id: result.eventId, type: "webhook.test", data: { test: true } });
    expect(verifyWebhookSignature({
      secret,
      timestamp: headers.get("X-AssurMatch-Timestamp") ?? "",
      eventId: headers.get("X-AssurMatch-Event-Id") ?? "",
      idempotencyKey: headers.get("X-AssurMatch-Idempotency-Key") ?? "",
      payload: envelope,
      signature
    })).toBe(true);

    const audit = harness.runtime.audit.writer.search({ action: PartnerIntegrationAuditActions.webhookTestSent });
    expect(audit.at(-1)).toMatchObject({ result: "success" });
    expect(JSON.stringify(audit)).not.toContain(secret);
    expect(JSON.stringify(audit)).not.toContain(signature);

    const second = await readJson<PartnerWebhookTestResponse>(await sendTest(endpointId, { reason: REASON }));
    expect(second).toMatchObject({ outcome: "refused", responseClass: "rate_limited" });
    expect(calls).toHaveLength(1);
  });

  it("reports a failed delivery when the partner answers with an error and a 404 for an unknown endpoint", async () => {
    harness = await createRuntimeHttpHarness();
    const calls = armOutbound(500);
    await openFlag();
    const { endpointId } = await createEndpoint();

    const failed = await readJson<PartnerWebhookTestResponse>(await sendTest(endpointId, { reason: REASON }));
    expect(failed).toMatchObject({ outcome: "failed", responseClass: "5xx" });
    expect(calls).toHaveLength(1);

    const unknown = await sendTest("00000000-0000-4000-8000-0000000000bb", { reason: REASON });
    expect(unknown.status).toBe(404);
    expect((await sendTest("not-a-uuid", { reason: REASON })).status).toBe(400);
    expect(calls).toHaveLength(1);
  });
});
