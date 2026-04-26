import { afterEach, describe, expect, it } from "vitest";
import { signActorToken } from "../../src/modules/auth/http-auth-token.service";
import { actorHeaders, createRuntimeHttpHarness, simulationActorHeaders, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("runtime HTTP auth RBAC and validation boundaries", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;
  const previousHeaderMode = process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS;

  const starter = { actorId: "starter", roles: ["broker_owner_starter" as const], partnerTenantId: "broker-a", partnerPlan: "starter" as const, mfaVerified: true };
  const pro = { actorId: "pro", roles: ["broker_owner_pro" as const], partnerTenantId: "broker-a", partnerPlan: "pro" as const, mfaVerified: true };
  const brokerReadOnly = { actorId: "readonly", roles: ["broker_read_only" as const], partnerTenantId: "broker-a", partnerPlan: "pro" as const, mfaVerified: true };
  const superAdmin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true };
  const complianceAdmin = { actorId: "compliance", roles: ["compliance_admin" as const], mfaVerified: true };
  const supportAdmin = { actorId: "support", roles: ["support_admin" as const], mfaVerified: true };
  const contentAdmin = { actorId: "content", roles: ["content_admin" as const], mfaVerified: true };

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
    process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS = previousHeaderMode;
  });

  it("refuses protected broker routes without a verified bearer token", async () => {
    process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS = "false";
    harness = await createRuntimeHttpHarness();

    expect((await harness.request("/broker/starter/leads")).status).toBe(401);
    expect((await harness.request("/broker/starter/leads", { headers: simulationActorHeaders(superAdmin) })).status).toBe(401);
    expect((await harness.request("/broker/starter/leads", { headers: simulationActorHeaders(starter) })).status).toBe(401);
  });

  it("accepts signed broker tokens and rejects invalid expired or missing-MFA tokens", async () => {
    harness = await createRuntimeHttpHarness();
    const noMfa = { ...starter, mfaVerified: false };
    const expired = signActorToken(starter, -1);

    expect((await harness.request("/broker/starter/leads", { headers: actorHeaders(starter) })).status).toBe(200);
    expect((await harness.request("/broker/starter/leads", { headers: { authorization: "Bearer invalid.token.value" } })).status).toBe(401);
    expect((await harness.request("/broker/starter/leads", { headers: { authorization: `Bearer ${expired}` } })).status).toBe(401);
    expect((await harness.request("/broker/starter/leads", { headers: actorHeaders(noMfa) })).status).toBe(403);
  });

  it("allows test simulation headers only when explicitly enabled in test mode", async () => {
    harness = await createRuntimeHttpHarness();
    process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS = "false";
    expect((await harness.request("/broker/starter/leads", { headers: simulationActorHeaders(starter) })).status).toBe(401);

    process.env.ASSURMATCH_ALLOW_TEST_AUTH_HEADERS = "true";
    expect((await harness.request("/broker/starter/leads", { headers: simulationActorHeaders(starter) })).status).toBe(200);
  });

  it("enforces CRM feature flag and plan from verified token claims", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "false";
    harness = await createRuntimeHttpHarness();
    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(starter) })).status).toBe(403);
    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(pro) })).status).toBe(403);

    await harness.close();
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(starter) })).status).toBe(403);
    expect((await harness.request("/broker/crm/leads", { headers: actorHeaders(pro) })).status).toBe(200);
  });

  it("enforces admin RBAC per route", async () => {
    harness = await createRuntimeHttpHarness();

    expect((await harness.request("/admin/audit-logs")).status).toBe(401);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(starter) })).status).toBe(403);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(brokerReadOnly) })).status).toBe(403);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(contentAdmin) })).status).toBe(403);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(superAdmin) })).status).toBe(200);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(complianceAdmin) })).status).toBe(200);
    expect((await harness.request("/admin/audit-logs", { headers: actorHeaders(supportAdmin) })).status).toBe(200);
    expect((await harness.request("/admin/system/health", { headers: actorHeaders(complianceAdmin) })).status).toBe(403);
    expect((await harness.request("/admin/system/health", { headers: actorHeaders(superAdmin) })).status).toBe(200);
  });

  it("rejects invalid HTTP DTOs params and query at the controller boundary", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();

    const invalidQuote = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ countryCode: "CI" })
    });
    expect(invalidQuote.status).toBe(400);

    expect((await harness.request("/broker/starter/leads/not-a-uuid", { headers: actorHeaders(starter) })).status).toBe(400);
    expect((await harness.request("/broker/starter/leads?page=0", { headers: actorHeaders(starter) })).status).toBe(400);

    const leadId = crypto.randomUUID();
    const invalidCrmStatus = await harness.request(`/broker/crm/leads/${leadId}/status`, {
      method: "POST",
      headers: { ...actorHeaders(pro), "content-type": "application/json" },
      body: JSON.stringify({ status: "perdu" })
    });
    expect(invalidCrmStatus.status).toBe(400);

    const invalidStarterAction = await harness.request(`/broker/starter/leads/${leadId}/reject`, {
      method: "POST",
      headers: { ...actorHeaders(starter), "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(invalidStarterAction.status).toBe(400);

    const invalidLogin = await harness.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-email" })
    });
    expect(invalidLogin.status).toBe(400);
  });
});

