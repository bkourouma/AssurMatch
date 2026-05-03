import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerDashboardService } from "../../../src/modules/dashboards/broker-dashboard.service";
import { DashboardsAccessPolicy } from "../../../src/modules/dashboards/dashboards-access-policy";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";

const tenantId = "00000000-0000-4000-8000-000000000101";
const advisorId = "00000000-0000-4000-8000-000000000201";

function assignment(overrides: Partial<LeadAssignmentRecord>): LeadAssignmentRecord {
  const assignedAt = new Date("2026-04-10T10:00:00.000Z");
  return {
    id: crypto.randomUUID(),
    quoteRequestId: crypto.randomUUID(),
    partnerTenantId: tenantId,
    status: "assigned",
    assignedAt,
    assignmentReason: "routing",
    countryCode: "CI",
    productKey: "auto",
    publicReference: "REF",
    contact: {},
    answers: {},
    createdAt: assignedAt,
    updatedAt: assignedAt,
    ...overrides
  };
}

function makeService(records: LeadAssignmentRecord[], config = { brokerDashboardEnabled: true, brokerCrmEnabled: false }) {
  const audit = new AuditLogWriter();
  return new BrokerDashboardService({
    access: new DashboardsAccessPolicy(audit),
    assignments: { list: async () => records } as never,
    partnerLicenses: {
      listForPartner: async () => [{
        id: "license-1",
        partnerTenantId: tenantId,
        countryId: "country-ci",
        licenseNumber: "LIC-1",
        issuingAuthority: "Regulator",
        productIds: ["product-auto"],
        status: "valid",
        effectiveDate: "2026-01-01",
        expirationDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      }]
    } as never,
    countries: { listAdmin: async () => [{ id: "country-ci", isoCode: "CI" }] } as never,
    crmActivity: {
      tasksForLead: async () => [{ dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }],
      remindersForLead: async () => [{ remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }],
      pipelineHistoryForLead: async () => [{ occurredAt: "2026-04-10T11:00:00.000Z" }]
    } as never,
    config: () => config
  });
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "broker-owner",
    roles: ["broker_owner_starter"],
    partnerTenantId: tenantId,
    partnerPlan: "starter",
    mfaVerified: true,
    ...overrides
  } as ActorContext;
}

describe("BrokerDashboardService", () => {
  it("returns Starter sections, status counts, first-action average and license alerts", async () => {
    const service = makeService([
      assignment({ status: "accepted", seenAt: new Date("2026-04-10T10:30:00.000Z") }),
      assignment({ status: "rejected", productKey: "home", countryCode: "SN" }),
      assignment({ status: "disputed" })
    ]);

    const dashboard = await service.dashboard(actor(), {});

    expect(dashboard.plan).toBe("starter");
    expect(dashboard.starter).toMatchObject({ received: 3, accepted: 1, rejected: 1, disputed: 1 });
    expect(dashboard.starter.averageFirstActionMinutes).toBe(30);
    expect(dashboard.starter.byProduct).toEqual(expect.arrayContaining([{ productKey: "auto", total: 2 }, { productKey: "home", total: 1 }]));
    expect(dashboard.starter.byCountry).toEqual(expect.arrayContaining([{ countryCode: "CI", total: 2 }, { countryCode: "SN", total: 1 }]));
    expect(dashboard.licenseAlerts[0]).toMatchObject({ partnerTenantId: tenantId, countryCode: "CI", status: "expiring_soon" });
    expect(dashboard.crm).toBeUndefined();
  });

  it("includes CRM aggregates for Pro when the CRM flag is enabled", async () => {
    const service = makeService([
      assignment({ status: "accepted", crmStatus: "contacte", assignedAdvisorId: advisorId })
    ], { brokerDashboardEnabled: true, brokerCrmEnabled: true });

    const dashboard = await service.dashboard(actor({ roles: ["broker_owner_pro"], partnerPlan: "pro" }), { agentId: advisorId });

    expect(dashboard.crm).toMatchObject({
      pipeline: [{ status: "contacte", total: 1 }],
      byAssignedAdvisor: [{ advisorId, total: 1 }],
      upcomingTasks: 1,
      upcomingReminders: 1,
      averageReceptionToFirstActivityMinutes: 60
    });
  });

  it("refuses Starter agent filter tampering before returning aggregates", async () => {
    const service = makeService([assignment({ assignedAdvisorId: advisorId })]);
    await expect(service.dashboard(actor(), { agentId: advisorId })).rejects.toThrow(/starter_agent_filter_forbidden/);
  });
});
