import { describe, expect, it } from "vitest";
import type { AuditWriteInput } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { MemoryPartnerIntegrationsRepository } from "../../../src/modules/partner-integrations/partner-integrations.repository";
import { PartnerIntegrationAccessRefusedError, PartnerIntegrationsService, type PartnerIntegrationsDeps } from "../../../src/modules/partner-integrations/partner-integrations.service";
import { verifyWebhookSignature } from "../../../src/modules/partner-integrations/webhook-signature.service";

const admin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const URL_OK = "https://hooks.partner.example/assurmatch";
const REASON = "Verifier le endpoint avant activation";

interface Captured { url: string; headers: Headers; body: string; redirect: RequestRedirect | undefined }

function setup(options: { flag?: boolean; delivery?: boolean; status?: number; throwFetch?: boolean; dnsAddress?: string; allowlist?: boolean; enforceDns?: boolean } = {}) {
  const audits: AuditWriteInput[] = [];
  const captured: Captured[] = [];
  const repository = new MemoryPartnerIntegrationsRepository();
  const dns = { address: options.dnsAddress ?? "93.184.216.34" };
  const deps: PartnerIntegrationsDeps = {
    audit: {
      write: (input: AuditWriteInput) => { audits.push(input); return input; },
      writeAsync: async (input: AuditWriteInput) => { audits.push(input); return input; }
    } as never,
    featureFlags: { isEnabled: (key: string) => key === "partner_webhooks_enabled" && options.flag !== false } as never,
    partners: { require: async () => ({}), find: async () => ({ status: "active" }) } as never,
    assignments: {} as never,
    notifications: {} as never,
    repository,
    webhookDeliveryEnabled: options.delivery ?? true,
    enforceDnsValidation: options.enforceDns ?? true,
    dnsResolver: { lookup: async () => [{ address: dns.address, family: 4 }] },
    fetch: (async (url: unknown, init?: RequestInit) => {
      if (options.throwFetch) throw new Error("boom https://secret.example/?token=abc");
      captured.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body), redirect: init?.redirect });
      return { status: options.status ?? 204 } as Response;
    }) as typeof fetch
  };
  const service = new PartnerIntegrationsService(deps);
  return { service, repository, audits, captured, dns };
}

async function createEndpoint(ctx: ReturnType<typeof setup>, options: { allowlist?: boolean; url?: string; status?: "disabled" | "active" | "suspended" } = {}) {
  if (options.allowlist !== false) {
    await ctx.service.createWebhookAllowlistEntry(admin, { partnerTenantId: PARTNER_ID, origin: "https://hooks.partner.example", path: "/assurmatch", reason: "Allow-list for the test send" });
  }
  const created = await ctx.service.createWebhookEndpoint(admin, { partnerTenantId: PARTNER_ID, url: options.url ?? URL_OK, eventTypes: ["lead.assigned"], reason: "Endpoint for the test send" });
  if (options.status) await ctx.repository.updateEndpoint(created.endpoint.id, { status: options.status });
  return created;
}

describe("sendTestWebhook (Lot 7, H-08)", () => {
  it("sends a signed webhook.test event the receiver can verify, without creating a delivery", async () => {
    const ctx = setup();
    const { endpoint, signingSecret } = await createEndpoint(ctx);
    const result = await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON });
    expect(result).toMatchObject({ endpointId: endpoint.id, eventType: "webhook.test", outcome: "delivered", responseClass: "2xx" });
    expect(result.eventId).toMatch(/^evt_/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).not.toContain("hooks.partner.example");

    expect(ctx.captured).toHaveLength(1);
    const call = ctx.captured[0]!;
    expect(call.url).toBe(URL_OK);
    expect(call.redirect).toBe("manual");
    expect(call.headers.get("user-agent")).toBe("AssurMatch-Webhook/1.0");
    expect(call.headers.get("X-AssurMatch-Event-Id")).toBe(result.eventId);
    expect(JSON.parse(call.body)).toMatchObject({ id: result.eventId, type: "webhook.test", partnerTenantId: PARTNER_ID, data: { test: true } });
    expect(verifyWebhookSignature({
      secret: signingSecret,
      timestamp: call.headers.get("X-AssurMatch-Timestamp") ?? "",
      eventId: call.headers.get("X-AssurMatch-Event-Id") ?? "",
      idempotencyKey: call.headers.get("X-AssurMatch-Idempotency-Key") ?? "",
      payload: call.body,
      signature: call.headers.get("X-AssurMatch-Signature") ?? ""
    })).toBe(true);
    expect(await ctx.repository.listDeliveries()).toHaveLength(0);
  });

  it("is closed by default: flag off or delivery worker off means no network call", async () => {
    for (const options of [{ flag: false }, { delivery: false }]) {
      const ctx = setup(options);
      const { endpoint } = await createEndpoint(ctx);
      const result = await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON });
      expect(result).toMatchObject({ outcome: "refused", responseClass: "feature_disabled" });
      expect(ctx.captured).toHaveLength(0);
      expect(ctx.audits.at(-1)).toMatchObject({ action: "partner_webhook.test_refused", result: "refused", reason: "feature_disabled" });
    }
  });

  it("refuses without MFA or without the partners:update permission, with an audit entry", async () => {
    const ctx = setup();
    const { endpoint } = await createEndpoint(ctx);
    await expect(ctx.service.sendTestWebhook({ ...admin, mfaVerified: false }, endpoint.id, { reason: REASON })).rejects.toBeInstanceOf(PartnerIntegrationAccessRefusedError);
    expect(ctx.audits.at(-1)).toMatchObject({ result: "refused", reason: "mfa_required" });
    await expect(ctx.service.sendTestWebhook({ actorId: "b", roles: ["broker_read_only"], mfaVerified: true }, endpoint.id, { reason: REASON })).rejects.toBeInstanceOf(PartnerIntegrationAccessRefusedError);
    expect(ctx.audits.at(-1)).toMatchObject({ result: "refused", reason: "forbidden_role" });
    expect(ctx.captured).toHaveLength(0);
  });

  it("rejects an invalid body (reason too short)", async () => {
    const ctx = setup();
    const { endpoint } = await createEndpoint(ctx);
    await expect(ctx.service.sendTestWebhook(admin, endpoint.id, { reason: "court" })).rejects.toThrow();
    expect(ctx.captured).toHaveLength(0);
  });

  it("allows one test per endpoint every 30 seconds", async () => {
    const ctx = setup();
    const { endpoint } = await createEndpoint(ctx);
    expect((await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON })).outcome).toBe("delivered");
    const second = await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON });
    expect(second).toMatchObject({ outcome: "refused", responseClass: "rate_limited" });
    expect(ctx.captured).toHaveLength(1);
    expect(ctx.audits.at(-1)).toMatchObject({ action: "partner_webhook.test_refused", reason: "rate_limited" });
  });

  it("refuses a URL outside the allow-list or resolving to a private address, without fetching", async () => {
    const notAllowed = setup();
    const { endpoint } = await createEndpoint(notAllowed);
    await notAllowed.repository.updateEndpoint(endpoint.id, { url: "https://other.example/hook" });
    expect(await notAllowed.service.sendTestWebhook(admin, endpoint.id, { reason: REASON })).toMatchObject({ outcome: "refused", responseClass: "endpoint_policy_blocked" });
    expect(notAllowed.captured).toHaveLength(0);

    const priv = setup();
    const created = await createEndpoint(priv);
    priv.dns.address = "10.0.0.5";
    expect(await priv.service.sendTestWebhook(admin, created.endpoint.id, { reason: REASON })).toMatchObject({ outcome: "refused", responseClass: "endpoint_policy_blocked" });
    expect(priv.captured).toHaveLength(0);
  });

  it("can test a disabled endpoint but refuses a suspended one", async () => {
    const disabled = setup();
    const a = await createEndpoint(disabled);
    expect(a.endpoint.status).toBe("disabled");
    expect((await disabled.service.sendTestWebhook(admin, a.endpoint.id, { reason: REASON })).outcome).toBe("delivered");

    const suspended = setup();
    const b = await createEndpoint(suspended, { status: "suspended" });
    expect(await suspended.service.sendTestWebhook(admin, b.endpoint.id, { reason: REASON })).toMatchObject({ outcome: "refused", responseClass: "endpoint_suspended" });
    expect(suspended.captured).toHaveLength(0);
  });

  it("reports failures as failed with the response class (5xx, redirect, network)", async () => {
    for (const [options, expected] of [[{ status: 503 }, "5xx"], [{ status: 302 }, "3xx_redirect_blocked"], [{ status: 404 }, "4xx"], [{ throwFetch: true }, "network_error"]] as const) {
      const ctx = setup(options);
      const { endpoint } = await createEndpoint(ctx);
      const result = await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON });
      expect(result).toMatchObject({ outcome: "failed", responseClass: expected });
      expect(ctx.audits.at(-1)).toMatchObject({ action: "partner_webhook.test_sent", result: "failed" });
      expect(await ctx.repository.listDeliveries()).toHaveLength(0);
    }
  });

  it("never leaks the signing secret, the body or the URL query into the audit trail", async () => {
    const ctx = setup();
    const { endpoint, signingSecret } = await createEndpoint(ctx);
    await ctx.service.sendTestWebhook(admin, endpoint.id, { reason: REASON });
    const auditJson = JSON.stringify(ctx.audits.filter((entry) => entry.action.startsWith("partner_webhook.test_")));
    expect(auditJson).not.toContain(signingSecret);
    expect(auditJson).not.toContain(ctx.captured[0]!.body);
    expect(auditJson).not.toContain("hooks.partner.example");
    expect(auditJson).not.toContain(ctx.captured[0]!.headers.get("X-AssurMatch-Signature") ?? "never");
    const sent = ctx.audits.find((entry) => entry.action === "partner_webhook.test_sent");
    expect(sent).toMatchObject({ result: "success", context: { responseClass: "2xx" } });
  });
});
