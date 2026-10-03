import { afterEach, describe, expect, it } from "vitest";
import type { PartnerUserInviteResult } from "../../../src/modules/partners/partner-admin.service";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, createPartner, prepareActivatablePartner, seedOnboardingRuntime, superAdmin, support } from "./partner-admin-http-helpers";

function userPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${Math.random().toString(36).slice(2, 8)}@courtier.example`,
    displayName: "Utilisateur Courtier",
    roles: ["broker_agent"],
    scopes: { countryIds: [], productIds: [] },
    reason: "creation utilisateur courtier",
    ...overrides
  };
}

describe("spec 051 partner users runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses POST /admin/users when the user and the partner do not match (FR-019)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id);

    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["broker role without partner", userPayload(), "PARTNER_USER_INVALID"],
      ["unknown partner", userPayload({ partnerTenantId: "00000000-0000-4000-8000-00000000dead" }), "PARTNER_USER_INVALID"],
      ["admin role with a partner", userPayload({ roles: ["support_admin"], partnerTenantId: partner.id }), "PARTNER_USER_INVALID"]
    ];
    for (const [label, body, code] of cases) {
      const response = await call(harness, superAdmin, "POST", "/admin/users", body);
      expect(response.status, label).toBe(422);
      expect(await response.json(), label).toMatchObject({ code });
    }

    await harness.runtime.partners.service.changeStatus(partner.id, "retired", "resiliation du partenariat", superAdmin);
    const retired = await call(harness, superAdmin, "POST", "/admin/users", userPayload({ partnerTenantId: partner.id }));
    expect(retired.status).toBe(422);
    expect(await retired.json()).toMatchObject({ code: "PARTNER_RETIRED" });

    const refusals = harness.runtime.audit.writer.search({ action: "user.created" }).filter((entry) => entry.result === "refused");
    expect(refusals.map((entry) => entry.context.refusal)).toEqual(["broker_role_without_partner", "partner_not_found", "admin_role_with_partner", "partner_retired"]);
    // A consistent request still works.
    const other = await createPartner(harness, superAdmin, seed.country.id);
    expect((await call(harness, superAdmin, "POST", "/admin/users", userPayload({ partnerTenantId: other.id }))).status).toBe(201);
  });

  it("invites users from the partner page with the owner role of the plan (FR-018)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id, { plan: "pro" });
    const path = `/admin/partners/${partner.id}/users`;

    const mismatch = await call(harness, superAdmin, "POST", path, { email: "owner@courtier.ci", displayName: "Owner Courtier", role: "broker_owner_starter", reason: "invitation du proprietaire" });
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({ code: "PARTNER_USER_INVALID" });
    expect((await call(harness, support, "POST", path, { email: "owner@courtier.ci", displayName: "Owner Courtier", role: "broker_owner_pro", reason: "invitation du proprietaire" })).status).toBe(403);
    expect((await call(harness, adminPays(seed.senegal.id), "POST", path, { email: "owner@courtier.ci", displayName: "Owner Courtier", role: "broker_owner_pro", reason: "invitation du proprietaire" })).status).toBe(403);

    const invited = await callJson<PartnerUserInviteResult>(harness, adminPays(seed.country.id), "POST", path, { email: "owner@courtier.ci", displayName: "Owner Courtier", role: "broker_owner_pro", reason: "invitation du proprietaire" }, 201);
    expect(invited.user).toMatchObject({ email: "owner@courtier.ci", roles: ["broker_owner_pro"], status: "invited" });
    expect(invited.emailStatus).toBeDefined();
    const stored = await harness.runtime.users.service.require(invited.user.id);
    expect(stored.partnerTenantId).toBe(partner.id);
    expect(stored.passwordResetTokenHash).toBeDefined();
    expect(harness.runtime.audit.writer.search({ action: "partner.user_invited", targetId: partner.id })).toHaveLength(1);

    // The owner condition of the activation passes.
    expect(await harness.runtime.partnerAdmin.readiness(partner.id)).toMatchObject({ ownerUser: true });
    await callJson(harness, compliance, "POST", path, { email: "agent@courtier.ci", displayName: "Agent Courtier", role: "broker_agent", reason: "invitation d'un conseiller" }, 201);
  });

  it("refuses an invitation to a retired partner", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const { partner } = await prepareActivatablePartner(harness, seed.country.id, seed.product.id);
    await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/status`, { status: "retired", reason: "resiliation du partenariat" }, 200);

    const response = await call(harness, superAdmin, "POST", `/admin/partners/${partner.id}/users`, { email: "late@courtier.ci", displayName: "Trop Tard", role: "broker_agent", reason: "invitation apres resiliation" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "PARTNER_RETIRED" });
  });
});
