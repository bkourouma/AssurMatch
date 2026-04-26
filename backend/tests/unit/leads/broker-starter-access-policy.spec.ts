import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";

const starterActor: ActorContext = { actorId: "broker-user", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

const assignment: LeadAssignmentRecord = {
  id: "lead-a",
  quoteRequestId: "quote-a",
  partnerTenantId: "broker-a",
  status: "assigned",
  assignedAt: new Date("2026-04-25T00:00:00.000Z"),
  assignmentReason: "routing",
  createdAt: new Date("2026-04-25T00:00:00.000Z"),
  updatedAt: new Date("2026-04-25T00:00:00.000Z")
};

describe("BrokerStarterAccessPolicy", () => {
  it("allows assigned Starter brokers with MFA and refuses cross-tenant access", async () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerStarterAccessPolicy(audit);

    expect(() => policy.assertLeadAccess(starterActor, assignment)).not.toThrow();
    expect(() => policy.assertLeadAccess({ ...starterActor, partnerTenantId: "broker-b" }, assignment)).toThrow("Lead access denied");
    expect(audit.search({ action: "broker_starter.cross_tenant_refused", result: "refused" })).toHaveLength(1);
  });

  it("requires MFA and an explicit export permission", async () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerStarterAccessPolicy(audit);

    expect(() => policy.assertPortalAccess({ ...starterActor, mfaVerified: false })).toThrow("Starter broker access denied");
    expect(() => policy.assertExportAccess({ ...starterActor, roles: ["broker_agent"] })).toThrow("Lead export denied");
    expect(audit.search({ action: "broker_starter.export_refused", result: "refused" })).toHaveLength(1);
  });

  it("blocks Pro capabilities for Starter plan", async () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerStarterAccessPolicy(audit);

    expect(() => policy.assertProCapabilityBlocked(starterActor, "crm_kanban")).toThrow("Le plan Starter ne comprend pas le CRM complet");
    expect(audit.search({ action: "broker_starter.pro_feature_blocked", result: "refused" })).toHaveLength(1);
  });
});
