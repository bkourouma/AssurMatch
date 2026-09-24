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

  it("uses login-issued bearer tokens for /auth/me and protected broker routes", async () => {
    harness = await createRuntimeHttpHarness();
    const adminActor = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const brokerUser = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "broker-login@example.com",
      displayName: "Broker Login",
      roles: ["broker_owner_starter"],
      partnerTenantId: "00000000-0000-4000-8000-0000000000b1",
      scopes: { countryIds: [], productIds: [] }
    }, adminActor);
    brokerUser.mfaStatus = "verified";
    await harness.runtime.users.service.update(brokerUser);
    await harness.runtime.users.service.setPassword(brokerUser.id, await harness.runtime.auth.passwordHashing.hash("very-secure-pass"));

    const login = await harness.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "broker-login@example.com", password: "very-secure-pass" })
    });
    expect(login.ok).toBe(true);
    const session = await login.json() as { accessToken: string };
    expect(session.accessToken).toBeTruthy();

    const bearerHeaders = { authorization: `Bearer ${session.accessToken}` };
    const me = await harness.request("/auth/me", { headers: bearerHeaders });
    expect(me.status).toBe(200);
    expect((await me.json() as { actorId: string }).actorId).toBe(brokerUser.id);
    expect((await harness.request("/broker/starter/leads", { headers: bearerHeaders })).status).toBe(200);
    expect((await harness.request("/admin/audit-logs", { headers: bearerHeaders })).status).toBe(403);
  });

  it("uses login-issued broker plan and scope claims for CRM policies", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    const brokerTenantId = "00000000-0000-4000-8000-0000000000b2";
    const countryId = "00000000-0000-4000-8000-0000000000c2";
    const productId = "00000000-0000-4000-8000-0000000000d2";
    const adminActor = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const brokerUser = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "broker-crm-login@example.com",
      displayName: "Broker CRM Login",
      roles: ["broker_owner_pro"],
      partnerTenantId: brokerTenantId,
      scopes: { countryIds: [countryId], productIds: [productId] }
    }, adminActor);
    await harness.runtime.users.service.update({ ...brokerUser, partnerPlan: "pro", mfaStatus: "verified" });
    await harness.runtime.users.service.setPassword(brokerUser.id, await harness.runtime.auth.passwordHashing.hash("very-secure-pass"));

    const login = await harness.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "broker-crm-login@example.com", password: "very-secure-pass" })
    });
    expect(login.ok).toBe(true);
    const session = await login.json() as { accessToken: string };
    const bearerHeaders = { authorization: `Bearer ${session.accessToken}` };
    const me = await harness.request("/auth/me", { headers: bearerHeaders });

    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      actorId: brokerUser.id,
      partnerTenantId: brokerTenantId,
      partnerPlan: "pro",
      countryScopes: [countryId],
      productScopes: [productId]
    });
    expect((await harness.request("/broker/crm/leads", { headers: bearerHeaders })).status).toBe(200);
  });

  it("uses login-issued admin scope claims for scoped admin user lists", async () => {
    harness = await createRuntimeHttpHarness();
    const countryId = "00000000-0000-4000-8000-0000000000a2";
    const otherCountryId = "00000000-0000-4000-8000-0000000000a3";
    const productId = "00000000-0000-4000-8000-0000000000e2";
    const adminActor = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const scopedAdmin = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "admin-pays-login@example.com",
      displayName: "Admin Pays Login",
      roles: ["admin_pays"],
      scopes: { countryIds: [countryId], productIds: [productId] }
    }, adminActor);
    await harness.runtime.users.service.update({ ...scopedAdmin, mfaStatus: "verified" });
    await harness.runtime.users.service.setPassword(scopedAdmin.id, await harness.runtime.auth.passwordHashing.hash("very-secure-pass"));
    const visibleUser = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "country-visible@example.com",
      displayName: "Country Visible",
      roles: ["support_admin"],
      scopes: { countryIds: [countryId], productIds: [] }
    }, adminActor);
    const hiddenUser = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "country-hidden@example.com",
      displayName: "Country Hidden",
      roles: ["support_admin"],
      scopes: { countryIds: [otherCountryId], productIds: [] }
    }, adminActor);

    const login = await harness.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin-pays-login@example.com", password: "very-secure-pass" })
    });
    expect(login.ok).toBe(true);
    const session = await login.json() as { accessToken: string };
    const bearerHeaders = { authorization: `Bearer ${session.accessToken}` };
    const me = await harness.request("/auth/me", { headers: bearerHeaders });
    expect(await me.json()).toMatchObject({ actorId: scopedAdmin.id, countryScopes: [countryId], productScopes: [productId] });

    const listed = await harness.request("/admin/users", { headers: bearerHeaders });
    expect(listed.status).toBe(200);
    const ids = ((await listed.json()) as Array<{ id: string }>).map((user) => user.id);

    expect(ids).toContain(scopedAdmin.id);
    expect(ids).toContain(visibleUser.id);
    expect(ids).not.toContain(hiddenUser.id);
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

  it("refuses brokers from issuing admin password reset tokens", async () => {
    harness = await createRuntimeHttpHarness();

    const adminActor = { actorId: "seed-admin", roles: ["super_admin" as const], mfaVerified: true };
    const user = await harness.runtime.users.service.create({
      id: crypto.randomUUID(),
      email: "rbac-reset-denied@example.com",
      displayName: "RBAC Reset Denied",
      roles: ["support_admin"],
      scopes: { countryIds: [], productIds: [] }
    }, adminActor);

    const response = await harness.request(`/admin/users/${user.id}/password-reset`, {
      method: "POST",
      headers: { ...actorHeaders(starter), "content-type": "application/json" },
      body: JSON.stringify({ reason: "Broker must be denied from issuing password resets" })
    });

    expect(response.status).toBe(403);
    const payload = await response.json() as { message?: string };
    expect(payload).toMatchObject({ message: expect.stringMatching(/rbac/i) });
    expect(JSON.stringify(payload)).not.toContain("token");

    expect((await harness.runtime.users.service.require(user.id)).passwordResetTokenHash).toBeUndefined();
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
