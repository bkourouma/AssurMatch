import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmConnectorMutationResponseSchema } from "../../../../packages/shared/contracts/crm-connector.contracts";
import { messagingDeliverySchema, notificationPreferencesSchema } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { featureFlagMutationRefusedAction } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";
import { RapidDisableService } from "../../../src/modules/feature-flags/rapid-disable.service";
import { verifyWebhookSignature } from "../../../src/modules/partner-integrations/webhook-signature.service";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 10 (spec 076): channels and integrations through the real runtime, with simulated providers.
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };
const TENANT = "00000000-0000-4000-8000-00000000d001";
const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };
const PHONE = "+2250102030405";
const ENV_KEYS = ["ASSURMATCH_SMS_PROVIDER", "ASSURMATCH_SMS_API_KEY", "ASSURMATCH_SMS_API_URL", "ASSURMATCH_SMS_SENDER", "ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED"] as const;

interface ExternalCall {
  url: string;
  init: RequestInit;
}

describe("channels and integrations runtime HTTP (lot 10)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const realFetch = globalThis.fetch;
  let external: ExternalCall[];
  let externalStatuses: number[];

  beforeEach(() => {
    external = [];
    externalStatuses = [];
    // Only calls to the simulated external providers are intercepted; the local test server is untouched.
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return realFetch(input as string, init);
      external.push({ url, init: init ?? {} });
      const status = externalStatuses.shift() ?? 200;
      return new Response(JSON.stringify({ sid: "SM-simulated" }), { status, headers: { "content-type": "application/json" } });
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness?.close();
    harness = undefined;
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  function configureSms(): void {
    process.env.ASSURMATCH_SMS_PROVIDER = "http";
    process.env.ASSURMATCH_SMS_API_KEY = "sms-test-key-never-in-repo";
    process.env.ASSURMATCH_SMS_API_URL = "https://sms-gateway.example.test/v1/messages";
    process.env.ASSURMATCH_SMS_SENDER = "AssurMatch";
  }

  async function openFlag(key: string): Promise<void> {
    await harness?.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-LOT10-POLICY", approvedBy: "compliance" });
  }

  async function testDispatch() {
    return messagingDeliverySchema.parse(await harness?.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "sms", recipient: PHONE, scopeId: TENANT, reason: "smoke test" }) }).then(readJson));
  }

  async function optIn(sms: boolean): Promise<void> {
    notificationPreferencesSchema.parse(await readJson(await (harness as RuntimeHttpHarness).request("/broker/notifications/preferences", { method: "PUT", headers: { ...actorHeaders(broker), ...json }, body: JSON.stringify({ sms, reason: "Le cabinet choisit le SMS" }) })));
  }

  it("keeps the three channel flags closed and refuses to open them over HTTP", async () => {
    harness = await createRuntimeHttpHarness();
    for (const key of ["sms_enabled", "whatsapp_enabled", "crm_connector_enabled"]) {
      expect(harness.runtime.featureFlags.service.isEnabled(key)).toBe(false);
      const flag = await new RapidDisableService(harness.runtime.featureFlags.service).disable("global", undefined, key, "seed protected disabled flag", superAdmin);
      const response = await harness.request(`/admin/feature-flags/${flag.id}`, { method: "PATCH", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ value: true, reason: "attempt protected activation" }) });
      expect(response.status).toBe(403);
      expect(harness.runtime.featureFlags.service.isEnabled(key)).toBe(false);
    }
    expect(harness.runtime.audit.writer.search({ action: featureFlagMutationRefusedAction, result: "refused" })).toHaveLength(3);
  });

  it("sends nothing without consent, retries a transient failure once the recipient opted in, then cancels when consent is withdrawn", async () => {
    configureSms();
    harness = await createRuntimeHttpHarness();
    await openFlag("sms_enabled");

    // Consent absent: refused, the provider is never called.
    expect(await testDispatch()).toMatchObject({ status: "refused", reason: "recipient_opted_out" });
    expect(external).toHaveLength(0);

    // Opted in, provider answers 503: a retry is scheduled, no number leaks.
    await optIn(true);
    externalStatuses.push(503);
    const failed = await testDispatch();
    expect(failed).toMatchObject({ status: "failed", reason: "retry_scheduled:http_503", provider: "http-sms" });
    expect(external).toHaveLength(1);
    expect(external[0]?.url).toBe("https://sms-gateway.example.test/v1/messages");
    const queue = await readJson<Array<{ status: string; attemptCount: number }>>(await harness.request("/admin/messaging/outbox", { headers: actorHeaders(support) }));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ status: "retryable", attemptCount: 1 });
    expect(JSON.stringify(queue)).not.toContain("0102030405");

    // Not yet due: nothing happens. Due: the retry succeeds.
    expect(await harness.runtime.notifications.dispatch.processDueOutbox({ now: new Date() })).toMatchObject({ attempted: 0 });
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    expect(await harness.runtime.notifications.dispatch.processDueOutbox({ now: later })).toMatchObject({ attempted: 1, sent: 1 });
    expect(external).toHaveLength(2);
    expect(await harness.runtime.notifications.dispatch.processDueOutbox({ now: later })).toMatchObject({ attempted: 0 });

    // A second failure, then consent withdrawn before the retry: cancelled, nothing sent.
    externalStatuses.push(500);
    await testDispatch();
    expect(external).toHaveLength(3);
    await optIn(false);
    expect(await harness.runtime.notifications.dispatch.processDueOutbox({ now: later })).toMatchObject({ cancelled: 1, sent: 0 });
    expect(external).toHaveLength(3);

    expect(JSON.stringify(harness.runtime.audit.writer.search({}))).not.toContain("0102030405");
    expect(JSON.stringify(harness.runtime.audit.writer.search({}))).not.toContain("sms-test-key-never-in-repo");
  });

  it("keeps the CRM connector closed by default and forwards a minimised, signed payload once opened", async () => {
    process.env.ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const crmUrl = "https://crm.example.test/hooks/assurmatch";
    await harness.runtime.partnerIntegrations.service.createWebhookAllowlistEntry(superAdmin, { partnerTenantId: seed.partner.id, origin: "https://crm.example.test", reason: "CRM connector approved" });

    const created = crmConnectorMutationResponseSchema.parse(await harness.request("/admin/crm-connectors", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ partnerTenantId: seed.partner.id, name: "CRM cabinet", url: crmUrl, eventTypes: ["lead.assigned"], authHeaderName: "X-Api-Key", authHeaderValue: "crm-key-secret", reason: "Pilot CRM" }) }).then(readJson));
    expect(created.connector.status).toBe("disabled");
    expect(created.signingSecret).toMatch(/^crmsec_/);
    const listing = JSON.stringify(await readJson(await harness.request("/admin/crm-connectors", { headers: actorHeaders(superAdmin) })));
    expect(listing).not.toContain("crm-key-secret");
    expect(listing).not.toContain(created.signingSecret as string);
    expect((await harness.request("/admin/crm-connectors", { headers: actorHeaders(support) })).status).toBe(403);

    const activate = await harness.request(`/admin/crm-connectors/${created.connector.id}`, { method: "PATCH", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ status: "active", reason: "Go pilot" }) });
    expect(activate.status).toBe(200);

    const assign = () => harness?.runtime.leads.assignments.create({
      quoteRequestId: `q-crm-${crypto.randomUUID()}`,
      partnerTenantId: seed.partner.id,
      assignmentReason: "routing",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "ama@example.test", phone: PHONE },
      answers: { vehicle_use: "prive" }
    }, superAdmin);

    // Flag closed (default): nothing is prepared, nothing is sent.
    await assign();
    const closedRun = await harness.runtime.crmConnector.service.processDue({ now: new Date(Date.now() + 3_600_000) });
    expect(closedRun.attempted).toBe(0);
    expect(external).toHaveLength(0);
    expect((await readJson<{ items: unknown[] }>(await harness.request("/admin/crm-connectors/deliveries", { headers: actorHeaders(superAdmin) }))).items).toHaveLength(0);

    // Flag opened by the compliance policy: one delivery, signed, minimised.
    await openFlag("crm_connector_enabled");
    await assign();
    const processedAt = new Date(Date.now() + 3_600_000);
    const run = await harness.runtime.crmConnector.service.processDue({ now: processedAt });
    expect(run).toMatchObject({ attempted: 1, delivered: 1 });
    expect(external).toHaveLength(1);
    const call = external[0] as ExternalCall;
    expect(call.url).toBe(crmUrl);
    const headers = call.init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("crm-key-secret");
    const body = String(call.init.body);
    expect(body).not.toContain("ama@example.test");
    expect(body).not.toContain("0102030405");
    expect(verifyWebhookSignature({
      secret: created.signingSecret as string,
      timestamp: headers["X-AssurMatch-Timestamp"] as string,
      eventId: headers["X-AssurMatch-Event-Id"] as string,
      idempotencyKey: headers["X-AssurMatch-Idempotency-Key"] as string,
      payload: body,
      signature: headers["X-AssurMatch-Signature"] as string,
      now: processedAt
    })).toBe(true);
  });
});
