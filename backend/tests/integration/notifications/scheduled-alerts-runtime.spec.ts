import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import type { ScheduledAlertSources } from "../../../src/modules/notifications/scheduled-alerts.service";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const admin: ActorContext = { actorId: "admin-069", roles: ["super_admin"], mfaVerified: true };

function sourcesOf(harness: RuntimeHttpHarness): ScheduledAlertSources {
  return (harness.runtime.scheduledAlerts as unknown as { deps: { sources: ScheduledAlertSources } }).deps.sources;
}

describe("spec 069 scheduled alerts runtime wiring (D1, FR-008)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.close();
    harness = undefined;
  });

  async function enterprisePartner(h: RuntimeHttpHarness, name: string, slaTargetMinutes?: number) {
    const partner = await h.runtime.partners.service.create({
      legalName: name,
      primaryEmail: `${name.toLowerCase().replace(/\W+/g, "")}@broker.example`,
      primaryWhatsApp: "+2250102030405",
      status: "active",
      plan: "enterprise",
      ...(slaTargetMinutes === undefined ? {} : { slaTargetMinutes })
    }, admin);
    const owner: ActorContext = { actorId: `owner-${name}`, roles: ["broker_owner_pro"], partnerTenantId: partner.id, partnerPlan: "enterprise", mfaVerified: true };
    return { partner, owner };
  }

  it("resolves the first-action target as the minimum of the contractual and the broker target, 240 minutes by default", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    const both = await enterprisePartner(harness, "Both Targets", 120);
    const contractOnly = await enterprisePartner(harness, "Contract Only", 120);
    const neither = await enterprisePartner(harness, "Neither Target");
    await harness.runtime.enterprise.updateSla({ firstActionTargetMinutes: 90, reason: "Engagement de reactivite" }, both.owner);

    const refs = new Map<string, string>();
    for (const [index, { partner }] of [both, contractOnly, neither].entries()) {
      const assignment = await harness.runtime.leads.assignments.create({
        quoteRequestId: `q-d1-${index}`,
        partnerTenantId: partner.id,
        assignmentReason: "routing",
        countryCode: "CI",
        productKey: "auto",
        publicReference: `AM-D1-${index}`
      }, admin);
      refs.set(partner.id, assignment.id);
    }

    const leads = await sourcesOf(harness).unprocessedLeads(new Date());
    const target = (partnerId: string) => leads.find((lead) => lead.id === refs.get(partnerId))?.slaTargetMinutes;
    expect(target(both.partner.id)).toBe(90);
    expect(target(contractOnly.partner.id)).toBe(120);
    expect(target(neither.partner.id)).toBe(240);
  });

  it("asks the AI gateway once per tenant and ISO week across hourly passes", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "broker_weekly_ai_summary_enabled", scopeType: "global", value: true, reason: "spec 069 weekly summary" }, admin, { reference: "TEST-069-WEEKLY", approvedBy: "compliance" });
    const { partner } = await enterprisePartner(harness, "Weekly Tenant");
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-weekly", partnerTenantId: partner.id, assignmentReason: "routing", countryCode: "CI", productKey: "auto", publicReference: "AM-W-1" }, admin);
    const compose = vi.spyOn(harness.runtime.brokerAi, "weeklySummaryText").mockResolvedValue(undefined);

    const now = new Date();
    for (const offsetHours of [0, 1, 2]) {
      await harness.runtime.scheduledAlerts.run(new Date(now.getTime() + offsetHours * 60 * 60 * 1000));
    }
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose.mock.calls[0]?.[0]).toBe(partner.id);
  });
});
