import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAlertsListResponse } from "../../../../packages/shared/contracts/admin-alerts.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

// Lot 12 (spec 077 FR-005): a dead-lettered SMS raises a critical alert in the admin alerts center.
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };
const TENANT = "00000000-0000-4000-8000-00000000d001";
const broker: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };
const PHONE = "+2250102030405";
const ENV_KEYS = ["ASSURMATCH_SMS_PROVIDER", "ASSURMATCH_SMS_API_KEY", "ASSURMATCH_SMS_API_URL", "ASSURMATCH_SMS_SENDER"] as const;

describe("channel dead letter admin alert runtime HTTP (lot 12)", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const realFetch = globalThis.fetch;
  let externalCalls: number;

  beforeEach(() => {
    externalCalls = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return realFetch(input as string, init);
      externalCalls += 1;
      return new Response(JSON.stringify({ error: "down" }), { status: 500, headers: { "content-type": "application/json" } });
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

  it("raises one critical channel_dead_letter alert without any phone number or message body", async () => {
    process.env.ASSURMATCH_SMS_PROVIDER = "http";
    process.env.ASSURMATCH_SMS_API_KEY = "sms-test-key-never-in-repo";
    process.env.ASSURMATCH_SMS_API_URL = "https://sms-gateway.example.test/v1/messages";
    process.env.ASSURMATCH_SMS_SENDER = "AssurMatch";
    harness = await createRuntimeHttpHarness();
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "sms_enabled", scopeType: "global", value: true, reason: "pilot" }, superAdmin, { reference: "TEST-LOT12-POLICY", approvedBy: "compliance" });
    expect((await harness.request("/broker/notifications/preferences", { method: "PUT", headers: { ...actorHeaders(broker), ...json }, body: JSON.stringify({ sms: true, reason: "Le cabinet choisit le SMS" }) })).status).toBe(200);

    expect((await harness.request("/admin/messaging/test", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: JSON.stringify({ channel: "sms", recipient: PHONE, scopeId: TENANT, reason: "smoke test" }) })).status).toBeLessThan(300);
    const dispatch = harness.runtime.notifications.dispatch;
    const later = Date.now() + 24 * 60 * 60 * 1000;
    expect(await dispatch.processDueOutbox({ now: new Date(later) })).toMatchObject({ retryable: 1 });
    expect(await dispatch.processDueOutbox({ now: new Date(later + 2 * 60 * 60 * 1000) })).toMatchObject({ retryable: 1 });
    expect(await dispatch.processDueOutbox({ now: new Date(later + 4 * 60 * 60 * 1000) })).toMatchObject({ deadLetter: 1 });
    expect(externalCalls).toBe(4);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const response = await harness.request("/admin/alerts?type=channel_dead_letter", { headers: actorHeaders(support) });
    expect(response.status).toBe(200);
    const raw = JSON.stringify(await response.clone().json());
    const listed = await readJson<AdminAlertsListResponse>(response);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ type: "channel_dead_letter", severity: "critical", status: "open", label: "Message SMS/WhatsApp en echec definitif", details: { channel: "sms", attempts: 4, errorClass: "http_500" } });
    expect(raw).not.toContain("0102030405");
    expect(raw).not.toContain("sms-test-key-never-in-repo");
  });
});
