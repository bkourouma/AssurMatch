import { afterEach, describe, expect, it } from "vitest";
import type { BrokerDashboardResponse } from "../../../../packages/shared/contracts/dashboard.contracts";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const tenantA = "00000000-0000-4000-8000-000000000501";
const tenantB = "00000000-0000-4000-8000-000000000502";
const advisorB = "00000000-0000-4000-8000-000000000503";

describe("dashboard tenant isolation", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("does not leak another broker tenant through forged partnerId and refuses Starter agentId filters", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "admin", roles: ["super_admin" as const], mfaVerified: true };
    const brokerA = { actorId: "broker-a", roles: ["broker_owner_starter" as const], partnerTenantId: tenantA, partnerPlan: "starter" as const, mfaVerified: true };
    const brokerB = { actorId: "broker-b", roles: ["broker_owner_starter" as const], partnerTenantId: tenantB, partnerPlan: "starter" as const, mfaVerified: true };
    await harness.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "spec 012 tenant isolation" }, admin);
    await harness.runtime.leads.assignments.create({ quoteRequestId: "qa", partnerTenantId: tenantA, assignmentReason: "routing", publicReference: "QA", countryCode: "CI", productKey: "auto" }, brokerA);
    await harness.runtime.leads.assignments.create({ quoteRequestId: "qb", partnerTenantId: tenantB, assignmentReason: "routing", publicReference: "QB", countryCode: "CI", productKey: "auto" }, brokerB);

    const forgedPartnerResponse = await harness.request(`/broker/dashboard?partnerId=${tenantB}`, { headers: actorHeaders(brokerA) });
    expect(forgedPartnerResponse.status).toBe(200);
    expect((await readJson<BrokerDashboardResponse>(forgedPartnerResponse)).starter.received).toBe(1);

    const forgedAgentResponse = await harness.request(`/broker/dashboard?agentId=${advisorB}`, { headers: actorHeaders(brokerA) });
    expect(forgedAgentResponse.status).toBe(403);
  });

  it("refuses Admin Pays partner filters outside the admin country scope", async () => {
    harness = await createRuntimeHttpHarness();
    const superAdmin = { actorId: "super-admin", roles: ["super_admin" as const], mfaVerified: true };
    const country = await harness.runtime.countries.service.create({
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    }, superAdmin);
    await harness.runtime.partners.service.create({
      id: tenantB,
      legalName: "Broker B",
      primaryEmail: "broker-b@example.test",
      primaryWhatsApp: "+2250102030405",
      status: "active",
      quotaMonthlyLeads: 10
    }, superAdmin);
    await harness.runtime.partnerLicenses.service.create({
      partnerTenantId: tenantB,
      licenseNumber: "LIC-B",
      issuingAuthority: "Regulator",
      countryId: country.id,
      productIds: [],
      status: "valid",
      effectiveDate: "2026-01-01",
      expirationDate: "2030-01-01"
    }, superAdmin);

    const adminPays = { actorId: "admin-pays", roles: ["admin_pays" as const], countryScopes: ["SN"], mfaVerified: true };
    const response = await harness.request(`/admin/dashboard?partnerId=${tenantB}`, { headers: actorHeaders(adminPays) });
    expect(response.status).toBe(403);
  });
});
